// Shared by next.config.mjs (image allow-list) and src/proxy.ts (per-request CSP),
// so the image origin is validated once and both stay in sync.

/**
 * Supabase storage origin that serves product images and videos.
 * @param {{ NEXT_PUBLIC_IMAGE_ORIGIN?: string, NODE_ENV?: string }} env
 * @returns {URL | null}
 */
export const resolveImageOrigin = (env) => {
  const isDevelopment = env.NODE_ENV === 'development';
  const configured = env.NEXT_PUBLIC_IMAGE_ORIGIN?.trim();
  const origin = configured
    ? new URL(configured)
    : isDevelopment
      ? new URL('http://127.0.0.1:54321')
      : null;
  if (origin && !['http:', 'https:'].includes(origin.protocol)) {
    throw new Error('NEXT_PUBLIC_IMAGE_ORIGIN must use HTTP or HTTPS');
  }
  if (!isDevelopment && origin?.protocol === 'http:') {
    throw new Error('NEXT_PUBLIC_IMAGE_ORIGIN must use HTTPS outside development');
  }
  return origin;
};

/**
 * Next.js inlines its hydration payload as <script> tags, so a strict policy needs a
 * per-request nonce; 'strict-dynamic' lets those nonced scripts load the page chunks.
 * HDFC SmartGateway runs on its own hosted page reached by top-level navigation,
 * so checkout needs no third-party script, frame, connect or form-action origin.
 * @param {{ nonce: string, isDevelopment: boolean, imageOrigin: URL | null }} options
 */
export const contentSecurityPolicy = ({ nonce, isDevelopment, imageOrigin }) => {
  const imageSource = imageOrigin ? ` ${imageOrigin.origin}` : '';
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src 'self' data: blob:${imageSource}`,
    `media-src 'self'${imageSource}`,
    "connect-src 'self'",
    'frame-src https://www.instagram.com',
  ].join('; ');
};
