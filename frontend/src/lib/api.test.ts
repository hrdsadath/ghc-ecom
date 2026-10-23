import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, getSession, getSessionCheckError, saveCartIdentity, saveSession, sessionHasExpired } from './api';

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

describe('API session refresh', () => {
    const staffSession = { user: { id: 'staff-1', email: 'staff@example.com' }, roles: ['ADMIN' as const] };

    afterEach(() => {
        saveSession(null);
        vi.unstubAllGlobals();
    });

    const stub = (refresh: () => Response | Promise<Response>) => {
        let refreshes = 0;
        let ordersCalls = 0;
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith('/auth/refresh')) {
                refreshes += 1;
                return refresh();
            }
            if (url.includes('/admin/orders')) {
                ordersCalls += 1;
                // Expired access token first; succeeds after a refresh.
                return refreshes > 0 && ordersCalls > 2 ? json([]) : json({ message: 'Unauthorized' }, 401);
            }
            return json({});
        });
        vi.stubGlobal('fetch', fetchMock);
        return { refreshes: () => refreshes };
    };

    it('shares one refresh between concurrent requests and retries them', async () => {
        const counts = stub(async () => {
            await Promise.resolve();
            return json({ authenticated: true, user: staffSession.user, roles: ['ADMIN'] });
        });
        saveSession(staffSession);

        await expect(Promise.all([api.adminOrders(), api.adminOrders()])).resolves.toEqual([[], []]);
        expect(counts.refreshes()).toBe(1);
        expect(getSession()?.user?.id).toBe('staff-1');
    });

    it.each([
        ['a timeout or network failure', () => { throw new TypeError('fetch failed'); }, 0],
        ['a server error', () => json({ message: 'Service Unavailable' }, 503), 503],
        ['rate limiting', () => json({ message: 'Too Many Requests' }, 429), 429],
    ])('keeps the session and throws a retryable error on %s', async (_label, refresh, status) => {
        stub(refresh);
        saveSession(staffSession);

        const failure = await api.adminOrders().catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(ApiError);
        expect((failure as ApiError).status).toBe(status);
        expect(getSession()).toEqual(staffSession);
        expect(sessionHasExpired()).toBe(false);
    });

    it('ends the session as expired only when the refresh is rejected', async () => {
        stub(() => json({ message: 'Invalid or expired refresh token' }, 401));
        saveSession(staffSession);

        await expect(api.adminOrders()).rejects.toMatchObject({ status: 401 });
        expect(getSession()).toBeNull();
        expect(sessionHasExpired()).toBe(true);
    });

    it('reports an unreachable backend instead of signing out during session start-up', async () => {
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith('/auth/csrf')) return json({ csrfToken: 'token' });
            if (url.endsWith('/auth/session')) return json({ message: 'Bad Gateway' }, 502);
            return json({});
        }));
        saveSession(staffSession);

        await expect(api.initializeSession()).resolves.toEqual(staffSession);
        expect(getSession()).toEqual(staffSession);
        expect(getSessionCheckError()?.status).toBe(502);

        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith('/auth/csrf')) return json({ csrfToken: 'token' });
            return json({ authenticated: false, user: null, roles: [], expired: true });
        }));
        await expect(api.initializeSession()).resolves.toBeNull();
        expect(getSessionCheckError()).toBeNull();
        expect(sessionHasExpired()).toBe(true);
    });

    it('asks the app to re-read roles after an "Insufficient permissions" answer', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'Insufficient permissions' }, 403)));
        saveSession(staffSession);
        const recheck = vi.fn();
        window.addEventListener('ghc:permissions-changed', recheck);

        await expect(api.staffUsers()).rejects.toMatchObject({ status: 403 });
        await expect(api.staffUsers()).rejects.toMatchObject({ status: 403 });

        window.removeEventListener('ghc:permissions-changed', recheck);
        expect(recheck).toHaveBeenCalledTimes(1);
    });

    it('serves the operations snapshot from a 30 second cache unless a fresh one is asked for', async () => {
        const fetchMock = vi.fn(async () => json({ databaseHealthy: true, checkedAt: '' }));
        vi.stubGlobal('fetch', fetchMock);
        saveSession(staffSession);

        await Promise.all([api.operations(), api.operations(), api.operations()]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await api.operations({ fresh: true });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[1]?.[0 as never])).toContain('fresh=true');
    });
});
