import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, saveCartIdentity, saveSession } from './api';

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

describe('API CSRF recovery', () => {
    afterEach(() => {
        localStorage.clear();
        saveCartIdentity(null);
        saveSession(null);
        vi.unstubAllGlobals();
    });

    it('refreshes a stale CSRF token once and retries the original write', async () => {
        let csrfRequests = 0;
        let cartWrites = 0;
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith('/auth/csrf')) {
                csrfRequests += 1;
                return json({ csrfToken: csrfRequests === 1 ? 'initial-token' : 'refreshed-token' });
            }
            if (url.endsWith('/auth/session')) return json({ authenticated: false, user: null });
            if (url.includes('/carts/cart-id/items')) {
                cartWrites += 1;
                if (cartWrites === 1) return json({ message: 'Invalid CSRF token' }, 403);
                expect(new Headers(init?.headers).get('x-csrf-token')).toBe('refreshed-token');
                return json({ id: 'cart-id', status: 'ACTIVE', expiresAt: '', items: [], subtotalPaise: 0 });
            }
            return json({});
        });
        vi.stubGlobal('fetch', fetchMock);

        await api.initializeSession();
        saveCartIdentity({ cartId: 'cart-id', guestToken: 'guest-token' });
        await api.setCartItem('cart-id', 'variant-id', 1);

        expect(csrfRequests).toBe(2);
        expect(cartWrites).toBe(2);
    });

    it('deduplicates concurrent session initialization', async () => {
        let sessionRequests = 0;
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith('/auth/csrf')) return json({ csrfToken: 'token' });
            if (url.endsWith('/auth/session')) {
                sessionRequests += 1;
                await Promise.resolve();
                return json({ authenticated: false, user: null });
            }
            return json({});
        });
        vi.stubGlobal('fetch', fetchMock);

        await Promise.all([api.initializeSession(), api.initializeSession()]);

        expect(sessionRequests).toBe(1);
    });
});

describe('API product lookups', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('fetches saved products by id in chunks of 100 instead of scanning the catalogue', async () => {
        const ids = Array.from({ length: 150 }, (_, index) => `id-${index}`);
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const requested = new URL(String(input), 'http://localhost').searchParams.get('ids')?.split(',') ?? [];
            return json({ items: requested.map((id) => ({ id })), total: requested.length, page: 1, limit: 100 });
        });
        vi.stubGlobal('fetch', fetchMock);

        const products = await api.productsByIds([...ids, 'id-0']);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(products.map((product) => product.id)).toEqual(ids);
    });
});
