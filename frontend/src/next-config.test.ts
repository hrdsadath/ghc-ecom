// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

const originalVercel = process.env.VERCEL;
const originalNextAdapterPath = process.env.NEXT_ADAPTER_PATH;

afterEach(() => {
  if (originalVercel === undefined) {
    delete process.env.VERCEL;
  } else {
    process.env.VERCEL = originalVercel;
  }
  if (originalNextAdapterPath === undefined) {
    delete process.env.NEXT_ADAPTER_PATH;
  } else {
    process.env.NEXT_ADAPTER_PATH = originalNextAdapterPath;
  }
  vi.resetModules();
});

const cspFor = async (isDevelopment = false) => {
  const { contentSecurityPolicy } = await import('./lib/security-policy.mjs');
  return contentSecurityPolicy({
    nonce: 'test-nonce',
    isDevelopment,
    imageOrigin: new URL('https://project.supabase.co'),
  });
};

describe('payment content security policy', () => {
  it('needs no third-party payment origins for the HDFC hosted payment page', async () => {
    const csp = await cspFor();

    expect(csp).toContain("form-action 'self';");
    expect(csp).toContain("connect-src 'self';");
    expect(csp).not.toMatch(/razorpay|smartgateway/i);
  });
});

describe('deployment output', () => {
  it('lets Vercel manage the deployment output', async () => {
    process.env.VERCEL = '1';
    vi.resetModules();

    const { default: config } = await import('../next.config.mjs');

    expect(config.output).toBeUndefined();
  });

  it('uses a nonce-based script policy and does not expose an open image proxy', async () => {
    const { default: config } = await import('../next.config.mjs');
    const csp = await cspFor();
    const staticHeaders = (await config.headers!())[0].headers.map((header: { key: string }) => header.key);

    expect(csp).toContain("script-src 'self' 'nonce-test-nonce' 'strict-dynamic';");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
    expect(await cspFor(true)).toContain("'unsafe-eval'");
    expect(csp).toContain("img-src 'self' data: blob: https://project.supabase.co;");
    // A second, nonce-less static CSP header would be enforced too and block Next.js scripts.
    expect(staticHeaders).not.toContain('Content-Security-Policy');
    expect(config.images?.remotePatterns).toEqual([]);
    expect(config.images?.maximumRedirects).toBe(0);
  });

  it('lets an injected Next adapter manage the deployment output', async () => {
    delete process.env.VERCEL;
    process.env.NEXT_ADAPTER_PATH = '/tmp/platform-adapter.js';
    vi.resetModules();

    const { default: config } = await import('../next.config.mjs');

    expect(config.output).toBeUndefined();
  });

  it('retains standalone output for self-hosted builds', async () => {
    delete process.env.VERCEL;
    delete process.env.NEXT_ADAPTER_PATH;
    vi.resetModules();

    const { default: config } = await import('../next.config.mjs');

    expect(config.output).toBe('standalone');
  });
});
