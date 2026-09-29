import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Session } from '@supabase/supabase-js';
import { doubleCsrf } from 'csrf-csrf';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import { SessionCookieService } from './session-cookie.service';

type ParsedCookieRequest = Request & { cookies?: Record<string, string> };

// Provider callbacks are posted cross-site and authenticate themselves.
const CSRF_EXEMPT_PATH_SUFFIXES = ['/webhooks/hdfc'];

function isProviderCallback(request: Request): boolean {
  const path = request.path || request.originalUrl.split('?')[0];
  return CSRF_EXEMPT_PATH_SUFFIXES.some((suffix) => path.endsWith(suffix));
}

@Injectable()
export class CsrfService {
  private readonly protect: RequestHandler;
  private readonly createToken: (
    request: Request,
    response: Response,
    options?: { overwrite?: boolean },
  ) => string;

  constructor(
    config: ConfigService,
    private readonly cookies: SessionCookieService,
  ) {
    const utilities = doubleCsrf({
      getSecret: () => config.getOrThrow<string>('CSRF_SECRET'),
      getSessionIdentifier: (request) =>
        this.cookies.readRefreshToken(request) ??
        this.cookies.readAccessToken(request) ??
        'anonymous',
      cookieName: this.cookies.csrfCookieName,
      cookieOptions: {
        httpOnly: true,
        secure: this.cookies.secure,
        sameSite: 'lax',
        path: '/',
        maxAge: this.cookies.refreshTtlMs,
      },
      getCsrfTokenFromRequest: (request) => request.headers['x-csrf-token'],
      skipCsrfProtection: (request) =>
        !this.cookies.hasBrowserSession(request) || isProviderCallback(request),
      errorConfig: {
        statusCode: 403,
        message: 'Invalid CSRF token',
        code: 'EBADCSRFTOKEN',
      },
    });
    this.protect = utilities.doubleCsrfProtection;
    this.createToken = utilities.generateCsrfToken;
  }

  protection(): RequestHandler {
    return (request: Request, response: Response, next: NextFunction) => {
      this.protect(request, response, (error?: unknown) => {
        if (error) {
          next(new ForbiddenException('Invalid CSRF token'));
          return;
        }
        next();
      });
    };
  }

  generate(request: Request, response: Response, session?: Session): string {
    if (session) {
      const parsedRequest = request as ParsedCookieRequest;
      parsedRequest.cookies ??= {};
      parsedRequest.cookies[this.cookies.refreshCookieName] = session.refresh_token;
    }
    return this.createToken(request, response, { overwrite: true });
  }
}
