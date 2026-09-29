import { validateEnvironment } from './env.validation';

const validEnvironment = {
  FRONTEND_ORIGIN: 'http://localhost:3000',
  API_PUBLIC_URL: 'http://localhost:3001',
  DATABASE_URL: 'postgresql://postgres:password@localhost:5432/postgres',
  DIRECT_URL: 'postgresql://postgres:password@localhost:5432/postgres',
  REDIS_URL: 'redis://localhost:6379',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  CSRF_SECRET: 'test-csrf-secret-that-is-at-least-32-characters',
  EMAIL_FROM: 'Glockery Home Centre <orders@example.com>',
  RESEND_API_KEY: 're_test_key',
};

const hdfcSandbox = {
  HDFC_ENABLED: 'true',
  HDFC_MERCHANT_ID: 'SG1234',
  HDFC_API_KEY: 'api-key',
  HDFC_WEBHOOK_USERNAME: 'glockery',
  HDFC_WEBHOOK_PASSWORD: 'w'.repeat(24),
};

describe('validateEnvironment', () => {
  it('accepts a valid environment and applies defaults', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3001,
      RATE_LIMIT_TTL_MS: 60_000,
      RATE_LIMIT_LIMIT: 100,
      ...validEnvironment,
    });
  });

  it('rejects incomplete configuration', () => {
    expect(() => validateEnvironment({ PORT: 'not-a-number' })).toThrow(
      'Invalid environment configuration',
    );
  });

  it('normalizes a Supabase REST endpoint to the project base URL', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        SUPABASE_URL: 'https://example.supabase.co/rest/v1/',
      }).SUPABASE_URL,
    ).toBe('https://example.supabase.co');
  });

  it('normalizes the frontend URL to an exact origin', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        FRONTEND_ORIGIN: 'https://www.glockery.com/store/',
      }).FRONTEND_ORIGIN,
    ).toBe('https://www.glockery.com');
  });

  it('parses additional comma-separated CORS origins and includes the primary origin', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        FRONTEND_ORIGINS: 'https://admin.glockery.com, https://preview.glockery.com/',
      }).FRONTEND_ORIGINS,
    ).toEqual([
      'http://localhost:3000',
      'https://admin.glockery.com',
      'https://preview.glockery.com',
    ]);
  });

  it('rejects an invalid additional CORS origin', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        FRONTEND_ORIGINS: 'https://admin.glockery.com, not-a-url',
      }),
    ).toThrow('FRONTEND_ORIGINS: contains an invalid URL: not-a-url');
  });

  it('rejects localhost CORS in production unless explicitly enabled', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        FRONTEND_ORIGIN: 'https://shop.example.com',
        FRONTEND_ORIGINS: 'http://localhost:3000',
        API_PUBLIC_URL: 'https://api.example.com',
        CSRF_SECRET: 'production-csrf-secret-that-is-at-least-32-characters',
        ALLOW_TEST_PAYMENTS_IN_PRODUCTION: 'true',
      }),
    ).toThrow(
      'FRONTEND_ORIGINS.0: must use a public HTTPS origin in production unless localhost CORS is explicitly allowed',
    );

    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        FRONTEND_ORIGINS: 'https://admin.example.com',
        API_PUBLIC_URL: 'https://api.example.com',
        CSRF_SECRET: 'production-csrf-secret-that-is-at-least-32-characters',
        ALLOW_TEST_PAYMENTS_IN_PRODUCTION: 'true',
      }),
    ).toThrow(
      'FRONTEND_ORIGIN: must use a public HTTPS origin in production unless localhost CORS is explicitly allowed',
    );
  });

  it('allows localhost CORS in production only with an explicit opt-in', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        FRONTEND_ORIGIN: 'https://shop.example.com',
        FRONTEND_ORIGINS: 'http://localhost:3000',
        ALLOW_LOCALHOST_CORS_IN_PRODUCTION: 'true',
        API_PUBLIC_URL: 'https://api.example.com',
        CSRF_SECRET: 'production-csrf-secret-that-is-at-least-32-characters',
        ALLOW_TEST_PAYMENTS_IN_PRODUCTION: 'true',
        ...hdfcSandbox,
      }).FRONTEND_ORIGINS,
    ).toEqual(['https://shop.example.com', 'http://localhost:3000']);
  });

  it('rejects the development CSRF secret in production', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        CSRF_SECRET: 'development-only-csrf-secret-change-me',
      }),
    ).toThrow('must be a production secret');
  });

  it('rejects a localhost frontend origin in production', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        CSRF_SECRET: 'production-csrf-secret-that-is-at-least-32-characters',
      }),
    ).toThrow('must use a public HTTPS origin in production');
  });

  it('requires the HDFC gateway in production', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        FRONTEND_ORIGIN: 'https://shop.example.com',
        API_PUBLIC_URL: 'https://api.example.com',
        CSRF_SECRET: 'production-csrf-secret-that-is-at-least-32-characters',
      }),
    ).toThrow('HDFC_ENABLED: must be true in production');
  });

  it('rejects the HDFC sandbox in production unless staging explicitly opts in', () => {
    const production = {
      ...validEnvironment,
      ...hdfcSandbox,
      NODE_ENV: 'production',
      FRONTEND_ORIGIN: 'https://shop.example.com',
      API_PUBLIC_URL: 'https://api.example.com',
      CSRF_SECRET: 'production-csrf-secret-that-is-at-least-32-characters',
    };

    expect(() => validateEnvironment(production)).toThrow(
      'the sandbox gateway requires ALLOW_TEST_PAYMENTS_IN_PRODUCTION=true',
    );
    expect(
      validateEnvironment({ ...production, ALLOW_TEST_PAYMENTS_IN_PRODUCTION: 'true' }),
    ).toMatchObject({ ALLOW_TEST_PAYMENTS_IN_PRODUCTION: true });
    expect(
      validateEnvironment({ ...production, HDFC_BASE_URL: 'https://smartgateway.hdfc.bank.in' }),
    ).toMatchObject({ HDFC_ENABLED: true, HDFC_BASE_URL: 'https://smartgateway.hdfc.bank.in' });
  });

  it('keeps the HDFC gateway optional until it is enabled', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      HDFC_ENABLED: false,
      HDFC_BASE_URL: 'https://smartgateway.hdfcuat.bank.in',
    });
    expect(
      validateEnvironment({ ...validEnvironment, HDFC_MERCHANT_ID: '' }).HDFC_MERCHANT_ID,
    ).toBeUndefined();
  });

  it('requires merchant credentials and webhook auth when HDFC is enabled', () => {
    expect(() => validateEnvironment({ ...validEnvironment, HDFC_ENABLED: 'true' })).toThrow(
      /HDFC_MERCHANT_ID: is required when HDFC_ENABLED=true.*HDFC_WEBHOOK_PASSWORD: is required/,
    );
    expect(
      validateEnvironment({
        ...validEnvironment,
        HDFC_ENABLED: 'true',
        HDFC_MERCHANT_ID: 'SG1234',
        HDFC_API_KEY: 'api-key',
        HDFC_PAYMENT_PAGE_CLIENT_ID: 'hdfcmaster',
        HDFC_WEBHOOK_USERNAME: 'glockery',
        HDFC_WEBHOOK_PASSWORD: 'w'.repeat(24),
      }),
    ).toMatchObject({ HDFC_ENABLED: true, HDFC_PAYMENT_PAGE_CLIENT_ID: 'hdfcmaster' });
  });

  it('rejects HDFC webhook usernames with special characters', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, HDFC_WEBHOOK_USERNAME: 'glockery@shop' }),
    ).toThrow('HDFC_WEBHOOK_USERNAME: must be alphanumeric');
  });

  it('rejects a plain HTTP HDFC gateway URL in production', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: 'production',
        FRONTEND_ORIGIN: 'https://shop.example.com',
        API_PUBLIC_URL: 'https://api.example.com',
        CSRF_SECRET: 'production-csrf-secret-that-is-at-least-32-characters',
        HDFC_ENABLED: 'true',
        HDFC_BASE_URL: 'http://smartgateway.example.bank',
        HDFC_MERCHANT_ID: 'SG1234',
        HDFC_API_KEY: 'api-key',
        HDFC_WEBHOOK_USERNAME: 'glockery',
        HDFC_WEBHOOK_PASSWORD: 'w'.repeat(24),
      }),
    ).toThrow('HDFC_BASE_URL: must use HTTPS in production');
  });
});
