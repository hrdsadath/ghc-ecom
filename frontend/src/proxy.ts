import { NextRequest, NextResponse } from 'next/server';
import { contentSecurityPolicy, resolveImageOrigin } from './lib/security-policy.mjs';

const imageOrigin = resolveImageOrigin({
    NEXT_PUBLIC_IMAGE_ORIGIN: process.env.NEXT_PUBLIC_IMAGE_ORIGIN,
    NODE_ENV: process.env.NODE_ENV,
});

const PAYMENT_RESULT_PATH = '/checkout/result';
const RETURN_PARAMS = ['order_id', 'status', 'status_id'] as const;

/**
 * SmartGateway can return the customer with a form POST instead of query parameters.
 * A page only sees the query string, so re-issue it as a GET carrying the same fields
 * (303 makes the browser switch to GET). The page still verifies status with the API.
 */
async function paymentReturnRedirect(request: NextRequest) {
    const target = new URL(PAYMENT_RESULT_PATH, request.url);
    let form: FormData | null = null;
    try {
        form = await request.formData();
    } catch {
        // Not a form body; fall through with whatever the query string carries.
    }
    for (const key of RETURN_PARAMS) {
        const value = form?.get(key) ?? request.nextUrl.searchParams.get(key);
        if (typeof value === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(value)) target.searchParams.set(key, value);
    }
    return NextResponse.redirect(target, 303);
}

// Next.js reads the nonce from the request's CSP header and stamps it on its own scripts.
export async function proxy(request: NextRequest) {
    if (request.method === 'POST' && request.nextUrl.pathname === PAYMENT_RESULT_PATH) {
        return paymentReturnRedirect(request);
    }

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
