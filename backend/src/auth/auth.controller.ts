import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AppRole } from '@prisma/client';
import { AuthService, AuthResult } from './auth.service';
import { CsrfService } from './csrf.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SessionCookieService } from './session-cookie.service';

interface BrowserUser {
  id: string;
  email: string | null;
  user_metadata?: { full_name?: string };
}

interface BrowserAuthResponse {
  authenticated: boolean;
  user: BrowserUser | null;
  csrfToken?: string;
  roles: AppRole[];
  /** Set when the browser held a session that can no longer be refreshed. */
  expired?: boolean;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookies: SessionCookieService,
    private readonly csrf: CsrfService,
  ) {}

  @Get('csrf')
  csrfToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): { csrfToken: string } {
    this.cookies.noStore(response);
    return { csrfToken: this.csrf.generate(request, response) };
  }

  @Get('session')
  async session(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BrowserAuthResponse> {
    this.cookies.noStore(response);
    const accessToken = this.cookies.readAccessToken(request);

    if (accessToken) {
      try {
        const user = await this.authService.verifyAccessToken(accessToken);
        const access = await this.authService.access(user.id);
        if (access.suspended) {
          // A suspended account's access token may still verify; end the browser session now.
          this.cookies.clear(response);
          return { authenticated: false, user: null, roles: [], expired: true };
        }
        return {
          authenticated: true,
          user: this.publicUser({ user, session: null }),
          roles: access.roles,
        };
      } catch (error) {
        if (!(error instanceof UnauthorizedException)) throw error;
      }
    }

    const refreshToken = this.cookies.readRefreshToken(request);
    if (!refreshToken) {
      if (accessToken) this.cookies.clear(response);
      return { authenticated: false, user: null, roles: [] };
    }

    try {
      const result = await this.authService.refresh(refreshToken);
      if (!result.session) {
        this.cookies.clear(response);
        return { authenticated: false, user: null, roles: [] };
      }
      return this.completeAuthentication(result, request, response);
    } catch (error) {
      // Only a rejected refresh token ends the session; outages surface as 503 and keep cookies.
      if (!(error instanceof UnauthorizedException)) throw error;
      this.cookies.clear(response);
      return { authenticated: false, user: null, roles: [], expired: true };
    }
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Body() input: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BrowserAuthResponse> {
    const result = await this.authService.register(input);
    return this.completeAuthentication(result, request, response);
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000, blockDuration: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BrowserAuthResponse> {
    const result = await this.authService.login(input.email, input.password);
    if (!result.session) throw new UnauthorizedException('Invalid email or password');
    const authenticated = await this.completeAuthentication(result, request, response);
    if (authenticated.user) {
      await this.authService.recordSignIn(authenticated.user, authenticated.roles, {
        ipAddress: request.ip,
        userAgent: request.header('user-agent'),
      });
    }
    return authenticated;
  }

  @Post('refresh')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<BrowserAuthResponse> {
    const refreshToken = this.cookies.readRefreshToken(request);
    if (!refreshToken) throw new UnauthorizedException('Session refresh is unavailable');
    const result = await this.authService.refresh(refreshToken);
    if (!result.session) throw new UnauthorizedException('Invalid or expired session');
    return this.completeAuthentication(result, request, response);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.cookies.noStore(response);
    const accessToken = this.cookies.readAccessToken(request);
    try {
      if (accessToken) await this.authService.logout(accessToken);
    } finally {
      this.cookies.clear(response);
    }
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60_000, blockDuration: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  async requestPasswordReset(
    @Body() input: ForgotPasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.cookies.noStore(response);
    await this.authService.requestPasswordReset(input.email);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60_000, blockDuration: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Body() input: ResetPasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.cookies.noStore(response);
    await this.authService.resetPassword(
      input.recoveryAccessToken,
      input.recoveryRefreshToken,
      input.password,
    );
    this.cookies.clear(response);
  }

  private async completeAuthentication(
    result: AuthResult,
    request: Request,
    response: Response,
  ): Promise<BrowserAuthResponse> {
    this.cookies.noStore(response);
    const user = this.publicUser(result);
    if (!result.session) return { authenticated: false, user, roles: [] };

    this.cookies.setSession(response, result.session);
    return {
      authenticated: true,
      user,
      roles: user ? await this.authService.roles(user.id) : [],
      csrfToken: this.csrf.generate(request, response, result.session),
    };
  }

  private publicUser(result: AuthResult): BrowserUser | null {
    const user = result.user ?? result.session?.user;
    if (!user) return null;
    const fullName = user.user_metadata?.full_name;
    return {
      id: user.id,
      email: user.email ?? null,
      ...(typeof fullName === 'string' ? { user_metadata: { full_name: fullName } } : {}),
    };
  }
}
