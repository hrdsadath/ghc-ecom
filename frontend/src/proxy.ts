import { NextRequest, NextResponse } from 'next/server';
import { contentSecurityPolicy, resolveImageOrigin } from './lib/security-policy.mjs';

const imageOrigin = resolveImageOrigin({
    NEXT_PUBLIC_IMAGE_ORIGIN: process.env.NEXT_PUBLIC_IMAGE_ORIGIN,
    NODE_ENV: process.env.NODE_ENV,
});

// Next.js reads the nonce from the request's CSP header and stamps it on its own scripts.
export function proxy(request: NextRequest) {
    const nonce = btoa(crypto.randomUUID());
    const policy = contentSecurityPolicy({
        nonce,
        isDevelopment: process.env.NODE_ENV === 'development',
        imageOrigin,
    });

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', policy);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('Content-Security-Policy', policy);
    return response;
}

export const config = {
    matcher: [
        {
            // Documents only: static assets, the image optimizer and the proxied API need no CSP.
            source: '/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)',
            missing: [
                { type: 'header', key: 'next-router-prefetch' },
                { type: 'header', key: 'purpose', value: 'prefetch' },
            ],
        },
    ],
};
