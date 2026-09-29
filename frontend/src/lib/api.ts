import {
    Address,
    AuditLog,
    AuthResult,
    Cart,
    Category,
    CheckoutQuote,
    Coupon,
    CreateCouponInput,
    CreatedCart,
    HdfcPaymentIntent,
    InventoryLevel,
    OperationsSnapshot,
    Order,
    PaginatedProducts,
    Product,
    ProductImage,
    ProductVariant,
    ProductVideo,
    Profile,
    Session,
    Shipment,
    ShippingAddressInput,
    CreatedStaffUser,
    StaffUser,
    Warehouse,
} from '../types';
import { resolveApiBaseUrl } from './api-url';

export const API_BASE_URL = resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
const CART_KEY = 'ghc_cart';
const GUEST_ORDER_KEY = 'ghc_guest_orders';
const PENDING_PAYMENT_KEY = 'ghc_pending_payment';
const REQUEST_TIMEOUT_MS = 15_000;
let currentSession: Session | null = null;
let csrfToken: string | null = null;
let csrfRefreshInFlight: Promise<void> | null = null;
let sessionInitializationInFlight: Promise<Session | null> | null = null;

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

export const saveSession = (session: Session | null) => {
    currentSession = session;
    window.dispatchEvent(new Event('ghc:session'));
};

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
        try {
            const refreshed = await request<AuthResult>(
                '/auth/refresh',
                {
                    method: 'POST',
                },
                { retry: false },
            );
            const next = normalizeAuth(refreshed);
            saveSession(next);
            if (next) return request<T>(path, init, { ...options, retry: false });
        } catch {
            saveSession(null);
        }
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
    initializeSession() {
        if (sessionInitializationInFlight) return sessionInitializationInFlight;
        const task = (async () => {
            try {
                await refreshCsrfToken();
                const result = await request<AuthResult>('/auth/session', {}, { retry: false });
                const session = normalizeAuth(result);
                saveSession(session);
                return session;
            } catch {
                saveSession(null);
                return null;
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
    adminProducts: (signal?: AbortSignal) =>
        request<Product[]>('/admin/catalogue/products', { signal }, { auth: true, timeoutMs: 45_000 }),
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
        request<ProductImage>(
            `/admin/catalogue/products/${productId}/images/google-drive`,
            { method: 'POST', body: JSON.stringify(input) },
            { auth: true, timeoutMs: 45_000 },
        ),
    updateProductImage: (productId: string, imageId: string, input: { variantIds?: string[]; variantId?: string | null; altText?: string; sortOrder?: number }) =>
        request<ProductImage>(`/admin/catalogue/products/${productId}/images/${imageId}`, { method: 'PATCH', body: JSON.stringify(input) }, { auth: true }),
    deleteProductImage: (productId: string, imageId: string) =>
        request<void>(`/admin/catalogue/products/${productId}/images/${imageId}`, { method: 'DELETE' }, { auth: true }),
    uploadProductVideo: (productId: string, form: FormData) =>
        request<ProductVideo>(
            `/admin/catalogue/products/${productId}/videos/upload`,
            { method: 'POST', body: form },
            { auth: true, timeoutMs: 45_000 },
        ),
    deleteProductVideo: (productId: string, videoId: string) =>
        request<void>(`/admin/catalogue/products/${productId}/videos/${videoId}`, { method: 'DELETE' }, { auth: true }),
    adminOrders: (params = '', signal?: AbortSignal) =>
        request<Order[]>(`/admin/orders${params ? `?${params}` : ''}`, { signal }, { auth: true }),
    adminInvoice: (id: string) => request<{ url: string; expiresIn: number }>(`/admin/orders/${id}/invoice`, {}, { auth: true }),
    transitionOrder: (id: string, status: string) =>
        request<Order>(`/admin/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, { auth: true }),
    createShipment: (orderId: string, carrier?: string) =>
        request<Shipment>(`/admin/orders/${orderId}/shipments`, { method: 'POST', body: JSON.stringify({ carrier: carrier || undefined }) }, { auth: true }),
    addTrackingEvent: (shipmentId: string, input: { providerEventId: string; status: string; message?: string; location?: string; occurredAt: string }) =>
        request<Shipment>(`/admin/shipments/${shipmentId}/events`, { method: 'POST', body: JSON.stringify(input) }, { auth: true }),
    reviewReturn: (returnId: string, status: string, note?: string) =>
        request<unknown>(`/admin/returns/${returnId}`, { method: 'PATCH', body: JSON.stringify({ status, note }) }, { auth: true }),
    createRefund: (input: { paymentId: string; returnRequestId?: string; amountPaise: number; idempotencyKey: string; reason?: string }) =>
        request<unknown>('/admin/refunds', { method: 'POST', body: JSON.stringify(input) }, { auth: true }),
    reconcileRefunds: () => request<unknown>('/admin/refunds/reconcile', { method: 'POST' }, { auth: true }),
    inventory: () => request<InventoryLevel[]>('/admin/inventory/levels', {}, { auth: true }),
    warehouses: () => request<Warehouse[]>('/admin/inventory/warehouses', {}, { auth: true }),
    setInventory: (warehouseId: string, input: { variantId: string; onHand: number; lowStockThreshold?: number }) =>
        request<InventoryLevel>(`/admin/inventory/warehouses/${warehouseId}/levels`, { method: 'PUT', body: JSON.stringify(input) }, { auth: true }),
    operations: () => request<OperationsSnapshot>('/admin/operations/dashboard', {}, { auth: true }),
    coupons: () => request<Coupon[]>('/admin/promotions/coupons', {}, { auth: true }),
    createCoupon: (input: CreateCouponInput) => request<Coupon>('/admin/promotions/coupons', { method: 'POST', body: JSON.stringify(input) }, { auth: true }),
    updateCoupon: (id: string, input: Partial<CreateCouponInput>) =>
        request<Coupon>(`/admin/promotions/coupons/${id}`, { method: 'PATCH', body: JSON.stringify(input) }, { auth: true }),
    auditLogs: () => request<AuditLog[]>('/admin/audit-logs', {}, { auth: true }),
    assignRole: (userId: string, role: string) =>
        request<unknown>(`/admin/users/${userId}/roles`, { method: 'PUT', body: JSON.stringify({ role }) }, { auth: true }),
    removeRole: (userId: string, role: string) =>
        request<void>(`/admin/users/${userId}/roles/${role}`, { method: 'DELETE' }, { auth: true }),
    staffUsers: () => request<StaffUser[]>('/admin/users', {}, { auth: true }),
    createStaffUser: (input: { email: string; role: string; fullName?: string }) =>
        request<CreatedStaffUser>('/admin/users', { method: 'POST', body: JSON.stringify(input) }, { auth: true }),
    createWarehouse: (input: { code: string; name: string; isActive?: boolean }) =>
        request<Warehouse>('/admin/inventory/warehouses', { method: 'POST', body: JSON.stringify(input) }, { auth: true }),
};
