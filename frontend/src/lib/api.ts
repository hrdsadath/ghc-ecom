import {
    Address,
    AuditLogFilters,
    AuditLogPage,
    AuthResult,
    BulkInventoryResult,
    BulkInventoryRowInput,
    Cart,
    Category,
    CheckoutQuote,
    Coupon,
    CreateCouponInput,
    CreatedCart,
    HdfcPaymentIntent,
    InventoryLevel,
    InventoryLevelView,
    OperationsSnapshot,
    Order,
    OrderRefund,
    PaginatedProducts,
    Product,
    ProductImage,
    ProductVariant,
    ProductVideo,
    Profile,
    RefundReconciliation,
    ReturnRequest,
    RevenueReport,
    Session,
    Shipment,
    ShippingAddressInput,
    CreatedStaffUser,
    StaffUser,
    Warehouse,
} from '../types';
import { resolveApiBaseUrl } from './api-url';

export interface AdminProductQuery {
    page: number;
    limit: 20 | 50 | 100;
    /** Name, slug, SKU or alias (case-insensitive). */
    q?: string;
    status?: Product['status'] | '';
    /** Category id. */
    category?: string;
}

export const API_BASE_URL = resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
const CART_KEY = 'ghc_cart';
const GUEST_ORDER_KEY = 'ghc_guest_orders';
const PENDING_PAYMENT_KEY = 'ghc_pending_payment';
const REQUEST_TIMEOUT_MS = 15_000;
let currentSession: Session | null = null;
let csrfToken: string | null = null;
let csrfRefreshInFlight: Promise<void> | null = null;
let sessionInitializationInFlight: Promise<Session | null> | null = null;
let sessionRefreshInFlight: Promise<Session | null> | null = null;
/** True when the server ended the session (refresh rejected), as opposed to the user signing out. */
let sessionExpired = false;
/** Set when the last session check could not reach the backend; the session is then unknown, not signed out. */
let sessionCheckError: ApiError | null = null;
const OPERATIONS_CACHE_MS = 30_000;
let operationsCache: { takenAt: number; snapshot: Promise<OperationsSnapshot> } | null = null;
let lastPermissionRecheck = 0;

