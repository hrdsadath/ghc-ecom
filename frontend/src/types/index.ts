export interface Category {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    isPublished: boolean;
    sortOrder: number;
    updatedAt?: string;
}

export interface ProductVariant {
    id: string;
    sku: string;
    alias?: string | null;
    pricePaise: number;
    compareAtPricePaise?: number | null;
    attributes?: Record<string, unknown>;
    isActive: boolean;
    availableStock: number;
}

export interface ProductImage {
    id: string;
    /** @deprecated Older API responses only. */
    variantId?: string | null;
    variantLinks?: Array<{ variantId: string }>;
    thumbnailUrl: string;
    mediumUrl: string;
    largeUrl: string;
    altText: string;
    sortOrder: number;
}

export interface ProductVideo {
    id: string;
    url: string;
    altText: string;
    sortOrder: number;
    sourceMimeType?: string | null;
}

export interface Product {
    id: string;
    categoryId: string;
    name: string;
    slug: string;
    shortDescription?: string | null;
    description?: string | null;
    material?: string | null;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    attributes?: Record<string, unknown>;
    category: Category;
    variants: ProductVariant[];
    images: ProductImage[];
    videos: ProductVideo[];
    createdAt?: string;
    updatedAt?: string;
}

export interface PaginatedProducts {
    items: Product[];
    total: number;
    page: number;
    limit: number;
}

export interface SupabaseUser {
    id: string;
    email?: string;
    user_metadata?: { full_name?: string };
}

export interface Session {
    user: SupabaseUser | null;
    roles: AppRole[];
}

export type AppRole = 'ADMIN' | 'CATALOGUE_MANAGER' | 'WAREHOUSE_MANAGER' | 'SUPPORT_AGENT' | 'CUSTOMER';

export interface AuthResult {
    authenticated: boolean;
    user: SupabaseUser | null;
    csrfToken?: string;
    roles: AppRole[];
    /** GET /auth/session: the browser held a session that could no longer be refreshed. */
    expired?: boolean;
}

export interface CartItem {
    id: string;
    variantId: string;
    sku: string;
    alias?: string | null;
    productName: string;
    productSlug?: string;
    categoryName?: string;
    productDescription?: string | null;
    productMaterial?: string | null;
    color?: string | null;
    size?: string | null;
    packQuantity?: number | null;
    optionLabel?: string;
    imageUrl: string | null;
    attributes?: Record<string, unknown>;
    quantity: number;
    unitPricePaise: number;
    lineTotalPaise: number;
}

export interface Cart {
    id: string;
    status: string;
    expiresAt: string;
    items: CartItem[];
    subtotalPaise: number;
}

export interface CreatedCart {
    cart: Cart;
    guestToken?: string;
}

export interface ShippingAddressInput {
    recipientName: string;
    phone: string;
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
}

export interface Address extends ShippingAddressInput {
    id: string;
    userId: string;
    label: string;
    isDefault: boolean;
}

export interface Profile {
    id: string;
    email: string;
    fullName: string;
    phone?: string | null;
}

export interface CheckoutQuote {
    id: string;
    cartId: string;
    subtotalPaise: number;
    discountPaise: number;
    shippingPaise: number;
    taxPaise: number;
    totalPaise: number;
    currency: string;
    expiresAt: string;
}

/** HDFC SmartGateway intent: the browser navigates to the hosted `paymentUrl`. */
export interface HdfcPaymentIntent {
    provider: 'hdfc';
    orderId: string;
    orderNumber: string;
    /** Echoed back by SmartGateway as `order_id` on /checkout/result. */
    hdfcOrderId: string;
    amount: number;
    currency: string;
    paymentUrl: string;
}

export interface OrderRefund {
    id: string;
    amountPaise: number;
    currency: string;
    status: string;
    reason?: string | null;
    returnRequestId?: string | null;
    processedAt?: string | null;
    createdAt: string;
}

export interface OrderPayment {
    id: string;
    hdfcTransactionId?: string | null;
    status: string;
    amountPaise: number;
    currency: string;
    method?: string | null;
    capturedAt?: string | null;
    refunds: OrderRefund[];
}

export interface Order {
    id: string;
    orderNumber: string;
    status: string;
    currency: string;
    itemsSnapshot: CartItem[];
    addressSnapshot: ShippingAddressInput & { email?: string };
    subtotalPaise: number;
    discountPaise: number;
    shippingPaise: number;
    taxPaise: number;
    totalPaise: number;
    hdfcOrderId?: string | null;
    confirmedAt?: string | null;
    createdAt: string;
    updatedAt: string;
    payments?: OrderPayment[];
    invoice?: { id: string } | null;
    shipments?: Shipment[];
    returns?: ReturnRequest[];
    /** Admin list rows only: line count instead of the full items snapshot. */
    itemCount?: number;
}

