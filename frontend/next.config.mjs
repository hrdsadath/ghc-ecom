import { fileURLToPath } from 'node:url';

const backendOrigin = (process.env.BACKEND_ORIGIN ||
  (process.env.NODE_ENV === 'production'
    ? 'https://ghc-ecom-production.up.railway.app'
    : 'http://127.0.0.1:3001')).replace(/\/+$/, '');
const isDevelopment = process.env.NODE_ENV === 'development';
const configuredImageOrigin = process.env.NEXT_PUBLIC_IMAGE_ORIGIN?.trim();
const imageOrigin = configuredImageOrigin
  ? new URL(configuredImageOrigin)
  : isDevelopment
    ? new URL('http://127.0.0.1:54321')
    : null;
if (imageOrigin && !['http:', 'https:'].includes(imageOrigin.protocol)) {
  throw new Error('NEXT_PUBLIC_IMAGE_ORIGIN must use HTTP or HTTPS');
}
if (!isDevelopment && imageOrigin?.protocol === 'http:') {
  throw new Error('NEXT_PUBLIC_IMAGE_ORIGIN must use HTTPS outside development');
}
const developmentScriptPolicy = isDevelopment ? " 'unsafe-inline' 'unsafe-eval'" : '';
const imageSource = imageOrigin ? ` ${imageOrigin.origin}` : '';
const isManagedPlatformBuild =
  process.env.VERCEL === '1' || Boolean(process.env.NEXT_ADAPTER_PATH);
// HDFC SmartGateway runs on its own hosted page reached by top-level navigation,
// so checkout needs no third-party script, frame, connect or form-action origin.
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self'${developmentScriptPolicy}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `img-src 'self' data: blob:${imageSource}`,
  `media-src 'self'${imageSource}`,
  "connect-src 'self'",
  'frame-src https://www.instagram.com',
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: fileURLToPath(new URL('..', import.meta.url)),
  },
  // Extra dev hosts (comma-separated), e.g. an HTTPS tunnel used to test the HDFC
  // SmartGateway return URL and webhooks locally.
  allowedDevOrigins: [
    '127.0.0.1',
    'localhost',
    ...(process.env.ALLOWED_DEV_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ],
  // Vercel's Next.js adapter owns output tracing and deployment packaging.
  // Keep standalone output only for the Docker/self-hosted build.
  ...(!isManagedPlatformBuild && { output: 'standalone' }),
  poweredByHeader: false,
  compress: true,
  experimental: {
    sri: { algorithm: 'sha256' },
  },
  images: {
    formats: ['image/webp'],
    qualities: [75],
    maximumRedirects: 0,
    maximumResponseBody: 8 * 1024 * 1024,
    dangerouslyAllowLocalIP: false,
    remotePatterns: imageOrigin
      ? [
          {
            protocol: imageOrigin.protocol.slice(0, -1),
            hostname: imageOrigin.hostname,
            port: imageOrigin.port,
            pathname: '/storage/v1/object/public/**',
            search: '',
          },
        ]
      : [],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
