import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthResponse,
  AuthTokenResponsePassword,
  createClient,
  isAuthError,
  isAuthRetryableFetchError,
  SupabaseClient,
  User,
} from '@supabase/supabase-js';

interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
}

/** Pages of 1000 scanned at most when looking an account up by email (Supabase has no email filter). */
const EMAIL_LOOKUP_MAX_PAGES = 50;

/** About 100 years: Supabase Auth's ban_duration takes a Go duration and has no "indefinite" value. */
export const SUSPENSION_BAN_DURATION = '876000h';

/** True while the account carries a Supabase ban that has not yet expired. */
export const isBannedUser = (user: Pick<User, 'banned_until'>, now = Date.now()): boolean => {
  if (!user.banned_until) return false;
  const until = Date.parse(user.banned_until);
  return Number.isFinite(until) && until > now;
};

/**
 * True when Supabase Auth could not answer (network failure, timeout, rate limit or a 5xx), as
 * opposed to rejecting the credentials. Callers must not treat these as "signed out".
 */
export const isTransientAuthError = (error: unknown): boolean => {
  if (isAuthRetryableFetchError(error)) return true;
  if (!isAuthError(error)) return false;
  const status = error.status ?? 0;
  return status === 0 || status === 429 || status >= 500;
};

/** True when Supabase refused to create an account because the email is already registered. */
export const isEmailTakenError = (error: unknown): boolean =>
  isAuthError(error) &&
  (error.code === 'email_exists' ||
    error.code === 'user_already_exists' ||
    (error.status === 422 && /already/i.test(error.message)));

@Injectable()
export class SupabaseService {
  private readonly publicClient: SupabaseClient;
  private readonly adminClient: SupabaseClient;
  private readonly url: string;
  private readonly anonKey: string;

  constructor(config: ConfigService) {
    this.url = config.getOrThrow<string>('SUPABASE_URL');
    this.anonKey = config.getOrThrow<string>('SUPABASE_ANON_KEY');
    const clientOptions = {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    };

    this.publicClient = createClient(this.url, this.anonKey, clientOptions);
    this.adminClient = createClient(
      this.url,
      config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
      clientOptions,
    );
  }