/** GET /admin/orders/revenue: IST calendar days, captured payments minus processed refunds. */
export interface DailyRevenue {
    date: string;
    capturedPaise: number;
    refundedPaise: number;
    netPaise: number;
    capturedPayments: number;
    processedRefunds: number;
}

export interface RevenueReport {
    timezone: string;
    days: DailyRevenue[];
    totals: Omit<DailyRevenue, 'date'>;
}

export interface RefundReconciliation {
    inspected: number;
    processed: number;
    pending: number;
    failed: number;
    errors: number;
}

export interface ReturnRequest {
    id: string;
    orderId: string;
    status: string;
    reason: string;
    reviewNote?: string | null;
    eligibleUntil: string;
    createdAt: string;
}

export interface TrackingEvent {
    id: string;
    shipmentId: string;
    providerEventId: string;
    status: string;
    message?: string | null;
    location?: string | null;
    occurredAt: string;
    createdAt: string;
}

export interface Shipment {
    id: string;
    orderId: string;
    provider: string;
    providerShipmentId?: string | null;
    trackingNumber?: string | null;
    carrier?: string | null;
    status: string;
    shippedAt?: string | null;
    deliveredAt?: string | null;
    createdAt: string;
    updatedAt: string;
    events: TrackingEvent[];
    items: Array<{
        id: string;
        sku: string;
        quantity: number;
        variantId?: string | null;
    }>;
}

export interface InventoryLevel {
    id: string;
    warehouseId: string;
    variantId: string;
    onHand: number;
    reserved: number;
    lowStockThreshold: number;
}

/** GET /admin/inventory/levels row: the level plus display fields (no catalogue access needed). */
export interface InventoryLevelView extends InventoryLevel {
    sku: string;
    alias: string | null;
    productId: string;
    productName: string;
    color: string | null;
    colorHex: string | null;
    thumbnailUrl: string | null;
    variantIsActive: boolean;
    warehouseCode: string;
    warehouseName: string;
    warehouseIsActive: boolean;
}

export interface BulkInventoryRowInput {
    warehouseId: string;
    variantId: string;
    onHand: number;
    lowStockThreshold: number;
    expectedOnHand?: number;
}

export interface BulkInventoryResult {
    updated: number;
    unchanged: number;
    movements: number;
}

export interface OperationsSnapshot {
    databaseHealthy: boolean;
    apiServerErrorsTotal: number;
    failedWebhooks: number;
    terminalJobFailures: number;
    expiredPendingPayments: number;
    paymentMismatches: number;
    failedRefunds: number;
    lowStockSkus: number;
    checkedAt: string;
}

export interface Coupon {
    id: string;
    code: string;
    type: 'PERCENT' | 'FIXED';
    value: number;
    minimumSubtotalPaise: number;
    maximumDiscountPaise?: number | null;
    usageLimit?: number | null;
    perUserLimit?: number | null;
    startsAt: string;
    endsAt: string;
    isActive: boolean;
    createdAt: string;
    /** Completed orders that used this coupon (admin list only). */
    redemptionCount?: number;
}

export interface CreateCouponInput {
    code: string;
    type: 'PERCENT' | 'FIXED';
    value: number;
    minimumSubtotalPaise?: number;
    maximumDiscountPaise?: number;
    usageLimit?: number;
    perUserLimit?: number;
    startsAt: string;
    endsAt: string;
    isActive?: boolean;
}

export interface AuditLog {
    id: string;
    actorId?: string | null;
    actorLabel?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
    ipAddress?: string | null;
    userAgent?: string | null;
    createdAt: string;
}

export interface AuditLogPage {
    items: AuditLog[];
    /** Pass as `cursor` to load the next (older) page; null on the last page. */
    nextCursor: string | null;
}

export interface AuditLogFilters {
    limit?: number;
    cursor?: string;
    actorId?: string;
    entityType?: string;
    action?: string;
    /** ISO timestamps. */
    from?: string;
    to?: string;
}

export interface Warehouse {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
}

export interface StaffUser {
    id: string;
    email: string;
    fullName: string | null;
    roles: Array<'ADMIN' | 'CATALOGUE_MANAGER' | 'WAREHOUSE_MANAGER' | 'SUPPORT_AGENT'>;
    createdAt: string;
    /** True while the account is suspended (banned in Supabase Auth). */
    suspended?: boolean;
    bannedUntil?: string | null;
}

export interface CreatedStaffUser {
    user: StaffUser;
    temporaryPassword: string;
}