export class ApiError extends Error {
    constructor(
        message: string,
        public status: number,
        public details?: unknown,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

export const getSession = (): Session | null => currentSession;

const setSession = (session: Session | null, expired = false) => {
    currentSession = session;
    sessionExpired = !session && expired;
    if (session) sessionCheckError = null;
    else operationsCache = null;
    window.dispatchEvent(new Event('ghc:session'));
};

export const saveSession = (session: Session | null) => setSession(session);

export const sessionHasExpired = (): boolean => sessionExpired;

export const getSessionCheckError = (): ApiError | null => sessionCheckError;

/** 401/403 from the auth endpoints mean the session is gone; anything else (offline, 429, 5xx) is retryable. */
const isSessionRejection = (error: unknown): boolean =>
    error instanceof ApiError && (error.status === 401 || error.status === 403);

const normalizeAuth = (result: AuthResult): Session | null => {
    if (result.csrfToken) csrfToken = result.csrfToken;
    return result.authenticated ? { user: result.user, roles: result.roles || [] } : null;
};

export interface CartIdentity {
    cartId: string;
    guestToken?: string;
}

export const getCartIdentity = (): CartIdentity | null => {
    try {
        const raw = localStorage.getItem(CART_KEY);
        return raw ? (JSON.parse(raw) as CartIdentity) : null;
    } catch {
        return null;
    }
};

export const saveCartIdentity = (identity: CartIdentity | null) => {
    if (identity) localStorage.setItem(CART_KEY, JSON.stringify(identity));
    else localStorage.removeItem(CART_KEY);
};

const guestOrderTokens = (): Record<string, string> => {
    try {
        return JSON.parse(localStorage.getItem(GUEST_ORDER_KEY) || '{}') as Record<string, string>;
    } catch {
        return {};
    }
};

export const saveGuestOrderAccess = (orderId: string, guestToken: string) => {
    localStorage.setItem(GUEST_ORDER_KEY, JSON.stringify({ ...guestOrderTokens(), [orderId]: guestToken }));
};

/** The order sent to SmartGateway, so /checkout/result can still check it if the return carries no order id. */
export const savePendingPayment = (orderId: string) => {
    try {
        sessionStorage.setItem(PENDING_PAYMENT_KEY, orderId);
    } catch {
        // Storage unavailable: the result page falls back to the gateway's order_id.
    }
};

export const readPendingPayment = (): string | null => {
    try {
        return sessionStorage.getItem(PENDING_PAYMENT_KEY);
    } catch {
        return null;
    }
};

export const clearPendingPayment = () => {
    try {
        sessionStorage.removeItem(PENDING_PAYMENT_KEY);
    } catch {
        // Nothing to clear.
    }
};

type RequestOptions = {
    auth?: boolean;
    cart?: boolean;
    retry?: boolean;
    csrfRetry?: boolean;
    timeoutMs?: number;
    guestToken?: string;
};

const unsafeMethod = (method: string) => !['GET', 'HEAD', 'OPTIONS'].includes(method);

const isInvalidCsrfResponse = (payload: unknown) => {
    if (!payload || typeof payload !== 'object' || !('message' in payload)) return false;
    const message = (payload as { message?: unknown }).message;
    const text = Array.isArray(message) ? message.join(' ') : String(message || '');
    return text.toLowerCase().includes('invalid csrf token');
};

async function refreshCsrfToken(): Promise<void> {
    if (csrfRefreshInFlight) return csrfRefreshInFlight;
    const task = request<{ csrfToken: string }>('/auth/csrf', {}, { retry: false, csrfRetry: false })
        .then((result) => {
            csrfToken = result.csrfToken;
        });
    csrfRefreshInFlight = task;
    try {
        await task;
    } finally {
        if (csrfRefreshInFlight === task) csrfRefreshInFlight = null;
    }
}

/**
 * Refreshes the session once for every concurrent caller. Resolves null when the server rejected the
 * refresh (the session is cleared and marked expired); rejects with a retryable ApiError when the
 * refresh could not complete (offline, timeout, 429, 5xx) and leaves the session in place.
 */
function refreshSession(): Promise<Session | null> {
    if (sessionRefreshInFlight) return sessionRefreshInFlight;
    const task = request<AuthResult>('/auth/refresh', { method: 'POST' }, { retry: false }).then(
        (result) => {
            const next = normalizeAuth(result);
            setSession(next, !next);
            return next;
        },
        (error: unknown) => {
            if (isSessionRejection(error)) {
                setSession(null, true);
                return null;
            }
            const cause = error instanceof ApiError ? error : null;
            throw new ApiError(
                'We could not confirm your session just now. You are still signed in; please retry.',
                cause?.status ?? 0,
                cause?.details,
            );
        },
    );
    sessionRefreshInFlight = task;
    const clear = () => {
        if (sessionRefreshInFlight === task) sessionRefreshInFlight = null;
    };
    task.then(clear, clear);
    return task;
}

/** A role was removed while the workspace was open: ask the app to re-read the session (at most every 5 s). */
const notifyPermissionsChanged = () => {
    if (Date.now() - lastPermissionRecheck < 5_000) return;
    lastPermissionRecheck = Date.now();
    window.dispatchEvent(new Event('ghc:permissions-changed'));
};

async function request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
    const session = getSession();
    const cart = getCartIdentity();
    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData)) headers.set('content-type', 'application/json');
    const guestToken = options.guestToken || (options.cart ? cart?.guestToken : undefined);
    if (guestToken && !session) headers.set('x-cart-token', guestToken);
    const method = (init.method ?? 'GET').toUpperCase();
    if (unsafeMethod(method) && csrfToken) {
        headers.set('x-csrf-token', csrfToken);
    }

    let response: Response;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
    const abort = () => controller.abort();
    init.signal?.addEventListener('abort', abort, { once: true });
    try {
        response = await fetch(`${API_BASE_URL}${path}`, {
            ...init,
            headers,
            credentials: 'include',
            signal: controller.signal,
        });
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new ApiError('The store service took too long to respond. Please retry.', 0);
        }
        throw new ApiError('The store service is unavailable. Check that the backend is running.', 0);
    } finally {
        window.clearTimeout(timeout);
        init.signal?.removeEventListener('abort', abort);
    }

    if (response.status === 401 && options.auth && session && options.retry !== false) {
        // Throws a retryable ApiError (and keeps the session) when the refresh itself could not complete.
        const next = await refreshSession();
        if (next) return request<T>(path, init, { ...options, retry: false });
    }

    if (response.status === 204) return undefined as T;
    const json = response.headers.get('content-type')?.includes('application/json');
    const payload = json ? await response.json() : await response.text();
    if (
        response.status === 403 &&
        unsafeMethod(method) &&
        options.csrfRetry !== false &&
        isInvalidCsrfResponse(payload)
    ) {
        await refreshCsrfToken();
        return request<T>(path, init, { ...options, csrfRetry: false });
    }
    if (!response.ok) {
        const rawMessage =
            typeof payload === 'object' && payload && 'message' in payload
                ? (payload as { message: string | string[] }).message
                : `Request failed (${response.status})`;
        if (response.status === 403 && options.auth && rawMessage === 'Insufficient permissions') {
            notifyPermissionsChanged();
        }
        throw new ApiError(Array.isArray(rawMessage) ? rawMessage.join('. ') : String(rawMessage), response.status, payload);
    }
    if (!json) {
        throw new ApiError('The store service returned an unexpected response.', 502);
    }
    return payload as T;
}