  register(input: RegisterInput, emailRedirectTo: string): Promise<AuthResponse> {
    return this.publicClient.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo,
        data: {
          full_name: input.fullName,
        },
      },
    });
  }

  login(email: string, password: string): Promise<AuthTokenResponsePassword> {
    return this.publicClient.auth.signInWithPassword({ email, password });
  }

  refresh(refreshToken: string): Promise<AuthResponse> {
    return this.publicClient.auth.refreshSession({ refresh_token: refreshToken });
  }

  async logout(accessToken: string): Promise<void> {
    const { error } = await this.adminClient.auth.admin.signOut(accessToken, 'local');
    if (error) {
      throw error;
    }
  }

  async createAdminUser(input: RegisterInput): Promise<User> {
    const { data, error } = await this.adminClient.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName,
      },
    });
    if (error || !data.user) throw error || new Error('Supabase did not create the user');
    return data.user;
  }

  async deleteAdminUser(userId: string): Promise<void> {
    const { error } = await this.adminClient.auth.admin.deleteUser(userId);
    if (error) throw error;
  }

  /**
   * Bans the account so Supabase refuses its sign-ins and refresh tokens. Supabase Auth has no
   * "forever" value, so a suspension is a ban long enough to outlive the account.
   */
  async suspendAdminUser(userId: string): Promise<User> {
    return this.updateBan(userId, SUSPENSION_BAN_DURATION);
  }

  /** Lifts a ban set by suspendAdminUser ("none" clears banned_until). */
  async reinstateAdminUser(userId: string): Promise<User> {
    return this.updateBan(userId, 'none');
  }

  private async updateBan(userId: string, banDuration: string): Promise<User> {
    const { data, error } = await this.adminClient.auth.admin.updateUserById(userId, {
      ban_duration: banDuration,
    });
    if (error || !data.user) throw error || new Error('Supabase did not update the user');
    return data.user;
  }

  /** Returns null when the account no longer exists. */
  async getAdminUserById(userId: string): Promise<User | null> {
    const { data, error } = await this.adminClient.auth.admin.getUserById(userId);
    if (error) {
      if (error.status === 404 || error.code === 'user_not_found') return null;
      throw error;
    }
    return data.user;
  }

  /**
   * Supabase Auth has no lookup by email, so this pages through accounts (1000 per page) and
   * stops at EMAIL_LOOKUP_MAX_PAGES. Prefer a direct auth.users query where the database allows it.
   */
  async findAdminUserByEmail(email: string): Promise<User | null> {
    const wanted = email.trim().toLowerCase();
    for (let page = 1; page <= EMAIL_LOOKUP_MAX_PAGES; page += 1) {
      const { data, error } = await this.adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      const match = data.users.find((user) => user.email?.toLowerCase() === wanted);
      if (match) return match;
      if (data.users.length < 1000) return null;
    }
    return null;
  }

  async resetPassword(accessToken: string, refreshToken: string, password: string): Promise<void> {
    const recoveryClient = createClient(this.url, this.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const { error: sessionError } = await recoveryClient.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionError) {
      throw sessionError;
    }
    const { error } = await recoveryClient.auth.updateUser({
      password,
    });
    if (error) {
      throw error;
    }
    const { error: signOutError } = await recoveryClient.auth.signOut({
      scope: 'global',
    });
    if (signOutError) {
      throw signOutError;
    }
  }

  async requestPasswordReset(email: string, redirectTo: string): Promise<void> {
    const { error } = await this.publicClient.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) {
      throw error;
    }
  }

  async verifyAccessToken(accessToken: string): Promise<User> {
    const { data, error } = await this.publicClient.auth.getClaims(accessToken);
    const claims = data?.claims;
    if (error && isTransientAuthError(error)) {
      // Signing keys could not be fetched: the token may still be valid, so do not sign anyone out.
      throw new ServiceUnavailableException('Sign-in service is temporarily unavailable');
    }
    if (error || !claims?.sub) {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    return {
      id: claims.sub,
      aud: Array.isArray(claims.aud) ? (claims.aud[0] ?? 'authenticated') : claims.aud,
      role: claims.role,
      email: claims.email,
      phone: claims.phone,
      app_metadata: claims.app_metadata ?? {},
      user_metadata: claims.user_metadata ?? {},
      is_anonymous: claims.is_anonymous,
      created_at: new Date(claims.iat * 1000).toISOString(),
    };
  }

  async uploadProductImage(path: string, body: Buffer): Promise<void> {
    const { error } = await this.adminClient.storage.from('product-images').upload(path, body, {
      cacheControl: '31536000',
      contentType: 'image/webp',
      upsert: false,
    });
    if (error) {
      throw error;
    }
  }

  async removeProductImages(paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    const { error } = await this.adminClient.storage.from('product-images').remove(paths);
    if (error) {
      throw error;
    }
  }

  getProductImagePublicUrl(path: string): string {
    return this.adminClient.storage.from('product-images').getPublicUrl(path).data.publicUrl;
  }

  async uploadProductVideo(path: string, body: Buffer, contentType: string): Promise<void> {
    const { error } = await this.adminClient.storage.from('product-videos').upload(path, body, {
      cacheControl: '31536000',
      contentType,
      upsert: false,
    });
    if (error) {
      throw error;
    }
  }

  async removeProductVideos(paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    const { error } = await this.adminClient.storage.from('product-videos').remove(paths);
    if (error) {
      throw error;
    }
  }

  getProductVideoPublicUrl(path: string): string {
    return this.adminClient.storage.from('product-videos').getPublicUrl(path).data.publicUrl;
  }

  async uploadPrivateDocument(path: string, body: Buffer, contentType: string): Promise<void> {
    const { error } = await this.adminClient.storage.from('private-documents').upload(path, body, {
      cacheControl: '3600',
      contentType,
      upsert: false,
    });
    if (error) {
      throw error;
    }
  }

  async createPrivateDocumentUrl(path: string, expiresInSeconds = 300): Promise<string> {
    const { data, error } = await this.adminClient.storage
      .from('private-documents')
      .createSignedUrl(path, expiresInSeconds);
    if (error) {
      throw error;
    }
    return data.signedUrl;
  }

  async removePrivateDocuments(paths: string[]): Promise<void> {
    if (paths.length === 0) {
      return;
    }
    const { error } = await this.adminClient.storage.from('private-documents').remove(paths);
    if (error) {
      throw error;
    }
  }
}