const authenticated = () => Boolean(getSession());
const cartOptions = (): RequestOptions => ({
    auth: authenticated(),
    cart: true,
});

export const api = {
    /**
     * Reads the session from the backend. If the backend cannot be reached the current session is kept
     * and getSessionCheckError() explains why, so callers can offer a retry instead of a sign-in page.
     */
    initializeSession() {
        if (sessionInitializationInFlight) return sessionInitializationInFlight;
        const task = (async () => {
            const hadSession = Boolean(getSession());
            try {
                await refreshCsrfToken();
                const result = await request<AuthResult>('/auth/session', {}, { retry: false });
                const session = normalizeAuth(result);
                sessionCheckError = null;
                setSession(session, Boolean(result.expired) || hadSession);
                return session;
            } catch (error) {
                if (isSessionRejection(error)) {
                    sessionCheckError = null;
                    setSession(null, hadSession);
                    return null;
                }
                sessionCheckError = error instanceof ApiError
                    ? error
                    : new ApiError('The store service is unavailable. Please retry.', 0);
                window.dispatchEvent(new Event('ghc:session'));
                return getSession();
            }
        })();
        sessionInitializationInFlight = task;
        void task.finally(() => {
            if (sessionInitializationInFlight === task) sessionInitializationInFlight = null;
        });
        return task;
    },
    async login(email: string, password: string) {
        const result = await request<AuthResult>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
        const session = normalizeAuth(result);
        saveSession(session);
        return session;
    },
    async register(fullName: string, email: string, password: string) {
        const result = await request<AuthResult>('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ fullName, email, password }),
        });
        const session = normalizeAuth(result);
        saveSession(session);
        return session;
    },
    async logout() {
        try {
            await request<void>('/auth/logout', { method: 'POST' }, { auth: true });
        } finally {
            saveSession(null);
            csrfToken = null;
            saveCartIdentity(null);
            window.dispatchEvent(new Event('ghc:cart-reset'));
        }
    },
    forgotPassword: (email: string) =>
        request<void>('/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email }),
        }),
    resetPassword: (recoveryAccessToken: string, recoveryRefreshToken: string, password: string) =>
        request<void>('/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({
                recoveryAccessToken,
                recoveryRefreshToken,
                password,
            }),
        }),

    categories: () => request<Category[]>('/categories'),
    products: (params = new URLSearchParams({ page: '1', limit: '48' }), signal?: AbortSignal) => request<PaginatedProducts>(`/products?${params}`, { signal }),
    product: (slug: string) => request<Product>(`/products/${encodeURIComponent(slug)}`),
    productsByIds: async (ids: string[]): Promise<Product[]> => {
        const unique = [...new Set(ids)];
        const pages = await Promise.all(
            Array.from({ length: Math.ceil(unique.length / 100) }, (_, index) =>
                request<PaginatedProducts>(
                    `/products?${new URLSearchParams({ ids: unique.slice(index * 100, index * 100 + 100).join(','), limit: '100' })}`,
                ),
            ),
        );
        return pages.flatMap((page) => page.items);
    },

    createCart: () => request<CreatedCart>('/carts', { method: 'POST' }, { auth: authenticated() }),
    getCart: (cartId: string) => request<Cart>(`/carts/${cartId}`, {}, cartOptions()),
    setCartItem: (cartId: string, variantId: string, quantity: number) =>
        request<Cart>(`/carts/${cartId}/items`, { method: 'PUT', body: JSON.stringify({ variantId, quantity }) }, cartOptions()),
    removeCartItem: (cartId: string, variantId: string) => request<Cart>(`/carts/${cartId}/items/${variantId}`, { method: 'DELETE' }, cartOptions()),

    quote: (input: {
        cartId: string;
        contactEmail: string;
        couponCode?: string;
        addressId?: string;
        shippingAddress?: ShippingAddressInput;
    }) => request<CheckoutQuote>('/checkout/quote', { method: 'POST', body: JSON.stringify(input) }, cartOptions()),
    hdfcPaymentIntent: (quoteId: string) =>
        request<HdfcPaymentIntent>('/checkout/hdfc/intent', { method: 'POST', body: JSON.stringify({ quoteId }) }, cartOptions()),
    hdfcPaymentStatus: (lookup: { orderId: string } | { hdfcOrderId: string }) =>
        request<Order>('/payments/hdfc/status', { method: 'POST', body: JSON.stringify(lookup) }, cartOptions()),

    profile: () => request<Profile>('/me/profile', {}, { auth: true }),
    updateProfile: (input: Partial<Pick<Profile, 'fullName' | 'phone'>>) =>
        request<Profile>('/me/profile', { method: 'PATCH', body: JSON.stringify(input) }, { auth: true }),
    addresses: () => request<Address[]>('/me/addresses', {}, { auth: true }),
    createAddress: (input: Omit<Address, 'id' | 'userId'>) =>
        request<Address>('/me/addresses', { method: 'POST', body: JSON.stringify(input) }, { auth: true }),
    updateAddress: (id: string, input: Partial<Omit<Address, 'id' | 'userId'>>) =>
        request<Address>(`/me/addresses/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, { auth: true }),
    deleteAddress: (id: string) => request<void>(`/me/addresses/${id}`, { method: 'DELETE' }, { auth: true }),
    orders: () => request<Order[]>('/orders', {}, { auth: true }),
    order: (id: string) => getSession()
        ? request<Order>(`/orders/${id}`, {}, { auth: true })
        : request<Order>(`/guest/orders/${id}`, {}, { guestToken: guestOrderTokens()[id] }),
    shipments: (orderId: string) => request<Shipment[]>(`/orders/${orderId}/shipments`, {}, { auth: true }),
    invoice: (id: string) => getSession()
        ? request<{ url: string; expiresIn: number }>(`/orders/${id}/invoice`, {}, { auth: true })
        : request<{ url: string; expiresIn: number }>(`/guest/orders/${id}/invoice`, {}, { guestToken: guestOrderTokens()[id] }),
    cancelOrder: (id: string) => request<Order>(`/orders/${id}/cancel`, { method: 'POST' }, { auth: true }),
    createReturn: (id: string, reason: string) =>
        request<unknown>(`/orders/${id}/returns`, { method: 'POST', body: JSON.stringify({ reason }) }, { auth: true }),

    // List rows carry card images only and no videos; open a product with adminProduct.
    adminProducts: (query: AdminProductQuery, signal?: AbortSignal) => {
        const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit) });
        if (query.q?.trim()) params.set('q', query.q.trim());
        if (query.status) params.set('status', query.status);
        if (query.category) params.set('category', query.category);
        return request<PaginatedProducts>(`/admin/catalogue/products?${params}`, { signal }, { auth: true });
    },
    // Every product (card images only) for catalogue export and import matching.
    adminAllProducts: (signal?: AbortSignal) =>
        request<Product[]>('/admin/catalogue/products/all', { signal }, { auth: true, timeoutMs: 45_000 }),
    adminProduct: (id: string) => request<Product>(`/admin/catalogue/products/${id}`, {}, { auth: true }),
    adminCategories: (signal?: AbortSignal) => request<Category[]>('/admin/catalogue/categories', { signal }, { auth: true }),
    createProduct: (input: unknown) => request<Product>('/admin/catalogue/products', { method: 'POST', body: JSON.stringify(input) }, { auth: true }),
    updateProduct: (id: string, input: unknown) =>
        request<Product>(`/admin/catalogue/products/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, { auth: true }),
    deleteProduct: (id: string) => request<void>(`/admin/catalogue/products/${id}`, { method: 'DELETE' }, { auth: true }),
    createCategory: (input: { name: string; description?: string; isPublished?: boolean }) =>
        request<Category>('/admin/catalogue/categories', { method: 'POST', body: JSON.stringify(input) }, { auth: true }),
    updateCategory: (id: string, input: Partial<Omit<Category, 'id' | 'slug'>>) =>
        request<Category>(`/admin/catalogue/categories/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, { auth: true }),
    deleteCategory: (id: string) => request<void>(`/admin/catalogue/categories/${id}`, { method: 'DELETE' }, { auth: true }),
    createVariant: (productId: string, input: unknown) =>
        request<ProductVariant>(`/admin/catalogue/products/${productId}/variants`, { method: 'POST', body: JSON.stringify(input) }, { auth: true }),
    updateVariant: (variantId: string, input: unknown) =>
        request<ProductVariant>(`/admin/catalogue/variants/${variantId}`, { method: 'PATCH', body: JSON.stringify(input) }, { auth: true }),
    deleteVariant: (variantId: string) => request<void>(`/admin/catalogue/variants/${variantId}`, { method: 'DELETE' }, { auth: true }),
    uploadProductImage: (productId: string, form: FormData) =>
        request<ProductImage>(
            `/admin/catalogue/products/${productId}/images`,
            { method: 'POST', body: form },
            { auth: true, timeoutMs: 45_000 },
        ),
    importGoogleDriveImage: (
        productId: string,
        input: { driveUrl: string; variantIds?: string[]; altText: string; sortOrder?: number },
    ) =>
        // `reused` marks an image this product already had from the same Drive file.
        request<ProductImage & { reused?: boolean }>(
            `/admin/catalogue/products/${productId}/images/google-drive`,
            { method: 'POST', body: JSON.stringify(input) },
            { auth: true, timeoutMs: 45_000 },
        ),
    updateProductImage: (productId: string, imageId: string, input: { variantIds?: string[]; variantId?: string | null; altText?: string; sortOrder?: number }) =>
        request<ProductImage>(`/admin/catalogue/products/${productId}/images/${imageId}`, { method: 'PATCH', body: JSON.stringify(input) }, { auth: true }),
    // Lists every image of the product, first to last; returns them in their new order.
    reorderProductImages: (productId: string, imageIds: string[]) =>
        request<ProductImage[]>(
            `/admin/catalogue/products/${productId}/images/order`,
            { method: 'PUT', body: JSON.stringify({ imageIds }) },
            { auth: true },
        ),
    deleteProductImage: (productId: string, imageId: string) =>
        request<void>(`/admin/catalogue/products/${productId}/images/${imageId}`, { method: 'DELETE' }, { auth: true }),
    uploadProductVideo: (productId: string, form: FormData) =>
        request<ProductVideo>(
            `/admin/catalogue/products/${productId}/videos/upload`,
            { method: 'POST', body: form },
            // Upload, MP4 conversion (up to 90 s on the server) and storage can take a while.
            { auth: true, timeoutMs: 180_000 },
        ),
    deleteProductVideo: (productId: string, videoId: string) =>
        request<void>(`/admin/catalogue/products/${productId}/videos/${videoId}`, { method: 'DELETE' }, { auth: true }),
    adminOrders: (params = '', signal?: AbortSignal) =>
        request<Order[]>(`/admin/orders${params ? `?${params}` : ''}`, { signal }, { auth: true }),
    adminOrder: (id: string, signal?: AbortSignal) => request<Order>(`/admin/orders/${id}`, { signal }, { auth: true }),
    adminRevenue: () => request<RevenueReport>('/admin/orders/revenue', {}, { auth: true }),
    adminInvoice: (id: string) => request<{ url: string; expiresIn: number }>(`/admin/orders/${id}/invoice`, {}, { auth: true }),
    transitionOrder: (id: string, status: string) =>
        request<Order>(`/admin/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, { auth: true }),
    /** Admin-only: cancels a paid, unshipped order; stock is released and the payment refunded automatically. */
    cancelAdminOrder: (id: string, reason: string) =>
        request<Order>(`/admin/orders/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }, { auth: true }),
    createShipment: (orderId: string, carrier?: string) =>
        request<Shipment>(`/admin/orders/${orderId}/shipments`, { method: 'POST', body: JSON.stringify({ carrier: carrier || undefined }) }, { auth: true }),
    addTrackingEvent: (shipmentId: string, input: { providerEventId: string; status: string; message?: string; location?: string; occurredAt: string }) =>
        request<Shipment>(`/admin/shipments/${shipmentId}/events`, { method: 'POST', body: JSON.stringify(input) }, { auth: true }),
    reviewReturn: (returnId: string, status: string, note?: string, restock?: boolean) =>
        request<ReturnRequest & { restockedUnits?: number }>(
            `/admin/returns/${returnId}`,
            { method: 'PATCH', body: JSON.stringify({ status, note, ...(restock ? { restock: true } : {}) }) },
            { auth: true },
        ),
    createRefund: (input: { paymentId: string; returnRequestId?: string; amountPaise: number; idempotencyKey: string; reason?: string }) =>
        request<OrderRefund>('/admin/refunds', { method: 'POST', body: JSON.stringify(input) }, { auth: true }),
    reconcileRefunds: () => request<RefundReconciliation>('/admin/refunds/reconcile', { method: 'POST' }, { auth: true }),
    inventory: () => request<InventoryLevelView[]>('/admin/inventory/levels', {}, { auth: true }),
    warehouses: () => request<Warehouse[]>('/admin/inventory/warehouses', {}, { auth: true }),
    // Send onHand (with expectedOnHand from the loaded row) only when the quantity changed.
    setInventory: (warehouseId: string, input: { variantId: string; onHand?: number; expectedOnHand?: number; lowStockThreshold: number }) =>
        request<InventoryLevel>(`/admin/inventory/warehouses/${warehouseId}/levels`, { method: 'PUT', body: JSON.stringify(input) }, { auth: true }),
    bulkSetInventory: (rows: BulkInventoryRowInput[]) =>
        request<BulkInventoryResult>('/admin/inventory/levels', { method: 'PUT', body: JSON.stringify({ rows }) }, { auth: true, timeoutMs: 60_000 }),
    updateWarehouse: (id: string, input: { name?: string; isActive?: boolean }) =>
        request<Warehouse>(`/admin/inventory/warehouses/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, { auth: true }),
    /** Shared by the admin shell, overview and health pages: one request per 30 s unless `fresh` is asked for. */
    operations: (options: { fresh?: boolean } = {}): Promise<OperationsSnapshot> => {
        if (!options.fresh && operationsCache && Date.now() - operationsCache.takenAt < OPERATIONS_CACHE_MS) {
            return operationsCache.snapshot;
        }
        const snapshot = request<OperationsSnapshot>(
            `/admin/operations/dashboard${options.fresh ? '?fresh=true' : ''}`,
            {},
            { auth: true },
        );
        const entry = { takenAt: Date.now(), snapshot };
        operationsCache = entry;
        snapshot.catch(() => {
            if (operationsCache === entry) operationsCache = null;
        });
        return snapshot;
    },
    coupons: () => request<Coupon[]>('/admin/promotions/coupons', {}, { auth: true }),
    createCoupon: (input: CreateCouponInput) => request<Coupon>('/admin/promotions/coupons', { method: 'POST', body: JSON.stringify(input) }, { auth: true }),
    updateCoupon: (
        id: string,
        input: Partial<Omit<CreateCouponInput, 'maximumDiscountPaise' | 'usageLimit' | 'perUserLimit'>> & {
            maximumDiscountPaise?: number | null;
            usageLimit?: number | null;
            perUserLimit?: number | null;
        },
    ) =>
        request<Coupon>(`/admin/promotions/coupons/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, { auth: true }),
    auditLogs: (filters: AuditLogFilters = {}, signal?: AbortSignal) => {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(filters)) {
            if (value !== undefined && value !== '') params.set(key, String(value));
        }
        const query = params.toString();
        return request<AuditLogPage>(`/admin/audit-logs${query ? `?${query}` : ''}`, { signal }, { auth: true });
    },
    assignRole: (userId: string, role: string) =>
        request<unknown>(`/admin/users/${userId}/roles`, { method: 'PUT', body: JSON.stringify({ role }) }, { auth: true }),
    removeRole: (userId: string, role: string) =>
        request<void>(`/admin/users/${userId}/roles/${role}`, { method: 'DELETE' }, { auth: true }),
    staffUsers: () => request<StaffUser[]>('/admin/users', {}, { auth: true }),
    createStaffUser: (input: { email: string; role: string; fullName?: string }) =>
        request<CreatedStaffUser>('/admin/users', { method: 'POST', body: JSON.stringify(input) }, { auth: true }),
    /** Gives staff access to an account that already exists (the person keeps their password). */
    grantStaffAccess: (input: { email: string; role: string }) =>
        request<StaffUser>('/admin/users/grant', { method: 'POST', body: JSON.stringify(input) }, { auth: true }),
    /** Blocks sign-in and ends the member's sessions until reinstated. */
    suspendStaffUser: (userId: string) =>
        request<StaffUser>(`/admin/users/${userId}/suspend`, { method: 'POST' }, { auth: true }),
    reinstateStaffUser: (userId: string) =>
        request<StaffUser>(`/admin/users/${userId}/reinstate`, { method: 'POST' }, { auth: true }),
    /** Emails the member a reset-password link; the link itself is never returned. */
    sendStaffPasswordReset: (userId: string) =>
        request<void>(`/admin/users/${userId}/password-reset`, { method: 'POST' }, { auth: true }),
    createWarehouse: (input: { code: string; name: string; isActive?: boolean }) =>
        request<Warehouse>('/admin/inventory/warehouses', { method: 'POST', body: JSON.stringify(input) }, { auth: true }),
};
