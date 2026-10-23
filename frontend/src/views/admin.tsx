'use client';

import React, { FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Redirect, useLocation } from '../lib/router';
import AdminShell from '../components/AdminShell';
import Pagination from '../components/Pagination';
import {
    IconAlert,
    IconCheckCircle,
    IconChevronLeft,
    IconChevronRight,
    IconClock,
    IconDownload,
    IconEdit,
    IconEye,
    IconFilter,
    IconPlus,
    IconRefresh,
    IconSearch,
    IconShield,
    IconTag,
    IconTrash,
    IconTrendingUp,
    IconClose,
} from '../components/Icons';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../hooks/useDialog';
import { api, ApiError, sessionHasExpired } from '../lib/api';
import { defaultAdminPath, HealthTone, matchAdminSection, operationsHealth } from '../lib/admin-routes';
import { auditActionLabel, auditChangeRows, auditEntityLabel, auditEntityTypeOptions, auditFactRows } from '../lib/audit-log';
import {
    catalogueCsvExport,
    catalogueCsvTemplate,
    driveLinksFromCsvCell,
    importBoolean,
    importRupeesToPaise,
    parseCatalogueCsv,
    validateCatalogueCsvRows,
} from '../lib/catalogue-csv';
import { inventoryCsvExport, inventoryCsvTemplate, parseInventoryCsv, planInventoryImport, validateInventoryCsvRows } from '../lib/inventory-csv';
import { fallbackImage, rupees, shortDate, slugify, titleCase } from '../lib/commerce';
import {
    canAdminCancelOrder,
    cancellationRefundPaise,
    nextShipmentStatuses,
    paiseToRupeesInput as refundAmountInput,
    parseRupeesToPaise,
    refundablePaise,
    returnRefundKey,
} from '../lib/fulfilment';
import { openTrustedUrlFrom } from '../lib/navigation';
import { lowestPricedVariant, productImageVariantIds, variantOptionLabel, variantPricesDiffer } from '../lib/product-options';
import {
    basisPointsToPercent,
    COUPON_CODE_PATTERN,
    CouponStatus,
    couponStatus,
    istDateBoundaryIso,
    istDateInputValue,
    istDateTimeLabel,
    localDateBoundaryIso,
    normalizeCouponCode,
    paiseToRupeesValue,
    percentToBasisPoints,
    rupeesToPaise,
} from '../lib/promotions';
import { readSpreadsheetText } from '../lib/spreadsheet-import';
import { AppRole, AuditLog, AuditLogFilters, Category, Coupon, CreatedStaffUser, DailyRevenue, InventoryLevel, InventoryLevelView, OperationsSnapshot, Order, Product, ProductVariant, RevenueReport, StaffUser, Warehouse } from '../types';

const box = 'admin-panel';
const inputStyle = 'admin-field h-12 w-full text-sm';
const textareaStyle = 'admin-field min-h-24 w-full resize-y text-sm';
const metricValue = (value: number | undefined): string => value === undefined || value < 0 ? 'Unavailable' : String(value);

const productSummary = (description: string): string => {
    const normalized = description.trim().replace(/\s+/g, ' ');
    if (normalized.length <= 300) return normalized;
    const candidate = normalized.slice(0, 299);
    const wordBoundary = candidate.lastIndexOf(' ');
    const summary = wordBoundary >= 220 ? candidate.slice(0, wordBoundary) : candidate;
    return `${summary.trimEnd()}…`;
};

const uploadGoogleDriveImage = async (
    productId: string,
    driveUrl: string,
    metadata: { variantIds?: string[]; altText: string; sortOrder?: number },
) => {
    return api.importGoogleDriveImage(productId, { driveUrl, ...metadata });
};

const orderItemAttributes = (attributes?: Record<string, unknown>): Array<[string, string]> => {
    if (!attributes) return [];
    return Object.entries(attributes).flatMap(([key, value]) => {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return [[key, String(value)]];
        }
        return [];
    });
};

const downloadCsv = (filename: string, contents: string): void => {
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
};

const AdminModalLayer = ({ children }: { children: React.ReactNode }) => {
    if (typeof document === 'undefined') return null;
    return createPortal(<div className="admin-workspace contents">{children}</div>, document.body);
};

const NotificationToast = ({ message, type = 'info', onClose }: { message: string; type?: 'info' | 'success' | 'error'; onClose: () => void }) => {
    if (!message) return null;
    const bg =
        type === 'error'
            ? 'bg-red-950/80 border-red-500/40 text-red-200'
            : type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
              : 'bg-gold-950/80 border-gold-500/40 text-gold-200';
    return (
        <div className={`mb-6 flex items-center justify-between border p-4 text-sm ${bg} rounded-sm shadow-md animate-fadeIn`} role={type === 'error' ? 'alert' : 'status'} aria-live={type === 'error' ? 'assertive' : 'polite'}>
            <span>{message}</span>
            <button aria-label="Close notification" onClick={onClose} className="ml-4 opacity-70 hover:opacity-100">
                <IconClose size={16} />
            </button>
        </div>
    );
};

// ----------------------------------------------------
// 1. OVERVIEW / DASHBOARD ANALYTICS
// ----------------------------------------------------
const istWeekday = (date: string): string =>
    new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' });

const RevenueChart = ({ days }: { days: DailyRevenue[] | null }) => {
    const points = (days ?? []).map((day) => ({ key: day.date, day: istWeekday(day.date), rev: Math.max(day.netPaise, 0) }));
    const max = Math.max(...points.map((point) => point.rev), 1);
    const weeklyRevenue = (days ?? []).reduce((sum, day) => sum + day.netPaise, 0);
    const height = 140;
    const width = 500;
    const position = (index: number) => (points.length > 1 ? (index / (points.length - 1)) * width : width / 2);
    const pathD = points
        .map((p, i) => {
            const x = position(i);
            const y = height - (p.rev / max) * height;
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        })
        .join(' ');

    return (
        <div className={`${box} p-6`}>
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gold-500/15 pb-4">
                <div>
                    <span className="eyebrow">Weekly performance</span>
                    <h3 className="font-display text-2xl text-cream">Revenue by day</h3>
                    <p className="mt-1 text-xs text-cream/45">Captured payments minus processed refunds, by IST day.</p>
                </div>
                <div className="flex items-center gap-2 border border-line px-3 py-1 text-xs text-cream/55">
                    <IconTrendingUp size={14} />
                    <span>Last 7 days</span>
                </div>
            </div>
            <div className="mt-6">
                {days === null ? (
                    <p className="py-10 text-center text-sm text-cream/40">Revenue is unavailable right now.</p>
                ) : (
                    <svg
                        viewBox={`0 0 ${width} ${height}`}
                        className="w-full overflow-visible"
                        role="img"
                        aria-label={`Revenue over the last seven days. Total ${rupees(weeklyRevenue)}.`}
                    >
                        <defs>
                            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#c9a35b" stopOpacity="0.2" />
                                <stop offset="100%" stopColor="#c9a35b" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        {points.length > 0 && <path d={`${pathD} L ${width} ${height} L 0 ${height} Z`} fill="url(#chartGradient)" />}
                        {points.length > 0 && <path d={pathD} fill="none" stroke="#c9a35b" strokeWidth="2.5" strokeLinecap="round" />}
                        {points.map((p, i) => {
                            const x = position(i);
                            const y = height - (p.rev / max) * height;
                            return (
                                <g key={p.key}>
                                    <title>{`${p.day}: ${rupees(p.rev)}`}</title>
                                    <circle cx={x} cy={y} r="4" fill="#11110f" stroke="#c9a35b" strokeWidth="2" />
                                    <text x={x} y={height + 20} textAnchor="middle" fill="#9CA3AF" fontSize="10">
                                        {p.day}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                )}
            </div>
        </div>
    );
};

const Overview = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [ops, setOps] = useState<OperationsSnapshot | null>(null);
    const [revenue, setRevenue] = useState<RevenueReport | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        void Promise.allSettled([api.adminOrders(new URLSearchParams({ limit: '5' }).toString()), api.operations(), api.adminRevenue()]).then(
            ([orderRows, snapshot, report]) => {
                if (!active) return;
                if (orderRows.status === 'fulfilled') setOrders(orderRows.value);
                if (snapshot.status === 'fulfilled') setOps(snapshot.value);
                if (report.status === 'fulfilled') setRevenue(report.value);
                const failure = [orderRows, snapshot, report].find((result): result is PromiseRejectedResult => result.status === 'rejected');
                if (failure) setError(failure.reason instanceof Error ? failure.reason.message : 'Unable to load admin overview.');
            },
        );
        return () => {
            active = false;
        };
    }, []);

    return (
        <AdminShell title="Overview" description="Track today’s orders, stock risks and system health from one place.">
            <NotificationToast message={error} type="error" onClose={() => setError('')} />

            <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border border-line bg-panel p-6">
                <div>
                    <h3 className="font-display text-xl text-cream">Common actions</h3>
                    <p className="mt-1 text-xs text-cream/50">Add products, reconcile stock, or create a promotion.</p>
                </div>
                <div className="admin-quick-actions grid w-full grid-cols-1 gap-2 min-[460px]:grid-cols-3 sm:w-auto sm:gap-3">
                    <a href="/admin/catalogue" className="button-primary gap-2">
                        <IconPlus size={16} /> Add Product
                    </a>
                    <a href="/admin/inventory" className="button-secondary gap-2">
                        <IconRefresh size={16} /> Adjust Stock
                    </a>
                    <a href="/admin/promotions" className="button-secondary gap-2">
                        <IconTag size={16} /> Create Coupon
                    </a>
                </div>
            </div>

            {/* Top Metrics Cards */}
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {[
                    {
                        label: 'Net revenue · 7 days',
                        value: revenue ? rupees(revenue.totals.netPaise) : 'Unavailable',
                        badge: revenue?.totals.refundedPaise ? `${rupees(revenue.totals.refundedPaise)} refunded` : 'No refunds',
                        isAlert: false,
                    },
                    {
                        label: 'Paid orders · 7 days',
                        value: metricValue(revenue?.totals.capturedPayments),
                        badge: 'Captured payments',
                        isAlert: false,
                    },
                    {
                        label: 'Low Stock SKUs',
                        value: metricValue(ops?.lowStockSkus),
                        badge: ops?.lowStockSkus ? 'Action Needed' : 'Healthy',
                        isAlert: Boolean(ops?.lowStockSkus),
                    },
                    {
                        label: 'Payment Mismatches',
                        value: metricValue(ops?.paymentMismatches),
                        badge: ops?.paymentMismatches ? 'Alert' : 'Clean',
                        isAlert: Boolean(ops?.paymentMismatches),
                    },
                ].map((item) => (
                    <article key={item.label} className={`${box} p-6 transition-colors hover:border-gold-500/40`}>
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-cream/40">{item.label}</p>
                            <span
                                className={`border px-2.5 py-0.5 text-[10px] font-bold ${item.isAlert ? 'border-red-500/30 bg-red-950/30 text-red-300' : 'border-line text-cream/50'}`}
                            >
                                {item.badge}
                            </span>
                        </div>
                        <strong className="mt-4 block font-display text-4xl font-normal text-gold-300">{item.value}</strong>
                    </article>
                ))}
            </div>

            {/* Analytics Visual Chart & Recent Activity */}
            <div className="mt-8 grid gap-8 xl:grid-cols-3">
                <div className="xl:col-span-2">
                    <RevenueChart days={revenue?.days ?? null} />
                </div>
                <div className={`${box} p-6`}>
                    <h3 className="font-display text-2xl text-cream">System Signals</h3>
                    <p className="mt-1 text-xs text-cream/40">Real-time status of backend services</p>
                    <div className="mt-6 space-y-4">
                        <div className="flex items-center justify-between border-b border-gold-500/10 pb-3">
                            <span className="text-xs text-cream/70">Database Engine</span>
                            <span className={`flex items-center gap-1.5 text-xs font-medium ${ops?.databaseHealthy ? 'text-emerald-400' : 'text-amber-300'}`}>
                                <IconCheckCircle size={14} color={ops?.databaseHealthy ? '#10B981' : '#f59e0b'} />{' '}
                                {ops ? (ops.databaseHealthy ? 'Healthy' : 'Needs attention') : 'Unavailable'}
                            </span>
                        </div>
                        <div className="flex items-center justify-between border-b border-gold-500/10 pb-3">
                            <span className="text-xs text-cream/70">API Error Total</span>
                            <span className="text-xs text-cream/80 font-medium">{ops ? `${metricValue(ops.apiServerErrorsTotal)} errors` : 'Unavailable'}</span>
                        </div>
                        <div className="flex items-center justify-between border-b border-gold-500/10 pb-3">
                            <span className="text-xs text-cream/70">Webhook Processing</span>
                            <span className="text-xs text-cream/80 font-medium">
                                {ops ? (ops.failedWebhooks ? `${metricValue(ops.failedWebhooks)} failed` : 'All processed') : '—'}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-cream/70">Expired pending orders awaiting cleanup</span>
                            <span className="text-xs text-cream/80 font-medium">{metricValue(ops?.expiredPendingPayments)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Orders Table */}
            <div className="mt-10">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-display text-3xl">Recent Orders</h2>
                    <a href="/admin/orders" className="text-xs uppercase tracking-wider text-gold-400 hover:text-gold-200">
                        View all orders
                    </a>
                </div>
                <OrdersTable orders={orders.slice(0, 5)} />
            </div>
        </AdminShell>
    );
};

// ----------------------------------------------------
// 2. ORDERS MANAGEMENT SUITE
// ----------------------------------------------------
/** The payment that matters for an order: the captured one if any, else the latest attempt. */
const primaryPayment = (order: Order) =>
    order.payments?.find((payment) => payment.status === 'CAPTURED' || payment.status === 'REFUNDED') ?? order.payments?.[0];

const OrdersTable = ({
    orders,
    onInspect,
}: {
    orders: Order[];
    onInspect?: (order: Order) => void;
}) => (
    <div className={`${box} overflow-x-auto`}>
        <table className="admin-responsive-table w-full min-w-[1050px] text-left text-sm">
            <thead className="border-b border-gold-500/20 text-[10px] font-bold uppercase tracking-[0.2em] text-gold-400 bg-obsidian/50">
                <tr>
                    <th className="p-4">Order #</th>
                    <th className="p-4">Placed Date</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Payment</th>
                    <th className="p-4">Items</th>
                    <th className="p-4 text-right">Total</th>
                    <th className="p-4 text-center">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gold-500/10">
                {orders.map((order) => {
                    const payment = primaryPayment(order);
                    const itemCount = order.itemCount ?? order.itemsSnapshot?.length ?? 0;
                    const statusColor =
                        order.status === 'CONFIRMED'
                            ? 'text-emerald-400 border-emerald-500/30 bg-emerald-950/20'
                            : order.status === 'CANCELLED' || order.status === 'PAYMENT_FAILED'
                              ? 'text-red-300 border-red-500/30 bg-red-950/20'
                              : 'text-amber-300 border-amber-500/30 bg-amber-950/20';

                    return (
                        <tr key={order.id} className="transition-colors hover:bg-gold-400/[.03]">
                            <td data-label="Order" className="p-4 font-display text-lg text-cream">{order.orderNumber}</td>
                            <td data-label="Placed" className="p-4 text-xs text-cream/50">{shortDate(order.createdAt)}</td>
                            <td data-label="Customer" className="p-4 text-xs">
                                <p className="font-medium text-cream">{order.addressSnapshot?.recipientName || 'Customer'}</p>
                                <p className="mt-0.5 text-cream/45">{order.addressSnapshot?.email || 'No email'}</p>
                            </td>
                            <td data-label="Status" className="p-4">
                                <span className={`inline-block rounded-full border px-3 py-1 text-[10px] font-bold tracking-wider ${statusColor}`}>
                                    {titleCase(order.status)}
                                </span>
                            </td>
                            <td data-label="Payment" className="p-4 text-xs">
                                {payment ? (
                                    <>
                                        <p className="font-medium text-cream">{titleCase(payment.status)}</p>
                                        <p className="mt-0.5 text-cream/45">{payment.method ? titleCase(payment.method) : 'HDFC SmartGateway'}</p>
                                    </>
                                ) : (
                                    <span className="text-cream/45">Awaiting payment</span>
                                )}
                            </td>
                            <td data-label="Items" className="p-4 text-xs text-cream/60">{itemCount} line {itemCount === 1 ? 'item' : 'items'}</td>
                            <td data-label="Total" className="p-4 text-right font-semibold text-gold-300">{rupees(order.totalPaise)}</td>
                            <td data-label="Actions" className="p-4 text-center">
                                <div className="flex items-center justify-center gap-2">
                                    {onInspect && (
                                        <button
                                            onClick={() => onInspect(order)}
                                            className="flex items-center gap-1 rounded-sm border border-gold-500/25 bg-carbon px-2.5 py-1.5 text-xs text-gold-300 hover:border-gold-400"
                                            title="Inspect Order"
                                        >
                                            <IconEye size={14} /> View
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
        {orders.length === 0 && <p className="p-10 text-center text-sm text-cream/40">No matching order records found.</p>}
    </div>
);

/** The inline form open inside the order dialog, if any. Closing it (Cancel) aborts the action. */
type OrderActionForm =
    | { kind: 'shipment'; carrier: string }
    | { kind: 'tracking'; shipmentId: string; status: string; note: string }
    | { kind: 'review'; returnId: string; status: 'APPROVED' | 'REJECTED' | 'RECEIVED'; note: string; restock: boolean }
    | { kind: 'refund'; returnId: string; amount: string; error: string }
    | { kind: 'cancel'; reason: string; error: string };

const actionButton = 'rounded-sm border px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50';
const ORDER_PAGE_SIZE = 100;

const OrdersAdmin = () => {
    const { session } = useAuth();
    const roles = session?.roles ?? [];
    const can = (...allowed: AppRole[]) => allowed.some((role) => roles.includes(role));
    // Mirrors the @Roles on each backend route so nobody is offered a button that will 403.
    // Support staff view orders and handle returns; fulfilment moves belong to the warehouse.
    const canShip = can('ADMIN', 'WAREHOUSE_MANAGER');
    const canTransition = can('ADMIN', 'WAREHOUSE_MANAGER');
    const canTrack = can('ADMIN', 'WAREHOUSE_MANAGER');
    const canCancel = can('ADMIN');
    const canReviewReturns = can('ADMIN', 'SUPPORT_AGENT', 'WAREHOUSE_MANAGER');
    const canRestock = can('ADMIN', 'WAREHOUSE_MANAGER');
    const canRefund = can('ADMIN', 'SUPPORT_AGENT');

    const [orders, setOrders] = useState<Order[]>([]);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [selected, setSelected] = useState<Order | null>(null);
    const [detail, setDetail] = useState<Order | null>(null);
    const [detailError, setDetailError] = useState('');
    const [form, setForm] = useState<OrderActionForm | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const listRequest = useRef<AbortController | null>(null);
    const detailRequest = useRef<AbortController | null>(null);
    const closeOrder = () => {
        detailRequest.current?.abort();
        setSelected(null);
        setDetail(null);
        setForm(null);
        setDetailError('');
    };
    const orderDialogRef = useDialog<HTMLDivElement>(Boolean(selected), closeOrder);

    const load = async (search = '', status = 'ALL', offset = 0, append = false) => {
        // Only the latest list request may write state, so fast filter clicks never show stale rows.
        listRequest.current?.abort();
        const controller = new AbortController();
        listRequest.current = controller;
        setLoadingOrders(true);
        try {
            const trimmed = search.trim();
            const result = await api.adminOrders(
                new URLSearchParams({
                    limit: String(ORDER_PAGE_SIZE),
                    offset: String(offset),
                    ...(trimmed ? { search: trimmed } : {}),
                    ...(status !== 'ALL' ? { status } : {}),
                }).toString(),
                controller.signal,
            );
            if (controller.signal.aborted) return;
            setOrders((current) => {
                if (!append) return result;
                const existingIds = new Set(current.map((order) => order.id));
                return [...current, ...result.filter((order) => !existingIds.has(order.id))];
            });
            setHasMore(result.length === ORDER_PAGE_SIZE);
        } catch (caught) {
            if (!controller.signal.aborted) {
                setError(caught instanceof Error ? caught.message : 'Unable to load orders.');
            }
        } finally {
            if (listRequest.current === controller) {
                listRequest.current = null;
                setLoadingOrders(false);
            }
        }
    };

    useEffect(() => {
        void load('', 'ALL', 0, false);
        return () => {
            listRequest.current?.abort();
            detailRequest.current?.abort();
        };
    }, []);

    /** Puts a fresh detail in the dialog and in its list row, without touching pagination. */
    const replaceOrder = (next: Order) => {
        setDetail((current) => (current && current.id !== next.id ? current : next));
        setSelected((current) => (current && current.id === next.id ? next : current));
        setOrders((current) =>
            current.map((order) => (order.id === next.id ? { ...next, itemCount: next.itemsSnapshot?.length ?? order.itemCount } : order)),
        );
    };

    const fetchDetail = async (orderId: string): Promise<Order | null> => {
        detailRequest.current?.abort();
        const controller = new AbortController();
        detailRequest.current = controller;
        try {
            const next = await api.adminOrder(orderId, controller.signal);
            if (controller.signal.aborted) return null;
            replaceOrder(next);
            setDetailError('');
            return next;
        } catch (caught) {
            if (!controller.signal.aborted) setDetailError(caught instanceof Error ? caught.message : 'Unable to load this order.');
            return null;
        }
    };

    const inspect = (order: Order) => {
        setSelected(order);
        setDetail(null);
        setForm(null);
        setDetailError('');
        void fetchDetail(order.id);
    };

    /** Runs one order action with a busy state, a success toast, and a refetch of the order. */
    const run = async (key: string, action: () => Promise<string | void>, failure: string, orderId = detail?.id) => {
        if (busy) return;
        setBusy(key);
        setError('');
        try {
            const message = await action();
            if (message) setSuccessMsg(message);
            setForm(null);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : failure);
        } finally {
            // Refetch even after a failure: the server may have applied part of the action.
            if (orderId) await fetchDetail(orderId);
            setBusy(null);
        }
    };

    const downloadInvoice = (orderId: string) => {
        if (busy) return;
        setBusy('invoice');
        setError('');
        // Opens the tab synchronously inside the click so popup blockers allow it.
        openTrustedUrlFrom(() => api.adminInvoice(orderId).then((result) => result?.url))
            .catch((caught) => setError(caught instanceof Error ? caught.message : 'Invoice unavailable.'))
            .finally(() => setBusy(null));
    };

    const transition = (status: string) => {
        if (!detail) return;
        void run('transition', async () => {
            replaceOrder(await api.transitionOrder(detail.id, status));
            return `Order moved to ${titleCase(status)}.`;
        }, 'Unable to update order status.');
    };

    const submitShipment = (carrier: string) => {
        if (!detail) return;
        void run('shipment', async () => {
            await api.createShipment(detail.id, carrier.trim() || undefined);
            return 'Shipment created.';
        }, 'Unable to create shipment.');
    };

    const submitTracking = (shipmentId: string, status: string, note: string) => {
        if (!detail || !status) return;
        void run('tracking', async () => {
            await api.addTrackingEvent(shipmentId, {
                providerEventId: `manual-${Date.now()}`,
                status,
                occurredAt: new Date().toISOString(),
                message: note.trim() || 'Updated by staff',
            });
            return `Shipment marked ${titleCase(status)}.`;
        }, 'Unable to add tracking event.');
    };

    const submitReview = (returnId: string, status: string, note: string, restock: boolean) => {
        if (!detail) return;
        if (status === 'REJECTED' && !window.confirm('Reject this return request? The customer will not be refunded.')) return;
        void run('review', async () => {
            const result = await api.reviewReturn(returnId, status, note.trim() || undefined, restock);
            const restocked = result?.restockedUnits ? ` ${result.restockedUnits} unit${result.restockedUnits === 1 ? '' : 's'} returned to stock.` : '';
            return `Return ${titleCase(status).toLowerCase()}.${restocked}`;
        }, 'Unable to review return.');
    };

    const submitRefund = (returnId: string, amount: string) => {
        if (!detail) return;
        const payment = detail.payments?.find((item) => item.status === 'CAPTURED' || item.status === 'REFUNDED');
        if (!payment) {
            setError('No captured payment is available for refund.');
            return;
        }
        const remaining = refundablePaise(payment);
        const amountPaise = parseRupeesToPaise(amount);
        const invalid = !amountPaise
            ? 'Enter a refund amount in rupees, for example 1299 or 1,299.50.'
            : amountPaise > remaining
              ? `At most ${rupees(remaining)} can still be refunded.`
              : '';
        if (invalid || !amountPaise) {
            setForm({ kind: 'refund', returnId, amount, error: invalid });
            return;
        }
        const customer = detail.addressSnapshot?.recipientName || 'the customer';
        const method = payment.method ? titleCase(payment.method) : 'original payment method';
        if (!window.confirm(`Refund ${rupees(amountPaise)} to ${customer} (${method}, order ${detail.orderNumber})?`)) return;
        void run('refund', async () => {
            const refund = await api.createRefund({
                paymentId: payment.id,
                returnRequestId: returnId,
                amountPaise,
                idempotencyKey: returnRefundKey(returnId, payment),
                reason: 'Approved customer return',
            });
            return refund?.status === 'PROCESSED'
                ? `Refunded ${rupees(amountPaise)}.`
                : `Refund of ${rupees(amountPaise)} submitted; HDFC has not confirmed it yet and it will be reconciled automatically.`;
        }, 'Unable to create refund.');
    };

    const submitCancel = (reason: string) => {
        if (!detail) return;
        const trimmed = reason.trim();
        if (trimmed.length < 3) {
            setForm({ kind: 'cancel', reason, error: 'Enter a reason of at least 3 characters; it is kept in the audit log.' });
            return;
        }
        const refundPaise = cancellationRefundPaise(detail);
        void run('cancel', async () => {
            replaceOrder(await api.cancelAdminOrder(detail.id, trimmed));
            return refundPaise > 0
                ? `Order cancelled and stock released. A refund of ${rupees(refundPaise)} is being sent to HDFC automatically.`
                : 'Order cancelled and stock released.';
        }, 'Unable to cancel this order.');
    };

    const reconcileRefunds = () => {
        if (busy) return;
        setBusy('reconcile');
        setError('');
        api.reconcileRefunds()
            .then(async (result) => {
                setSuccessMsg(
                    `Checked ${result.inspected} pending refund${result.inspected === 1 ? '' : 's'}: ${result.processed} processed, ${result.failed} failed, ${result.pending} still pending${result.errors ? `, ${result.errors} could not be checked` : ''}.`,
                );
                await Promise.all([load(query, statusFilter), detail ? fetchDetail(detail.id) : Promise.resolve(null)]);
            })
            .catch((caught) => setError(caught instanceof Error ? caught.message : 'Refund reconciliation failed.'))
            .finally(() => setBusy(null));
    };

    const header = detail ?? selected;
    const activeShipment = detail?.shipments?.some((shipment) => shipment.status !== 'CANCELLED') ?? false;

    return (
        <AdminShell title="Orders" description="Search paid customer orders and view their complete product, customer, and payment records.">
            {/* While the order dialog is open its overlay hides the page, so messages render inside it instead. */}
            {!header && <NotificationToast message={error} type="error" onClose={() => setError('')} />}
            {!header && <NotificationToast message={successMsg} type="success" onClose={() => setSuccessMsg('')} />}

            {/* Filter Tabs & Search Bar */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void load(query, statusFilter);
                    }}
                    className="flex w-full max-w-md border border-gold-500/25 bg-carbon rounded-sm"
                >
                    <IconSearch className="m-3 text-gold-400" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none text-cream"
                        placeholder="Search order number, customer name or email…"
                    />
                    <button className="bg-gold-400 px-5 text-xs font-bold uppercase tracking-wider text-obsidian hover:bg-gold-300">Search</button>
                </form>

                <div className="admin-filter-pills flex max-w-full flex-nowrap gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
                    {['ALL', 'PAYMENT_PENDING', 'PAYMENT_FAILED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map((st) => (
                        <button
                            key={st}
                            onClick={() => {
                                setStatusFilter(st);
                                void load(query, st);
                            }}
                            className={`rounded-sm border px-3 py-1.5 text-xs font-medium transition-colors ${
                                statusFilter === st
                                    ? 'border-gold-400 bg-gold-400/20 text-gold-300'
                                    : 'border-gold-500/20 bg-carbon text-cream/50 hover:border-gold-500/40 hover:text-cream'
                            }`}
                        >
                            {titleCase(st)}
                        </button>
                    ))}
                </div>
                {canRefund && (
                    <button
                        type="button"
                        disabled={busy !== null}
                        onClick={reconcileRefunds}
                        className="border border-gold-500/30 px-4 py-2 text-xs font-bold uppercase text-gold-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {busy === 'reconcile' ? 'Reconciling…' : 'Reconcile refunds'}
                    </button>
                )}
            </div>

            <OrdersTable orders={orders} onInspect={inspect} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-cream/55">
                <span>{loadingOrders ? 'Loading orders…' : `Showing ${orders.length}${hasMore ? '+' : ''} orders`}</span>
                {hasMore && (
                    <button
                        type="button"
                        disabled={loadingOrders}
                        onClick={() => void load(query, statusFilter, orders.length, true)}
                        className="rounded-sm border border-gold-500/30 px-4 py-2 font-semibold text-gold-300 hover:border-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Load 100 more
                    </button>
                )}
            </div>

            {/* Order Inspector Modal */}
            {header && (
                <AdminModalLayer>
                <div className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden bg-black/85 p-2 backdrop-blur-sm sm:items-center sm:p-4">
                    <div
                        ref={orderDialogRef}
                        tabIndex={-1}
                        className="max-h-[calc(100svh-1rem)] w-full max-w-3xl overflow-y-auto rounded-sm border border-gold-500/30 bg-carbon p-4 shadow-2xl outline-none sm:max-h-[90vh] sm:p-6"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="admin-order-dialog-title"
                        aria-busy={!detail || busy !== null}
                    >
                        <div className="flex items-center justify-between border-b border-gold-500/20 pb-4">
                            <div>
                                <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-gold-400">Order Inspection</span>
                                <h2 id="admin-order-dialog-title" className="font-display text-3xl text-cream">
                                    {header.orderNumber}
                                </h2>
                            </div>
                            <button type="button" onClick={closeOrder} className="grid size-11 shrink-0 place-items-center rounded-sm text-cream/60 hover:bg-obsidian hover:text-cream" aria-label="Close order dialog">
                                <IconClose size={22} />
                            </button>
                        </div>
                        <div className="mt-4 empty:hidden">
                            <NotificationToast message={error} type="error" onClose={() => setError('')} />
                            <NotificationToast message={successMsg} type="success" onClose={() => setSuccessMsg('')} />
                        </div>

                        {!detail ? (
                            <div className="py-12 text-center text-sm text-cream/50" role={detailError ? 'alert' : 'status'}>
                                {detailError ? (
                                    <>
                                        <p className="text-red-300">{detailError}</p>
                                        <button type="button" onClick={() => void fetchDetail(header.id)} className="mt-4 border border-gold-500/30 px-4 py-2 text-xs text-gold-300">
                                            Try again
                                        </button>
                                    </>
                                ) : (
                                    'Loading order details…'
                                )}
                            </div>
                        ) : (
                        <>
                        <div className="mt-6 grid gap-6 md:grid-cols-2">
                            {/* Summary Box */}
                            <div className="border border-gold-500/15 bg-obsidian/60 p-4 rounded-sm">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-gold-400">Customer & Contact Details</h4>
                                <div className="mt-3 space-y-1.5 text-xs text-cream/70">
                                    <p>
                                        <strong className="text-cream">Recipient:</strong> {detail.addressSnapshot?.recipientName || 'Customer'}
                                    </p>
                                    <p>
                                        <strong className="text-cream">Email:</strong> {detail.addressSnapshot?.email || 'N/A'}
                                    </p>
                                    <p>
                                        <strong className="text-cream">Phone:</strong> {detail.addressSnapshot?.phone || 'N/A'}
                                    </p>
                                    <p>
                                        <strong className="text-cream">Address:</strong> {detail.addressSnapshot?.line1},{' '}
                                        {detail.addressSnapshot?.line2 ? `${detail.addressSnapshot.line2}, ` : ''}
                                        {detail.addressSnapshot?.city}, {detail.addressSnapshot?.state}{' '}
                                        {detail.addressSnapshot?.postalCode}, {detail.addressSnapshot?.country || 'IN'}
                                    </p>
                                </div>
                            </div>

                            <div className="border border-gold-500/15 bg-obsidian/60 p-4 rounded-sm">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-gold-400">Order & Payment Summary</h4>
                                <div className="mt-3 space-y-1.5 text-xs text-cream/70">
                                    <p>
                                        <strong className="text-cream">Current Status:</strong>{' '}
                                        <span className="text-gold-300 font-semibold">{titleCase(detail.status)}</span>
                                    </p>
                                    <p>
                                        <strong className="text-cream">Placed On:</strong> {new Date(detail.createdAt).toLocaleString('en-IN')}
                                    </p>
                                    <p>
                                        <strong className="text-cream">Items subtotal:</strong> {rupees(detail.subtotalPaise)}
                                    </p>
                                    {detail.discountPaise > 0 && (
                                        <p>
                                            <strong className="text-cream">Discount:</strong> -{rupees(detail.discountPaise)}
                                        </p>
                                    )}
                                    <p>
                                        <strong className="text-cream">Tax:</strong> {rupees(detail.taxPaise)}
                                    </p>
                                    <p>
                                        <strong className="text-cream">Total paid:</strong>{' '}
                                        <span className="font-display text-base text-gold-300">{rupees(detail.totalPaise)}</span>
                                    </p>
                                    <p>
                                        <strong className="text-cream">HDFC order:</strong> {detail.hdfcOrderId || 'Legacy (pre-HDFC) order'}
                                    </p>
                                    {detail.payments?.map((payment) => (
                                        <div key={payment.id} className="border-t border-gold-500/10 pt-2">
                                            <p><strong className="text-cream">Payment:</strong> {titleCase(payment.status)} · {rupees(payment.amountPaise)}</p>
                                            <p><strong className="text-cream">Method:</strong> {payment.method ? titleCase(payment.method) : 'Not reported'}</p>
                                            <p><strong className="text-cream">Payment ID:</strong> {payment.hdfcTransactionId || 'Not reported'}</p>
                                            {payment.capturedAt && <p><strong className="text-cream">Captured:</strong> {new Date(payment.capturedAt).toLocaleString('en-IN')}</p>}
                                            {(payment.refunds ?? []).length > 0 && <p><strong className="text-cream">Refunds:</strong> {payment.refunds.map((refund) => `${titleCase(refund.status)} ${rupees(refund.amountPaise)}`).join(', ')}</p>}
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        disabled={busy !== null}
                                        onClick={() => downloadInvoice(detail.id)}
                                        className="flex items-center gap-2 rounded-sm border border-gold-500/30 bg-carbon px-3 py-2 text-xs text-gold-300 hover:border-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <IconDownload size={14} /> {busy === 'invoice' ? 'Preparing invoice…' : 'Download Invoice'}
                                    </button>
                                    {detail.status === 'CONFIRMED' && canTransition && (
                                        <button type="button" disabled={busy !== null} onClick={() => transition('PROCESSING')} className="rounded-sm bg-gold-400 px-3 py-2 text-xs font-bold text-obsidian disabled:cursor-not-allowed disabled:opacity-50">
                                            {busy === 'transition' ? 'Updating…' : 'Start processing'}
                                        </button>
                                    )}
                                    {detail.status === 'PROCESSING' && canShip && !activeShipment && form?.kind !== 'shipment' && (
                                        <button type="button" disabled={busy !== null} onClick={() => setForm({ kind: 'shipment', carrier: '' })} className="rounded-sm bg-gold-400 px-3 py-2 text-xs font-bold text-obsidian disabled:cursor-not-allowed disabled:opacity-50">
                                            Create shipment
                                        </button>
                                    )}
                                    {canCancel && canAdminCancelOrder(detail) && form?.kind !== 'cancel' && (
                                        <button
                                            type="button"
                                            disabled={busy !== null}
                                            onClick={() => setForm({ kind: 'cancel', reason: '', error: '' })}
                                            className={`${actionButton} border-red-500/40 text-red-300 hover:border-red-400`}
                                        >
                                            Cancel order
                                        </button>
                                    )}
                                </div>
                                {form?.kind === 'cancel' && (
                                    <form
                                        role="alertdialog"
                                        aria-labelledby="cancel-order-title"
                                        aria-describedby="cancel-order-summary"
                                        noValidate
                                        className="mt-4 space-y-3 rounded-sm border border-red-500/40 bg-red-950/20 p-4 text-xs text-cream/80"
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            submitCancel(form.reason);
                                        }}
                                    >
                                        <h5 id="cancel-order-title" className="text-sm font-bold text-red-200">Cancel order {detail.orderNumber}?</h5>
                                        <div id="cancel-order-summary" className="space-y-1">
                                            {cancellationRefundPaise(detail) > 0 ? (
                                                detail.hdfcOrderId ? (
                                                    <p>The customer will be refunded <strong className="text-cream">{rupees(cancellationRefundPaise(detail))}</strong> through HDFC automatically.</p>
                                                ) : (
                                                    <p>This is a legacy (pre-HDFC) payment of <strong className="text-cream">{rupees(cancellationRefundPaise(detail))}</strong>; refund it manually.</p>
                                                )
                                            ) : (
                                                <p>No captured payment remains to refund.</p>
                                            )}
                                            <p>Its stock goes back to inventory and the customer is notified. This cannot be undone.</p>
                                        </div>
                                        <label className="block">
                                            Reason (required, kept in the audit log)
                                            <textarea
                                                value={form.reason}
                                                maxLength={500}
                                                required
                                                onChange={(event) => setForm({ ...form, reason: event.target.value, error: '' })}
                                                className={`${textareaStyle} mt-1`}
                                                aria-invalid={Boolean(form.error)}
                                                aria-describedby={form.error ? 'cancel-order-error' : undefined}
                                                autoFocus
                                            />
                                        </label>
                                        {form.error && <p id="cancel-order-error" className="text-red-300" role="alert">{form.error}</p>}
                                        <div className="flex flex-wrap gap-2">
                                            <button type="submit" disabled={busy !== null} className="rounded-sm bg-red-400 px-3 py-2 text-xs font-bold text-obsidian disabled:cursor-not-allowed disabled:opacity-50">
                                                {busy === 'cancel' ? 'Cancelling…' : 'Cancel order and refund'}
                                            </button>
                                            <button type="button" disabled={busy !== null} onClick={() => setForm(null)} className={`${actionButton} border-gold-500/30 text-cream/70`}>
                                                Keep order
                                            </button>
                                        </div>
                                    </form>
                                )}
                                {form?.kind === 'shipment' && (
                                    <form
                                        className="mt-4 space-y-3 border-t border-gold-500/10 pt-4"
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            submitShipment(form.carrier);
                                        }}
                                    >
                                        <label className="block text-xs text-cream/70">
                                            Carrier (optional)
                                            <input
                                                value={form.carrier}
                                                maxLength={100}
                                                onChange={(event) => setForm({ ...form, carrier: event.target.value })}
                                                className={`${inputStyle} mt-1`}
                                                placeholder="e.g. Blue Dart"
                                                autoFocus
                                            />
                                        </label>
                                        <div className="flex gap-2">
                                            <button type="submit" disabled={busy !== null} className="rounded-sm bg-gold-400 px-3 py-2 text-xs font-bold text-obsidian disabled:cursor-not-allowed disabled:opacity-50">
                                                {busy === 'shipment' ? 'Creating…' : 'Create shipment'}
                                            </button>
                                            <button type="button" disabled={busy !== null} onClick={() => setForm(null)} className={`${actionButton} border-gold-500/30 text-cream/70`}>
                                                Cancel
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        </div>

                        {(detail.shipments || []).length > 0 && (
                            <section className="mt-6 border border-gold-500/15 bg-obsidian/40 p-4">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-gold-400">Shipments</h4>
                                {(detail.shipments || []).map((shipment) => {
                                    const nextStatuses = nextShipmentStatuses(shipment.status);
                                    const editing = form?.kind === 'tracking' && form.shipmentId === shipment.id ? form : null;
                                    return (
                                        <div key={shipment.id} className="mt-3 text-xs text-cream/70">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <span>{shipment.carrier || shipment.provider} · {shipment.trackingNumber || 'Tracking pending'} · {titleCase(shipment.status)}</span>
                                                {canTrack && nextStatuses.length > 0 && !editing && (
                                                    <button
                                                        type="button"
                                                        disabled={busy !== null}
                                                        onClick={() => setForm({ kind: 'tracking', shipmentId: shipment.id, status: nextStatuses[0], note: '' })}
                                                        className={`${actionButton} border-gold-500/30 text-gold-300`}
                                                    >
                                                        Add tracking update
                                                    </button>
                                                )}
                                            </div>
                                            {editing && (
                                                <form
                                                    className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                                                    onSubmit={(event) => {
                                                        event.preventDefault();
                                                        submitTracking(shipment.id, editing.status, editing.note);
                                                    }}
                                                >
                                                    <label className="block">
                                                        New status
                                                        <select
                                                            value={editing.status}
                                                            onChange={(event) => setForm({ ...editing, status: event.target.value })}
                                                            className={`${inputStyle} mt-1`}
                                                        >
                                                            {nextStatuses.map((status) => (
                                                                <option key={status} value={status}>{titleCase(status)}</option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    <label className="block">
                                                        Note (optional)
                                                        <input
                                                            value={editing.note}
                                                            maxLength={500}
                                                            onChange={(event) => setForm({ ...editing, note: event.target.value })}
                                                            className={`${inputStyle} mt-1`}
                                                        />
                                                    </label>
                                                    <div className="flex gap-2">
                                                        <button type="submit" disabled={busy !== null} className="rounded-sm bg-gold-400 px-3 py-2 text-xs font-bold text-obsidian disabled:cursor-not-allowed disabled:opacity-50">
                                                            {busy === 'tracking' ? 'Saving…' : 'Save'}
                                                        </button>
                                                        <button type="button" disabled={busy !== null} onClick={() => setForm(null)} className={`${actionButton} border-gold-500/30 text-cream/70`}>
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </form>
                                            )}
                                        </div>
                                    );
                                })}
                            </section>
                        )}

                        {(detail.returns || []).length > 0 && (
                            <section className="mt-6 border border-gold-500/15 bg-obsidian/40 p-4">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-gold-400">Returns</h4>
                                {(detail.returns || []).map((item) => {
                                    const reviewing = form?.kind === 'review' && form.returnId === item.id ? form : null;
                                    const refunding = form?.kind === 'refund' && form.returnId === item.id ? form : null;
                                    const refundPayment = detail.payments?.find((payment) => payment.status === 'CAPTURED' || payment.status === 'REFUNDED');
                                    const openReview = (status: 'APPROVED' | 'REJECTED' | 'RECEIVED') =>
                                        setForm({ kind: 'review', returnId: item.id, status, note: '', restock: false });
                                    return (
                                        <div key={item.id} className="mt-3 border-t border-gold-500/10 pt-3 text-xs text-cream/70">
                                            <p>{titleCase(item.status)} · {item.reason}</p>
                                            {item.reviewNote && <p className="mt-1 text-cream/50">Note: {item.reviewNote}</p>}
                                            {!reviewing && !refunding && (
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {item.status === 'REQUESTED' && canReviewReturns && (
                                                        <>
                                                            <button type="button" disabled={busy !== null} onClick={() => openReview('APPROVED')} className={`${actionButton} border-emerald-500/30 text-emerald-300`}>Approve</button>
                                                            <button type="button" disabled={busy !== null} onClick={() => openReview('REJECTED')} className={`${actionButton} border-red-500/30 text-red-300`}>Reject</button>
                                                        </>
                                                    )}
                                                    {item.status === 'APPROVED' && canReviewReturns && (
                                                        <button type="button" disabled={busy !== null} onClick={() => openReview('RECEIVED')} className={`${actionButton} border-gold-500/30 text-gold-300`}>Mark received</button>
                                                    )}
                                                    {item.status === 'RECEIVED' && canRefund && refundPayment && (
                                                        <button
                                                            type="button"
                                                            disabled={busy !== null}
                                                            onClick={() => setForm({ kind: 'refund', returnId: item.id, amount: refundAmountInput(refundablePaise(refundPayment)), error: '' })}
                                                            className="rounded-sm bg-gold-400 px-3 py-2 font-bold text-obsidian disabled:cursor-not-allowed disabled:opacity-50"
                                                        >
                                                            Create refund
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                            {reviewing && (
                                                <form
                                                    className="mt-3 space-y-3"
                                                    onSubmit={(event) => {
                                                        event.preventDefault();
                                                        submitReview(item.id, reviewing.status, reviewing.note, reviewing.restock);
                                                    }}
                                                >
                                                    <label className="block">
                                                        Review note (optional)
                                                        <textarea
                                                            value={reviewing.note}
                                                            maxLength={1000}
                                                            onChange={(event) => setForm({ ...reviewing, note: event.target.value })}
                                                            className={`${textareaStyle} mt-1`}
                                                        />
                                                    </label>
                                                    {reviewing.status === 'RECEIVED' && canRestock && (
                                                        <label className="flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={reviewing.restock}
                                                                onChange={(event) => setForm({ ...reviewing, restock: event.target.checked })}
                                                            />
                                                            Add the returned items back to stock
                                                        </label>
                                                    )}
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="submit"
                                                            disabled={busy !== null}
                                                            className={`rounded-sm px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50 ${reviewing.status === 'REJECTED' ? 'bg-red-400 text-obsidian' : 'bg-gold-400 text-obsidian'}`}
                                                        >
                                                            {busy === 'review'
                                                                ? 'Saving…'
                                                                : reviewing.status === 'APPROVED'
                                                                  ? 'Approve return'
                                                                  : reviewing.status === 'REJECTED'
                                                                    ? 'Reject return'
                                                                    : 'Mark received'}
                                                        </button>
                                                        <button type="button" disabled={busy !== null} onClick={() => setForm(null)} className={`${actionButton} border-gold-500/30 text-cream/70`}>
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </form>
                                            )}
                                            {refunding && refundPayment && (
                                                <form
                                                    className="mt-3 space-y-3"
                                                    noValidate
                                                    onSubmit={(event) => {
                                                        event.preventDefault();
                                                        submitRefund(item.id, refunding.amount);
                                                    }}
                                                >
                                                    <label className="block">
                                                        Refund amount (₹) · up to {rupees(refundablePaise(refundPayment))}
                                                        <input
                                                            value={refunding.amount}
                                                            inputMode="decimal"
                                                            onChange={(event) => setForm({ ...refunding, amount: event.target.value, error: '' })}
                                                            className={`${inputStyle} mt-1`}
                                                            aria-invalid={Boolean(refunding.error)}
                                                            aria-describedby={refunding.error ? `refund-error-${item.id}` : undefined}
                                                            autoFocus
                                                        />
                                                    </label>
                                                    {refunding.error && <p id={`refund-error-${item.id}`} className="text-red-300" role="alert">{refunding.error}</p>}
                                                    <div className="flex gap-2">
                                                        <button type="submit" disabled={busy !== null} className="rounded-sm bg-gold-400 px-3 py-2 text-xs font-bold text-obsidian disabled:cursor-not-allowed disabled:opacity-50">
                                                            {busy === 'refund' ? 'Refunding…' : 'Refund'}
                                                        </button>
                                                        <button type="button" disabled={busy !== null} onClick={() => setForm(null)} className={`${actionButton} border-gold-500/30 text-cream/70`}>
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </form>
                                            )}
                                        </div>
                                    );
                                })}
                            </section>
                        )}

                        {/* Items Snapshot Table */}
                        <div className="mt-6">
                            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-gold-400">Ordered Line Items</h4>
                            <div className="overflow-hidden rounded-sm border border-gold-500/20 bg-obsidian/40">
                                <table className="admin-responsive-table w-full text-left text-xs">
                                    <thead className="border-b border-gold-500/15 bg-carbon text-[9px] uppercase tracking-wider text-cream/40">
                                        <tr>
                                            <th className="p-3">Product details</th>
                                            <th className="p-3">SKU / Alias</th>
                                            <th className="p-3">Selected options</th>
                                            <th className="p-3 text-right">Price</th>
                                            <th className="p-3 text-center">Qty</th>
                                            <th className="p-3 text-right">Line Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gold-500/10">
                                        {(detail.itemsSnapshot || []).map((item, idx) => (
                                            <tr key={idx}>
                                                <td data-label="Product" className="p-3">
                                                    <div className="flex min-w-[240px] gap-3">
                                                        <img
                                                            loading="lazy"
                                                            decoding="async"
                                                            src={item.imageUrl || fallbackImage}
                                                            alt=""
                                                            className="size-12 shrink-0 rounded-sm border border-gold-500/20 bg-carbon object-contain"
                                                            onError={(event) => { event.currentTarget.src = fallbackImage; }}
                                                        />
                                                        <div>
                                                            <p className="font-semibold text-cream">{item.productName}</p>
                                                            {item.categoryName && <p className="mt-0.5 text-[10px] uppercase tracking-wider text-gold-400/75">{item.categoryName}</p>}
                                                            <p className="mt-0.5 text-cream/60">Option: {item.optionLabel || item.color || item.sku}</p>
                                                            {item.productDescription && <p className="mt-1 max-w-xs text-[10px] leading-relaxed text-cream/45">{item.productDescription}</p>}
                                                            {item.productMaterial && <p className="mt-1 text-[10px] text-cream/45">Material: {item.productMaterial}</p>}
                                                            {item.productSlug && (
                                                                <a href={`/product/${item.productSlug}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[10px] text-gold-300 hover:text-gold-100">
                                                                    View product ↗
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td data-label="SKU / Alias" className="p-3 text-cream/60">
                                                    <p>{item.sku || 'No SKU'}</p>
                                                    <p className="mt-1 text-[10px] text-cream/40">Alias: {item.alias || '—'}</p>
                                                </td>
                                                <td data-label="Options" className="p-3 text-cream/60">
                                                    {orderItemAttributes(item.attributes).length > 0 ? (
                                                        <div className="flex max-w-40 flex-wrap gap-1">
                                                            {orderItemAttributes(item.attributes).map(([key, value]) => (
                                                                <span key={key} className="rounded border border-gold-500/20 bg-carbon px-1.5 py-0.5 text-[10px] text-cream/70">
                                                                    {titleCase(key)}: {value}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-cream/40">No options</span>
                                                    )}
                                                </td>
                                                <td data-label="Price" className="p-3 text-right text-cream/70">{rupees(item.unitPricePaise)}</td>
                                                <td data-label="Quantity" className="p-3 text-center text-cream/80 font-bold">{item.quantity}</td>
                                                <td data-label="Line total" className="p-3 text-right font-semibold text-gold-300">{rupees(item.lineTotalPaise)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        </>
                        )}
                    </div>
                </div>
                </AdminModalLayer>
            )}
        </AdminShell>
    );
};

// ----------------------------------------------------
// 3. CATALOGUE & CATEGORY MANAGEMENT
// ----------------------------------------------------
interface VariantDraft {
    key: string;
    id?: string;
    sku: string;
    alias: string;
    color: string;
    colorHex: string;
    size: string;
    packQuantity: string;
    priceRupees: string;
    compareAtPriceRupees: string;
    isActive: boolean;
    attributes: Record<string, unknown>;
    images: File[];
    driveImageUrls: string;
    imageScope: 'color' | 'exact';
}

interface CatalogueImportProgress {
    fileName: string;
    phase: 'loading' | 'categories' | 'products' | 'rollback' | 'refreshing';
    detail: string;
    completedProducts: number;
    totalProducts: number;
}

const catalogueImportPhaseLabel: Record<CatalogueImportProgress['phase'], string> = {
    loading: 'Reading current catalogue',
    categories: 'Preparing categories',
    products: 'Importing catalogue',
    rollback: 'Reverting changes',
    refreshing: 'Refreshing catalogue',
};

const CatalogueImportProgressModal = ({ progress }: { progress: CatalogueImportProgress }) => {
    const dialogRef = useDialog<HTMLDivElement>(true, () => undefined, { focusInitial: false });
    const percentage = progress.totalProducts > 0
        ? Math.round((progress.completedProducts / progress.totalProducts) * 100)
        : 0;

    return (
        <AdminModalLayer>
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
                <div
                    ref={dialogRef}
                    tabIndex={-1}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="catalogue-import-dialog-title"
                    aria-describedby="catalogue-import-dialog-description"
                    className="w-full max-w-lg overflow-hidden border border-gold-500/35 bg-carbon shadow-2xl outline-none"
                >
                    <div className="border-b border-gold-500/20 px-5 py-5 sm:px-7">
                        <div className="flex items-start gap-4">
                            <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-gold-400/35 bg-gold-400/10 text-gold-300">
                                <IconRefresh className="animate-spin motion-reduce:animate-none" size={20} aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-400">
                                    {catalogueImportPhaseLabel[progress.phase]}
                                </p>
                                <h2 id="catalogue-import-dialog-title" className="mt-1 font-display text-2xl text-cream sm:text-3xl">
                                    Catalogue import in progress
                                </h2>
                                <p id="catalogue-import-dialog-description" className="mt-2 text-xs leading-5 text-cream/55">
                                    Keep this tab open. The import will finish automatically.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
                        <div>
                            <div className="mb-2 flex items-center justify-between gap-4 text-[11px] font-semibold text-cream/60">
                                <span>{progress.completedProducts} of {progress.totalProducts} products completed</span>
                                <span className="tabular-nums text-gold-300">{percentage}%</span>
                            </div>
                            <div
                                className="h-2 overflow-hidden rounded-full bg-obsidian"
                                role="progressbar"
                                aria-label="Catalogue import progress"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={percentage}
                            >
                                <div
                                    className="h-full rounded-full bg-gold-400 transition-[width] duration-300 motion-reduce:transition-none"
                                    style={{ width: `${percentage}%` }}
                                />
                            </div>
                        </div>

                        <div className="border border-gold-500/20 bg-obsidian/60 p-4">
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cream/35">Current task</p>
                            <p className="mt-2 text-sm leading-6 text-cream" role="status" aria-live="polite" aria-atomic="true">
                                {progress.detail}
                            </p>
                        </div>

                        <div className="flex items-center justify-between gap-4 text-xs text-cream/45">
                            <span className="truncate" title={progress.fileName}>{progress.fileName}</span>
                            <span className="shrink-0">Do not close this window</span>
                        </div>
                    </div>
                </div>
            </div>
        </AdminModalLayer>
    );
};

let variantDraftCounter = 0;

const variantAttribute = (variant: ProductVariant, key: string): string => {
    const value = variant.attributes?.[key];
    return typeof value === 'string' ? value : '';
};

const paiseToRupeesInput = (paise: number): string => String(paise / 100);

const rupeesInputToPaise = (rupeesValue: string): number =>
    Math.round(Number(rupeesValue) * 100);

const driveImageLinks = (value: string): string[] =>
    value
        .split(/\r?\n/)
        .map((link) => link.trim())
        .filter(Boolean);

const categoryNameKey = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

// Limits the API enforces; checking them first avoids a half-saved product.
const MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PRODUCT_VIDEO_BYTES = 25 * 1024 * 1024;
const MAX_PRICE_PAISE = 2_147_483_647;
const UPLOAD_CONCURRENCY = 3;

// Identifies a chosen file across form reads, which may hand back new File objects.
const uploadKey = (productId: string, scope: string, file: File): string =>
    [productId, scope, file.name, file.size, file.lastModified].join('|');

const megabytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Image alt text is limited to 180 characters by the API. */
const imageAltText = (productName: string, optionLabel?: string): string => {
    const text = optionLabel ? `${productName} — ${optionLabel}` : productName;
    return text.length <= 180 ? text : `${text.slice(0, 179).trimEnd()}…`;
};

const sameIds = (left: string[], right: string[]): boolean =>
    left.length === right.length && [...left].sort().join(',') === [...right].sort().join(',');

/** Runs every task with at most `limit` in flight, then throws the first failure. */
const runLimited = async (tasks: Array<() => Promise<void>>, limit = UPLOAD_CONCURRENCY): Promise<void> => {
    const failures: unknown[] = [];
    let next = 0;
    const worker = async () => {
        while (next < tasks.length) {
            const task = tasks[next];
            next += 1;
            try {
                await task();
            } catch (caught) {
                failures.push(caught);
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
    if (failures.length) throw failures[0];
};

/**
 * Imports a Drive image, or reuses the one the product already has from that Drive file.
 * A reused image keeps being shared when it was shared (or the request is shared);
 * otherwise it is also linked to the requested options. `previousVariantIds` lets an
 * import rollback restore its original links instead of deleting it.
 */
const importDriveImage = async (
    productId: string,
    driveUrl: string,
    metadata: { variantIds: string[]; altText: string; sortOrder: number },
): Promise<{ image: Product['images'][number]; previousVariantIds?: string[] }> => {
    const image = await uploadGoogleDriveImage(productId, driveUrl, {
        ...(metadata.variantIds.length ? { variantIds: metadata.variantIds } : {}),
        altText: metadata.altText,
        sortOrder: metadata.sortOrder,
    });
    if (!image.reused) return { image };
    const previousVariantIds = productImageVariantIds(image);
    const variantIds = previousVariantIds.length && metadata.variantIds.length
        ? [...new Set([...previousVariantIds, ...metadata.variantIds])]
        : [];
    if (sameIds(previousVariantIds, variantIds)) return { image, previousVariantIds };
    return { image: await api.updateProductImage(productId, image.id, { variantIds }), previousVariantIds };
};

const productFormProblem = (input: {
    name: string;
    material: string;
    drafts: VariantDraft[];
    sharedImages: File[];
    video: File | null;
}): string | null => {
    if (!input.name) return 'Product name is required.';
    if (input.name.length > 180) return 'Product name must be 180 characters or fewer.';
    if (input.material.length > 120) return 'Material must be 120 characters or fewer.';
    if (input.drafts.length === 0 || !input.drafts.some((draft) => draft.isActive)) {
        return 'Add at least one active product option.';
    }
    const skuOwners = new Map<string, number>();
    for (const [index, draft] of input.drafts.entries()) {
        const option = `option ${index + 1}`;
        const sku = draft.sku.trim().toUpperCase();
        if (!sku) return `SKU is required for ${option}.`;
        const previousIndex = skuOwners.get(sku);
        if (previousIndex !== undefined) {
            return `SKU “${sku}” is used by options ${previousIndex + 1} and ${index + 1}. Each SKU must be unique.`;
        }
        skuOwners.set(sku, index);
        if (draft.packQuantity && (!/^\d+$/.test(draft.packQuantity) || Number(draft.packQuantity) < 1)) {
            return `Pack quantity for ${option} must be a positive whole number.`;
        }
        const price = rupeesInputToPaise(draft.priceRupees);
        if (!draft.priceRupees.trim() || !Number.isFinite(price) || price < 0 || price > MAX_PRICE_PAISE) {
            return `Enter a valid price for ${option}.`;
        }
        if (draft.compareAtPriceRupees.trim()) {
            const compareAt = rupeesInputToPaise(draft.compareAtPriceRupees);
            if (!Number.isFinite(compareAt) || compareAt < 0 || compareAt > MAX_PRICE_PAISE) {
                return `Enter a valid compare-at price for ${option}.`;
            }
            if (compareAt < price) return `Compare-at price for ${option} cannot be lower than its price.`;
        }
        const largeImage = draft.images.find((file) => file.size > MAX_PRODUCT_IMAGE_BYTES);
        if (largeImage) return `“${largeImage.name}” for ${option} is ${megabytes(largeImage.size)}. Images must be 8 MB or smaller.`;
    }
    const largeShared = input.sharedImages.find((file) => file.size > MAX_PRODUCT_IMAGE_BYTES);
    if (largeShared) return `“${largeShared.name}” is ${megabytes(largeShared.size)}. Images must be 8 MB or smaller.`;
    if (input.video && input.video.size > MAX_PRODUCT_VIDEO_BYTES) {
        return `The product video is ${megabytes(input.video.size)}. Videos must be 25 MB or smaller.`;
    }
    return null;
};

const createVariantDraft = (variant?: ProductVariant): VariantDraft => ({
    key: variant?.id || `new-variant-${++variantDraftCounter}`,
    id: variant?.id,
    sku: variant?.sku || '',
    alias: variant?.alias || '',
    color: variant ? variantAttribute(variant, 'color') : '',
    colorHex: variantAttribute(variant || ({ attributes: {} } as ProductVariant), 'colorHex') || '#C5A059',
    size: variant ? variantAttribute(variant, 'size') : '',
    packQuantity: variant?.attributes && typeof variant.attributes.packQuantity === 'number'
        ? String(variant.attributes.packQuantity)
        : '',
    priceRupees: variant ? paiseToRupeesInput(variant.pricePaise) : '',
    compareAtPriceRupees: variant?.compareAtPricePaise
        ? paiseToRupeesInput(variant.compareAtPricePaise)
        : '',
    isActive: variant?.isActive ?? true,
    attributes: variant?.attributes || {},
    images: [],
    driveImageUrls: '',
    imageScope: 'color',
});

const assignmentMode = (variantIds: string[], drafts: VariantDraft[]): string => {
    if (variantIds.length === 0) return 'shared';
    const assigned = [...variantIds].sort().join(',');
    for (const color of [...new Set(drafts.map((draft) => draft.color.trim()).filter(Boolean))]) {
        const colorIds = drafts
            .filter((draft) => draft.id && draft.color.trim().toLocaleLowerCase() === color.toLocaleLowerCase())
            .map((draft) => draft.id!)
            .sort()
            .join(',');
        if (colorIds && colorIds === assigned) return `color:${color}`;
    }
    return 'exact';
};

const PRODUCT_PAGE_SIZES = [20, 50, 100] as const;
type ProductPageSize = (typeof PRODUCT_PAGE_SIZES)[number];
// The product search is sent to the server once typing pauses this long.
const PRODUCT_SEARCH_DEBOUNCE_MS = 300;

const CatalogueAdmin = () => {
    const [activeTab, setActiveTab] = useState<'products' | 'categories'>('products');
    // The current page of products; the server filters, searches and pages the catalogue.
    const [products, setProducts] = useState<Product[]>([]);
    const [productTotal, setProductTotal] = useState(0);
    const [productsLoaded, setProductsLoaded] = useState(false);
    const [productsLoading, setProductsLoading] = useState(true);
    // Bumped to fetch the current page again (after an import, a delete or a new product).
    const [productsVersion, setProductsVersion] = useState(0);
    const [categories, setCategories] = useState<Category[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<Product['status'] | ''>('');
    const [productPage, setProductPage] = useState(1);
    const [productPageSize, setProductPageSize] = useState<ProductPageSize>(20);
    const [exportingCatalogue, setExportingCatalogue] = useState(false);

    const [openProductModal, setOpenProductModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [openingProductId, setOpeningProductId] = useState<string | null>(null);
    const [variantDrafts, setVariantDrafts] = useState<VariantDraft[]>([createVariantDraft()]);
    const [imageAssignments, setImageAssignments] = useState<Record<string, string[]>>({});

    const [openCategoryModal, setOpenCategoryModal] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);

    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const [bulkImporting, setBulkImporting] = useState(false);
    const [bulkImportProgress, setBulkImportProgress] = useState<CatalogueImportProgress | null>(null);
    const [bulkImportErrors, setBulkImportErrors] = useState<string[]>([]);
    // Categories have loaded; an import needs them to match category names.
    const [catalogueLoaded, setCatalogueLoaded] = useState(false);
    // The variant or image being changed in the open product
    // (`variant:<key>` / `image:<id>` while deleting, `image-order:<id>` while moving).
    const [busyItem, setBusyItem] = useState<string | null>(null);
    // Announces the result of moving an image for screen readers (and shows it beside the gallery).
    const [imageOrderNotice, setImageOrderNotice] = useState('');
    // Files and Drive links already uploaded by an earlier, partly failed save of the open
    // product; a retry skips them instead of storing duplicates.
    const uploadedFilesRef = React.useRef(new Set<string>());
    const importedDriveLinksRef = React.useRef(new Set<string>());
    const closeProductModal = () => {
        // Closing mid-save would hide a partial failure and invite a duplicate retry.
        if (saving) return;
        setOpenProductModal(false);
        setEditingProduct(null);
    };
    const productDialogRef = useDialog<HTMLFormElement>(openProductModal, closeProductModal);
    const categoryDialogRef = useDialog<HTMLFormElement>(openCategoryModal, () => {
        if (saving) return;
        setOpenCategoryModal(false);
        setEditingCategory(null);
    });

    const loadCategories = (signal?: AbortSignal) =>
        api.adminCategories(signal)
            .then((cats) => {
                if (signal?.aborted) return;
                setCategories(cats);
                setCatalogueLoaded(true);
            })
            .catch((caught) => {
                if (!signal?.aborted) setError(caught instanceof Error ? caught.message : 'Unable to load catalogue.');
            });

    useEffect(() => {
        const controller = new AbortController();
        void loadCategories(controller.signal);
        return () => controller.abort();
    }, []);

    const reloadProducts = () => setProductsVersion((version) => version + 1);

    // Search typing settles before it reaches the server; a new search starts from page 1.
    useEffect(() => {
        const query = searchQuery.trim();
        if (query === debouncedSearch) return;
        const timer = window.setTimeout(() => {
            setDebouncedSearch(query);
            setProductPage(1);
        }, PRODUCT_SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [searchQuery, debouncedSearch]);

    // Fetches the page being viewed; a newer request aborts the one still in flight.
    useEffect(() => {
        const controller = new AbortController();
        setProductsLoading(true);
        api.adminProducts(
            { page: productPage, limit: productPageSize, q: debouncedSearch, status: statusFilter, category: categoryFilter },
            controller.signal,
        )
            .then((result) => {
                if (controller.signal.aborted) return;
                // Deletes can leave this page past the end; show the last page instead.
                const lastPage = Math.max(1, Math.ceil(result.total / productPageSize));
                if (productPage > lastPage) {
                    setProductPage(lastPage);
                    return;
                }
                setProducts(result.items);
                setProductTotal(result.total);
                setProductsLoaded(true);
                setProductsLoading(false);
            })
            .catch((caught) => {
                if (controller.signal.aborted) return;
                setError(caught instanceof Error ? caught.message : 'Unable to load products.');
                setProductsLoading(false);
            });
        return () => controller.abort();
    }, [productPage, productPageSize, debouncedSearch, statusFilter, categoryFilter, productsVersion]);

    // Updates a product on the current page in place, so saving keeps the page and its position.
    const upsertProduct = (product: Product) =>
        setProducts((current) => current.map((item) => (item.id === product.id ? product : item)));

    // Refreshes one product in the list instead of reloading the whole catalogue.
    const refreshProduct = async (productId: string): Promise<Product | null> => {
        try {
            const product = await api.adminProduct(productId);
            upsertProduct(product);
            return product;
        } catch {
            reloadProducts();
            return null;
        }
    };

    const refreshCatalogue = async () => {
        reloadProducts();
        await loadCategories();
    };

    const openProductEditor = (product: Product | null) => {
        setEditingProduct(product);
        setImageOrderNotice('');
        setVariantDrafts(product?.variants.length ? product.variants.map(createVariantDraft) : [createVariantDraft()]);
        setImageAssignments(Object.fromEntries((product?.images || []).map((image) => [image.id, productImageVariantIds(image)])));
        uploadedFilesRef.current = new Set();
        importedDriveLinksRef.current = new Set();
        setError('');
        setOpenProductModal(true);
    };

    // The list holds card images only, so fetch every image and video before editing.
    const editProduct = async (productId: string) => {
        setOpeningProductId(productId);
        try {
            openProductEditor(await api.adminProduct(productId));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Unable to open product.');
        } finally {
            setOpeningProductId(null);
        }
    };

    const updateVariantDraft = (key: string, update: Partial<VariantDraft>) => {
        setVariantDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...update } : draft)));
    };

    // Create or edit a product. Every step is safe to retry after a failure part-way through:
    // the created product and options keep their ids, and finished uploads are skipped.
    const handleProductSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (saving) return;
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        setError('');
        setSuccessMessage('');

        const name = String(form.get('name') || '').trim();
        const categoryId = String(form.get('categoryId') || '');
        const description = String(form.get('description') || '');
        const material = String(form.get('material') || '').trim();
        const targetStatus = String(form.get('status') || 'DRAFT') as Product['status'];
        const sharedImageFiles = form.getAll('images').filter((file): file is File => file instanceof File && file.size > 0);
        const videoEntry = form.get('videoFile');
        const videoFile = videoEntry instanceof File && videoEntry.size > 0 ? videoEntry : null;
        const problem = productFormProblem({ name, material, drafts: variantDrafts, sharedImages: sharedImageFiles, video: videoFile });
        if (problem) {
            setError(problem);
            return;
        }

        setSaving(true);
        const isNewProduct = !editingProduct;
        let product: Product | null = editingProduct;
        let productSaved = false;
        try {
            // A product being published stays unpublished until its options and media are
            // saved, so shoppers never see a half-built product.
            const publishAtEnd = targetStatus === 'PUBLISHED' && product?.status !== 'PUBLISHED';
            const productInput = {
                categoryId,
                name,
                description,
                shortDescription: productSummary(description),
                material,
                status: publishAtEnd ? (product?.status ?? 'DRAFT') : targetStatus,
            };
            product = product
                ? await api.updateProduct(product.id, { ...productInput, slug: product.slug })
                : await api.createProduct({ ...productInput, slug: slugify(name) });
            productSaved = true;
            const productId = product.id;
            const productName = product.name;
            // A retry now updates this product instead of creating a second one.
            setEditingProduct(product);

            const drafts = variantDrafts.map((draft) => ({ ...draft }));
            const savedVariants = new Map<string, ProductVariant>();
            // Sequential, so new options keep the order they were added in.
            for (const draft of drafts) {
                const color = draft.color.trim();
                const input = {
                    sku: draft.sku.trim().toUpperCase(),
                    alias: draft.alias.trim() || null,
                    pricePaise: rupeesInputToPaise(draft.priceRupees),
                    compareAtPricePaise: draft.compareAtPriceRupees.trim()
                        ? rupeesInputToPaise(draft.compareAtPriceRupees)
                        : null,
                    attributes: draft.attributes,
                    // null clears a colour the option used to have.
                    color: color || null,
                    ...(color ? { colorHex: draft.colorHex } : {}),
                    size: draft.size.trim() || null,
                    packQuantity: draft.packQuantity ? Number(draft.packQuantity) : null,
                    isActive: draft.isActive,
                };
                const savedVariant = draft.id ? await api.updateVariant(draft.id, input) : await api.createVariant(productId, input);
                draft.id = savedVariant.id;
                draft.attributes = savedVariant.attributes || {};
                savedVariants.set(draft.key, savedVariant);
                // A retry updates this option instead of creating it again with the same SKU.
                updateVariantDraft(draft.key, { id: savedVariant.id, attributes: draft.attributes });
            }

            const savedVariantIds = new Set(drafts.map((draft) => draft.id!));
            for (const image of product.images) {
                // Images uploaded by an earlier attempt of this save have no assignment yet.
                if (!(image.id in imageAssignments)) continue;
                const variantIds = imageAssignments[image.id].filter((id) => savedVariantIds.has(id));
                if (!sameIds(variantIds, productImageVariantIds(image))) {
                    await api.updateProductImage(productId, image.id, { variantIds });
                }
            }

            const uploads: Array<() => Promise<void>> = [];
            const uploadImage = (file: File, scope: string, altText: string, sortOrder: number, variantIds?: string[]) => {
                const doneKey = uploadKey(productId, scope, file);
                if (uploadedFilesRef.current.has(doneKey)) return;
                uploads.push(async () => {
                    const imageForm = new FormData();
                    imageForm.set('file', file);
                    if (variantIds) imageForm.set('variantIds', JSON.stringify(variantIds));
                    imageForm.set('altText', altText);
                    imageForm.set('sortOrder', String(sortOrder));
                    await api.uploadProductImage(productId, imageForm);
                    uploadedFilesRef.current.add(doneKey);
                });
            };
            const importDriveLink = (
                driveUrl: string,
                scope: string,
                metadata: { variantIds: string[]; altText: string; sortOrder: number },
                onImported: () => void,
            ) => {
                const doneKey = `${productId}|${scope}|${driveUrl}`;
                if (importedDriveLinksRef.current.has(doneKey)) return;
                uploads.push(async () => {
                    await importDriveImage(productId, driveUrl, metadata);
                    importedDriveLinksRef.current.add(doneKey);
                    onImported();
                });
            };

            for (const draft of drafts) {
                const savedVariant = savedVariants.get(draft.key)!;
                const color = draft.color.trim();
                const variantIds = draft.imageScope === 'color' && color
                    ? drafts
                        .filter((candidate) => candidate.color.trim().toLocaleLowerCase() === color.toLocaleLowerCase())
                        .map((candidate) => candidate.id!)
                    : [savedVariant.id];
                const altText = imageAltText(productName, variantOptionLabel(savedVariant));
                draft.images.forEach((file, index) => uploadImage(file, draft.key, altText, index, variantIds));
                driveImageLinks(draft.driveImageUrls).forEach((driveUrl, index) => importDriveLink(
                    driveUrl,
                    draft.key,
                    { variantIds, altText, sortOrder: draft.images.length + index },
                    () => setVariantDrafts((current) => current.map((item) => item.key === draft.key
                        ? { ...item, driveImageUrls: driveImageLinks(item.driveImageUrls).filter((link) => link !== driveUrl).join('\n') }
                        : item)),
                ));
            }

            sharedImageFiles.forEach((file, index) => uploadImage(file, 'shared', imageAltText(productName), index));
            const sharedDriveField = formElement.elements.namedItem('driveImageUrls');
            driveImageLinks(String(form.get('driveImageUrls') || '')).forEach((driveUrl, index) => importDriveLink(
                driveUrl,
                'shared',
                { variantIds: [], altText: imageAltText(productName), sortOrder: sharedImageFiles.length + index },
                () => {
                    if (sharedDriveField instanceof HTMLTextAreaElement) {
                        sharedDriveField.value = driveImageLinks(sharedDriveField.value).filter((link) => link !== driveUrl).join('\n');
                    }
                },
            ));

            await runLimited(uploads);
            const sharedImagesField = formElement.elements.namedItem('images');
            if (sharedImagesField instanceof HTMLInputElement) sharedImagesField.value = '';

            if (videoFile && !uploadedFilesRef.current.has(uploadKey(productId, 'video', videoFile))) {
                const videoForm = new FormData();
                videoForm.set('file', videoFile);
                videoForm.set('altText', imageAltText(productName));
                await api.uploadProductVideo(productId, videoForm);
                uploadedFilesRef.current.add(uploadKey(productId, 'video', videoFile));
                const videoField = formElement.elements.namedItem('videoFile');
                if (videoField instanceof HTMLInputElement) videoField.value = '';
            }

            if (publishAtEnd) await api.updateProduct(productId, { status: 'PUBLISHED' });

            setSuccessMessage(isNewProduct ? 'New product created successfully.' : 'Product updated successfully.');
            setOpenProductModal(false);
            setEditingProduct(null);
            // A new product may belong on this page (or move others along), so fetch it again.
            if (isNewProduct) reloadProducts();
            else await refreshProduct(productId);
        } catch (caught) {
            const message = caught instanceof Error ? caught.message : 'Product save failed.';
            setError(productSaved
                ? `${message} Saved steps were kept; fix the problem and save again to finish.`
                : message);
            if (product) {
                if (isNewProduct) reloadProducts();
                // Show what was saved (new images, option ids) so the retry continues from there.
                const fresh = await refreshProduct(product.id);
                if (fresh) {
                    setEditingProduct(fresh);
                    setImageAssignments((current) => ({
                        ...Object.fromEntries(fresh.images.map((image) => [image.id, productImageVariantIds(image)])),
                        ...current,
                    }));
                }
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteProduct = async (productId: string, name: string) => {
        if (!window.confirm(`Are you sure you want to delete product "${name}"?`)) return;
        try {
            await api.deleteProduct(productId);
            setProducts((current) => current.filter((product) => product.id !== productId));
            setProductTotal((current) => Math.max(0, current - 1));
            setSuccessMessage(`Product "${name}" deleted.`);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Product deletion failed.');
        } finally {
            // Refill the page from the next one; after a failure the product may or may not be gone.
            reloadProducts();
        }
    };

    const handleDeleteCategory = async (categoryId: string, name: string) => {
        if (!window.confirm(`Delete category “${name}”? It must not contain products.`)) return;
        try {
            await api.deleteCategory(categoryId);
            setCategories((current) => current.filter((category) => category.id !== categoryId));
            setSuccessMessage(`Category “${name}” deleted.`);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Category deletion failed.');
        }
    };

    const handleDeleteVideo = async (productId: string, videoId: string) => {
        if (!window.confirm('Remove this product video?')) return;
        setSaving(true);
        setError('');
        try {
            await api.deleteProductVideo(productId, videoId);
            setEditingProduct((current) => current ? { ...current, videos: current.videos.filter((video) => video.id !== videoId) } : null);
            setSuccessMessage('Product video removed. You can now upload an MP4 replacement.');
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Could not remove the product video.');
        } finally {
            setSaving(false);
        }
    };

    // Deleting an option or image takes effect at once (not on Save), so the editor, its
    // image assignments and the list row are all updated to match.
    const handleRemoveVariant = async (draft: VariantDraft) => {
        const variantId = draft.id;
        if (!variantId) {
            setVariantDrafts((current) => current.filter((item) => item.key !== draft.key));
            return;
        }
        const label = draft.color || draft.size || draft.sku;
        if (!window.confirm(`Delete option “${label}” now? It is removed from the catalogue immediately, even if you close without saving.`)) return;
        setBusyItem(`variant:${draft.key}`);
        setError('');
        try {
            await api.deleteVariant(variantId);
            setVariantDrafts((current) => current.filter((item) => item.key !== draft.key));
            setImageAssignments((current) => Object.fromEntries(
                Object.entries(current).map(([imageId, variantIds]) => [imageId, variantIds.filter((id) => id !== variantId)]),
            ));
            setEditingProduct((current) => current
                ? {
                    ...current,
                    variants: current.variants.filter((variant) => variant.id !== variantId),
                    images: current.images.map((image) => ({
                        ...image,
                        variantLinks: image.variantLinks?.filter((link) => link.variantId !== variantId),
                    })),
                }
                : current);
            setSuccessMessage(`Option “${label}” deleted.`);
            if (editingProduct) void refreshProduct(editingProduct.id);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Variant deletion failed.');
        } finally {
            setBusyItem(null);
        }
    };

    const handleDeleteExistingImage = async (productId: string, imageId: string) => {
        if (!window.confirm('Delete this product image now? It is removed from the storefront immediately.')) return;
        setBusyItem(`image:${imageId}`);
        setError('');
        try {
            await api.deleteProductImage(productId, imageId);
            setEditingProduct((current) => current
                ? { ...current, images: current.images.filter((image) => image.id !== imageId) }
                : current);
            setImageAssignments((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== imageId)));
            void refreshProduct(productId);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Image deletion failed.');
        } finally {
            setBusyItem(null);
        }
    };

    // Moving an image saves the new order at once (not on Save): the gallery changes straight
    // away and goes back if the server refuses the order.
    const handleMoveImage = async (productId: string, imageId: string, offset: -1 | 1) => {
        if (saving || busyItem !== null || editingProduct?.id !== productId) return;
        const previous = editingProduct.images;
        const from = previous.findIndex((image) => image.id === imageId);
        const to = from + offset;
        if (from < 0 || to < 0 || to >= previous.length) return;
        const reordered = [...previous];
        [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
        const optimistic = reordered.map((image, index) => ({ ...image, sortOrder: index }));
        setBusyItem(`image-order:${imageId}`);
        setError('');
        setImageOrderNotice('Saving image order…');
        setEditingProduct((current) => (current?.id === productId ? { ...current, images: optimistic } : current));
        try {
            const saved = await api.reorderProductImages(productId, optimistic.map((image) => image.id));
            setEditingProduct((current) => {
                if (current?.id !== productId) return current;
                const currentById = new Map(current.images.map((image) => [image.id, image]));
                return {
                    ...current,
                    images: saved.map((image) => ({ ...(currentById.get(image.id) ?? image), sortOrder: image.sortOrder })),
                };
            });
            setImageOrderNotice(`Image moved to position ${to + 1} of ${previous.length}.`);
            // Keeps the list row's thumbnail in step with the new first image.
            void refreshProduct(productId);
        } catch (caught) {
            setEditingProduct((current) => (current?.id === productId ? { ...current, images: previous } : current));
            setImageOrderNotice('');
            setError(caught instanceof Error ? `Image order not saved: ${caught.message}` : 'Image order not saved.');
        } finally {
            setBusyItem(null);
        }
    };

    const handleBulkImport = async (file: File) => {
        setBulkImporting(true);
        setBulkImportErrors([]);
        setError('');
        setSuccessMessage('');
        try {
            const rows = parseCatalogueCsv(await readSpreadsheetText(file));
            const validationErrors = validateCatalogueCsvRows(rows);
            if (validationErrors.length > 0) {
                setBulkImportErrors(validationErrors);
                setError(`Import stopped: ${validationErrors.length} validation error(s). No products were changed.`);
                return;
            }

            const groups = new Map<string, typeof rows>();
            for (const row of rows) groups.set(row.product_slug, [...(groups.get(row.product_slug) || []), row]);
            const categoryByName = new Map(categories.map((category) => [categoryNameKey(category.name), category]));
            const importedCategoryNames = new Map<string, string>();
            for (const row of rows) {
                const normalizedName = row.category_name.trim().replace(/\s+/g, ' ');
                importedCategoryNames.set(categoryNameKey(normalizedName), normalizedName);
            }
            const missingCategoryNames = [...importedCategoryNames]
                .filter(([key]) => !categoryByName.has(key))
                .map(([, name]) => name);
            const categoryNotice = missingCategoryNames.length
                ? ` ${missingCategoryNames.length} new categor${missingCategoryNames.length === 1 ? 'y' : 'ies'} will be created.`
                : '';
            if (!window.confirm(`Import ${rows.length} variant row(s) across ${groups.size} product(s)? Matching products and SKUs will be updated.${categoryNotice}`)) return;

            setBulkImportProgress({
                fileName: file.name,
                phase: 'loading',
                detail: 'Loading every product to match slugs and SKUs…',
                completedProducts: 0,
                totalProducts: groups.size,
            });
            // The list shows one page, so read the whole catalogue now to match rows against it.
            let existingProducts: Product[];
            try {
                existingProducts = await api.adminAllProducts();
            } catch (caught) {
                const message = caught instanceof Error ? caught.message : 'Request failed.';
                setError(`Import stopped before any changes: the current catalogue could not be loaded. ${message}`);
                return;
            }
            setBulkImportProgress((current) => current ? {
                ...current,
                phase: missingCategoryNames.length ? 'categories' : 'products',
                detail: missingCategoryNames.length
                    ? `Preparing ${missingCategoryNames.length} new categor${missingCategoryNames.length === 1 ? 'y' : 'ies'}…`
                    : 'Preparing the first product…',
            } : current);

            const productBySlug = new Map(existingProducts.map((product) => [product.slug, product]));
            const productBySku = new Map(existingProducts.flatMap((product) => product.variants.map((variant) => [variant.sku.toUpperCase(), product] as const)));
            // Existing product id → the file's name for it, so two groups cannot update one product.
            const claimedProducts = new Map<string, string>();
            const importErrors: string[] = [];
            let categoriesCreated = 0;
            let productsCreated = 0;
            let productsUpdated = 0;
            let variantsCreated = 0;
            let variantsUpdated = 0;
            const undoActions: Array<() => Promise<unknown>> = [];

            for (const categoryName of missingCategoryNames) {
                setBulkImportProgress((current) => current ? {
                    ...current,
                    phase: 'categories',
                    detail: `Creating category “${categoryName}”…`,
                } : current);
                try {
                    const category = await api.createCategory({ name: categoryName, isPublished: true });
                    categoryByName.set(categoryNameKey(category.name), category);
                    undoActions.push(() => api.deleteCategory(category.id));
                    categoriesCreated += 1;
                } catch (caught) {
                    const message = caught instanceof Error ? caught.message : 'Category creation failed.';
                    importErrors.push(`Category “${categoryName}”: ${message}`);
                }
            }

            let completedProducts = 0;
            const completeProductProgress = () => {
                completedProducts += 1;
                setBulkImportProgress((current) => current ? {
                    ...current,
                    phase: 'products',
                    completedProducts,
                    detail: completedProducts < groups.size
                        ? 'Preparing the next product…'
                        : 'Finishing product imports…',
                } : current);
            };

            for (const [slug, productRows] of groups) {
                const base = productRows[0];
                setBulkImportProgress((current) => current ? {
                    ...current,
                    phase: 'products',
                    detail: `Saving product “${base.product_name}”…`,
                } : current);
                const category = categoryByName.get(categoryNameKey(base.category_name));
                if (!category) {
                    completeProductProgress();
                    continue;
                }
                // Match the file's slug first (exports carry it, so renamed products still match),
                // then any existing SKU in the group, then a slug made from the product name.
                const existingProduct =
                    (base.explicit_slug ? productBySlug.get(slug) : undefined)
                    ?? productRows.map((row) => productBySku.get(row.sku.toUpperCase())).find((match) => match !== undefined)
                    ?? productBySlug.get(slugify(base.product_name));
                if (existingProduct) {
                    const claimedBy = claimedProducts.get(existingProduct.id);
                    if (claimedBy !== undefined) {
                        importErrors.push(`Product “${base.product_name}” (row ${base.sourceRow}) matches the same existing product as “${claimedBy}”. Give all of its rows the same product_slug.`);
                        completeProductProgress();
                        continue;
                    }
                    claimedProducts.set(existingProduct.id, base.product_name);
                }
                const targetStatus = base.status.toUpperCase();
                // A new product is only published once its options are in place.
                const publishAfterOptions = !existingProduct && targetStatus === 'PUBLISHED';
                const errorsBeforeProduct = importErrors.length;
                let savedProduct: Product;
                try {
                    const productInput = {
                        categoryId: category.id,
                        name: base.product_name,
                        // Updating keeps the existing slug so storefront URLs do not change.
                        slug: existingProduct?.slug ?? slug,
                        shortDescription: productSummary(base.description),
                        description: base.description,
                        material: base.material,
                        status: publishAfterOptions ? 'DRAFT' : targetStatus,
                    };
                    if (existingProduct) {
                        savedProduct = await api.updateProduct(existingProduct.id, productInput);
                        undoActions.push(() => api.updateProduct(existingProduct.id, {
                            categoryId: existingProduct.categoryId,
                            name: existingProduct.name,
                            slug: existingProduct.slug,
                            shortDescription: existingProduct.shortDescription ?? null,
                            description: existingProduct.description ?? null,
                            material: existingProduct.material ?? null,
                            status: existingProduct.status,
                        }));
                        productsUpdated += 1;
                    } else {
                        savedProduct = await api.createProduct(productInput);
                        undoActions.push(() => api.deleteProduct(savedProduct.id));
                        productsCreated += 1;
                    }
                    productBySlug.set(savedProduct.slug, savedProduct);
                } catch (caught) {
                    const message = caught instanceof Error ? caught.message : 'Product save failed.';
                    importErrors.push(`Product “${base.product_name}”: ${message}`);
                    completeProductProgress();
                    continue;
                }

                const existingVariants = new Map(
                    (existingProduct?.variants || []).map((variant) => [variant.sku.toUpperCase(), variant]),
                );
                const importedImagesByLink = new Map<string, { imageId: string; variantIds: Set<string>; shared: boolean }>();
                // Imports a Drive link once per product. An image the product already had from that
                // Drive file is reused, and rollback restores its links rather than deleting it.
                const importLinkedImage = async (driveUrl: string, variantIds: string[], altText: string, sortOrder: number) => {
                    const { image, previousVariantIds } = await importDriveImage(savedProduct.id, driveUrl, { variantIds, altText, sortOrder });
                    const linkedIds = productImageVariantIds(image);
                    importedImagesByLink.set(driveUrl, { imageId: image.id, variantIds: new Set(linkedIds), shared: linkedIds.length === 0 });
                    undoActions.push(previousVariantIds
                        ? () => api.updateProductImage(savedProduct.id, image.id, { variantIds: previousVariantIds })
                        : () => api.deleteProductImage(savedProduct.id, image.id));
                };
                for (const row of productRows) {
                    setBulkImportProgress((current) => current ? {
                        ...current,
                        detail: `Saving option ${row.sku} for “${base.product_name}”…`,
                    } : current);
                    try {
                        const sku = row.sku.toUpperCase();
                        const existingVariant = existingVariants.get(sku);
                        const variantInput = {
                            sku,
                            alias: row.alias || null,
                            pricePaise: importRupeesToPaise(row.price_rupees)!,
                            compareAtPricePaise: row.compare_at_price_rupees
                                ? importRupeesToPaise(row.compare_at_price_rupees)!
                                : null,
                            attributes: existingVariant?.attributes || {},
                            // A blank colour clears it, like a blank size or pack quantity.
                            color: row.color || null,
                            ...(row.color && row.color_hex ? { colorHex: row.color_hex.toUpperCase() } : {}),
                            size: row.size || null,
                            packQuantity: row.pack_quantity ? Number(row.pack_quantity) : null,
                            // A blank is_active keeps an existing option's availability.
                            isActive: row.is_active ? importBoolean(row.is_active)! : (existingVariant?.isActive ?? true),
                        };
                        const savedVariant = existingVariant
                            ? await api.updateVariant(existingVariant.id, variantInput)
                            : await api.createVariant(savedProduct.id, variantInput);
                        if (existingVariant) {
                            const original = existingVariant.attributes || {};
                            const originalText = (key: string) => (typeof original[key] === 'string' && original[key] ? original[key] as string : null);
                            undoActions.push(() => api.updateVariant(existingVariant.id, {
                                sku: existingVariant.sku,
                                alias: existingVariant.alias || null,
                                pricePaise: existingVariant.pricePaise,
                                compareAtPricePaise: existingVariant.compareAtPricePaise ?? null,
                                attributes: original,
                                // Attributes are merged on the server, so null removes the keys this
                                // import added (e.g. a size) that the original option did not have.
                                color: originalText('color'),
                                colorHex: originalText('colorHex'),
                                size: originalText('size'),
                                packQuantity: typeof original.packQuantity === 'number' ? original.packQuantity : null,
                                isActive: existingVariant.isActive,
                            }));
                            variantsUpdated += 1;
                        } else {
                            undoActions.push(() => api.deleteVariant(savedVariant.id));
                            variantsCreated += 1;
                        }

                        const optionLinks = driveLinksFromCsvCell(row.option_google_drive_image_links);
                        await runLimited(optionLinks.map((driveUrl, index) => async () => {
                            setBulkImportProgress((current) => current ? {
                                ...current,
                                detail: `Downloading image ${index + 1} for option ${row.sku}…`,
                            } : current);
                            const previousImage = importedImagesByLink.get(driveUrl);
                            if (previousImage) {
                                if (!previousImage.shared) {
                                    previousImage.variantIds.add(savedVariant.id);
                                    await api.updateProductImage(savedProduct.id, previousImage.imageId, {
                                        variantIds: [...previousImage.variantIds],
                                    });
                                }
                            } else {
                                await importLinkedImage(driveUrl, [savedVariant.id], imageAltText(base.product_name, variantOptionLabel(savedVariant)), index);
                            }
                        }));
                    } catch (caught) {
                        const message = caught instanceof Error ? caught.message : 'Variant save failed.';
                        importErrors.push(`Row ${row.sourceRow} (${row.sku}): ${message}`);
                    }
                }

                const sharedLinks = [...new Set(productRows.flatMap((row) => driveLinksFromCsvCell(row.shared_google_drive_image_links)))];
                await runLimited(sharedLinks.map((driveUrl, index) => async () => {
                    setBulkImportProgress((current) => current ? {
                        ...current,
                        detail: `Downloading shared image ${index + 1} for “${base.product_name}”…`,
                    } : current);
                    try {
                        const previousImage = importedImagesByLink.get(driveUrl);
                        if (previousImage) {
                            previousImage.shared = true;
                            previousImage.variantIds.clear();
                            await api.updateProductImage(savedProduct.id, previousImage.imageId, { variantIds: [] });
                        } else {
                            await importLinkedImage(driveUrl, [], imageAltText(base.product_name), index);
                        }
                    } catch (caught) {
                        const message = caught instanceof Error ? caught.message : 'Shared image import failed.';
                        importErrors.push(`Product “${base.product_name}” shared image: ${message}`);
                    }
                }));

                if (publishAfterOptions && importErrors.length === errorsBeforeProduct) {
                    try {
                        await api.updateProduct(savedProduct.id, { status: 'PUBLISHED' });
                    } catch (caught) {
                        const message = caught instanceof Error ? caught.message : 'Publishing failed.';
                        importErrors.push(`Product “${base.product_name}”: ${message}`);
                    }
                }
                completeProductProgress();
            }

            if (importErrors.length > 0) {
                setBulkImportProgress((current) => current ? {
                    ...current,
                    phase: 'rollback',
                    detail: 'An issue was found. Reverting changes from this file…',
                } : current);
                const rollbackErrors: string[] = [];
                for (const undo of undoActions.reverse()) {
                    try { await undo(); }
                    catch (caught) { rollbackErrors.push(caught instanceof Error ? caught.message : 'Rollback action failed.'); }
                }
                setBulkImportErrors([...importErrors, ...rollbackErrors.map((message) => `Rollback: ${message}`)]);
                setError(rollbackErrors.length
                    ? `Import failed and rollback needs attention (${rollbackErrors.length} rollback error(s)).`
                    : 'Import failed. All changes from this file were rolled back.');
                setBulkImportProgress((current) => current ? {
                    ...current,
                    phase: 'refreshing',
                    detail: 'Refreshing the catalogue after rollback…',
                } : current);
                await refreshCatalogue();
                return;
            }

            setBulkImportErrors(importErrors);
            setSuccessMessage(
                `Bulk import finished: ${categoriesCreated} categor${categoriesCreated === 1 ? 'y' : 'ies'} created, ${productsCreated} product(s) created, ${productsUpdated} updated, ${variantsCreated} variant(s) created, and ${variantsUpdated} updated.`,
            );
            setBulkImportProgress((current) => current ? {
                ...current,
                phase: 'refreshing',
                completedProducts: current.totalProducts,
                detail: 'Refreshing the catalogue with the imported products…',
            } : current);
            await refreshCatalogue();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Could not read the catalogue CSV.');
        } finally {
            setBulkImportProgress(null);
            setBulkImporting(false);
        }
    };

    // Category Submit
    const handleCategorySubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        const form = new FormData(event.currentTarget);
        try {
            if (editingCategory) {
                const category = await api.updateCategory(editingCategory.id, {
                    name: String(form.get('name')),
                    description: String(form.get('description')),
                    isPublished: form.get('isPublished') === 'on',
                });
                setCategories((current) => current.map((item) => (item.id === category.id ? category : item)));
                setProducts((current) => current.map((product) => (product.categoryId === category.id ? { ...product, category } : product)));
                setSuccessMessage('Category updated.');
            } else {
                const category = await api.createCategory({
                    name: String(form.get('name')),
                    description: String(form.get('description')),
                    isPublished: form.get('isPublished') === 'on',
                });
                setCategories((current) => [...current, category].sort((left, right) =>
                    left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)));
                setSuccessMessage('New category created.');
            }
            setOpenCategoryModal(false);
            setEditingCategory(null);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Category save failed.');
        } finally {
            setSaving(false);
        }
    };

    // The export holds every product, so it is read when asked for rather than with the page.
    const handleExportCatalogue = async () => {
        setExportingCatalogue(true);
        setError('');
        try {
            downloadCsv('glockery-catalogue-export.csv', catalogueCsvExport(await api.adminAllProducts()));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Could not export the catalogue.');
        } finally {
            setExportingCatalogue(false);
        }
    };

    const productPageCount = Math.max(1, Math.ceil(productTotal / productPageSize));
    const productPageStart = (productPage - 1) * productPageSize;

    return (
        <AdminShell
            title="Catalogue"
            description="Manage products, variants, media, publishing status and categories."
            action={
                <div className="flex flex-wrap justify-end gap-3">
                    <button
                        onClick={() => downloadCsv('glockery-catalogue-template.csv', catalogueCsvTemplate())}
                        className="flex h-11 items-center gap-2 border border-gold-500/30 bg-carbon px-3 text-xs font-bold uppercase tracking-wider text-cream hover:border-gold-400"
                    >
                        <IconDownload size={15} /> Import Template
                    </button>
                    <button
                        onClick={() => void handleExportCatalogue()}
                        disabled={exportingCatalogue}
                        aria-busy={exportingCatalogue}
                        className="flex h-11 items-center gap-2 border border-gold-500/30 bg-carbon px-3 text-xs font-bold uppercase tracking-wider text-cream hover:border-gold-400 disabled:opacity-40"
                    >
                        <IconDownload size={15} /> {exportingCatalogue ? 'Exporting…' : 'Export Catalogue'}
                    </button>
                    <label
                        className={`flex h-11 items-center gap-2 border border-gold-500/30 bg-carbon px-3 text-xs font-bold uppercase tracking-wider text-cream ${
                            bulkImporting || !catalogueLoaded ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:border-gold-400'
                        }`}
                        title={catalogueLoaded ? undefined : 'Available once the categories have loaded'}
                    >
                        <IconPlus size={15} /> {bulkImporting ? 'Importing…' : 'Import File'}
                        {/* Import matches category names against the loaded categories, so it waits for them. */}
                        <input
                            type="file"
                            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            disabled={bulkImporting || !catalogueLoaded}
                            className="sr-only"
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = '';
                                if (file) void handleBulkImport(file);
                            }}
                        />
                    </label>
                    <button
                        onClick={() => {
                            setEditingCategory(null);
                            setOpenCategoryModal(true);
                        }}
                        className="flex h-11 items-center gap-2 border border-gold-500/30 bg-carbon px-4 text-xs font-bold uppercase tracking-wider text-cream hover:border-gold-400"
                    >
                        <IconPlus size={16} /> New Category
                    </button>
                    <button
                        onClick={() => {
                            openProductEditor(null);
                        }}
                        className="flex h-11 items-center gap-2 bg-gold-400 px-5 text-xs font-bold uppercase tracking-wider text-obsidian shadow-lg hover:bg-gold-300"
                    >
                        <IconPlus size={16} /> Add Product
                    </button>
                </div>
            }
        >
            {bulkImportProgress && <CatalogueImportProgressModal progress={bulkImportProgress} />}
            <NotificationToast message={error} type="error" onClose={() => setError('')} />
            <NotificationToast message={successMessage} type="success" onClose={() => setSuccessMessage('')} />
            {bulkImportErrors.length > 0 && (
                <div className="mb-6 border border-amber-500/35 bg-amber-950/20 p-4 text-xs text-amber-100" role="alert">
                    <div className="flex items-center justify-between gap-4">
                        <strong>Bulk import report · {bulkImportErrors.length} issue(s)</strong>
                        <button onClick={() => setBulkImportErrors([])} className="text-amber-200/70 hover:text-amber-100">
                            Close
                        </button>
                    </div>
                    <ul className="mt-3 max-h-44 list-disc space-y-1 overflow-y-auto pl-5">
                        {bulkImportErrors.map((message, index) => (
                            <li key={`${message}-${index}`}>{message}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* View Mode Tabs */}
            <div className="mb-6 border-b border-gold-500/20 flex gap-6">
                <button
                    onClick={() => setActiveTab('products')}
                    className={`pb-3 text-sm font-semibold tracking-wider transition-colors ${
                        activeTab === 'products' ? 'border-b-2 border-gold-400 text-gold-300' : 'text-cream/50 hover:text-cream'
                    }`}
                >
                    Products{productsLoaded ? ` (${productTotal})` : ''}
                </button>
                <button
                    onClick={() => setActiveTab('categories')}
                    className={`pb-3 text-sm font-semibold tracking-wider transition-colors ${
                        activeTab === 'categories' ? 'border-b-2 border-gold-400 text-gold-300' : 'text-cream/50 hover:text-cream'
                    }`}
                >
                    Categories ({categories.length})
                </button>
            </div>

            {activeTab === 'products' ? (
                <div>
                    {/* Search & Filters */}
                    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:gap-4">
                        <div className="flex min-w-0 flex-1 rounded-sm border border-gold-500/25 bg-carbon sm:col-span-2 lg:min-w-[240px]">
                            <IconSearch className="m-3 text-gold-400" />
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                aria-label="Search products"
                                placeholder="Search by name, slug, SKU or alias…"
                                className="min-w-0 flex-1 bg-transparent text-sm text-cream outline-none"
                            />
                        </div>
                        <select
                            value={categoryFilter}
                            onChange={(e) => {
                                setCategoryFilter(e.target.value);
                                setProductPage(1);
                            }}
                            aria-label="Filter by category"
                            className="h-11 w-full rounded-sm border border-gold-500/25 bg-obsidian px-4 text-xs text-cream outline-none lg:w-auto"
                        >
                            <option value="">All Categories</option>
                            {categories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                    {cat.name}
                                </option>
                            ))}
                        </select>
                        <select
                            value={statusFilter}
                            onChange={(e) => {
                                setStatusFilter(e.target.value as Product['status'] | '');
                                setProductPage(1);
                            }}
                            aria-label="Filter by status"
                            className="h-11 w-full rounded-sm border border-gold-500/25 bg-obsidian px-4 text-xs text-cream outline-none lg:w-auto"
                        >
                            <option value="">All Statuses</option>
                            <option value="PUBLISHED">Published</option>
                            <option value="DRAFT">Draft</option>
                            <option value="ARCHIVED">Archived</option>
                        </select>
                    </div>

                    {/* Products Table */}
                    <div className={`${box} overflow-x-auto`} aria-busy={productsLoading}>
                        <table className={`admin-responsive-table w-full min-w-[850px] text-left text-sm transition-opacity ${productsLoading && productsLoaded ? 'opacity-60' : ''}`}>
                            <thead className="border-b border-gold-500/20 text-[9px] uppercase tracking-[0.2em] text-gold-400 bg-obsidian/60">
                                <tr>
                                    <th className="p-4">Product</th>
                                    <th className="p-4">Category</th>
                                    <th className="p-4">Variants</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4 text-right">Price</th>
                                    <th className="p-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gold-500/10">
                                {products.map((product) => (
                                    <tr key={product.id} className="transition-colors hover:bg-gold-400/[.03]">
                                        <td data-label="Product" className="p-4">
                                            <div className="flex items-center gap-3">
                                                <img
                                                    loading="lazy"
                                                    decoding="async"
                                                    src={product.images[0]?.thumbnailUrl || fallbackImage}
                                                    alt=""
                                                    className="size-12 rounded-sm border border-gold-500/20 object-contain bg-obsidian"
                                                />
                                                <div>
                                                    <strong className="font-display text-base font-normal text-cream">{product.name}</strong>
                                                    <small className="block text-[10px] text-cream/40">{product.slug}</small>
                                                </div>
                                            </div>
                                        </td>
                                        <td data-label="Category" className="p-4 text-xs text-cream/50">{product.category?.name || 'Unassigned'}</td>
                                        <td data-label="Variants" className="p-4 text-xs text-cream/70">{product.variants?.length || 0} variant(s)</td>
                                        <td data-label="Status" className="p-4">
                                            <span
                                                className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                                                    product.status === 'PUBLISHED'
                                                        ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300'
                                                        : product.status === 'ARCHIVED'
                                                            ? 'border-cream/20 bg-obsidian text-cream/45'
                                                            : 'border-gold-500/30 bg-gold-950/30 text-gold-300'
                                                }`}
                                            >
                                                {titleCase(product.status)}
                                            </span>
                                        </td>
                                        <td data-label="Price" className="p-4 text-right font-medium text-gold-300">
                                            {(() => {
                                                const lowest = lowestPricedVariant(product);
                                                return lowest ? `${variantPricesDiffer(product) ? 'From ' : ''}${rupees(lowest.pricePaise)}` : '—';
                                            })()}
                                        </td>
                                        <td data-label="Actions" className="p-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => void editProduct(product.id)}
                                                    disabled={openingProductId === product.id}
                                                    className="p-2 text-cream/60 hover:text-gold-300 border border-gold-500/20 rounded-sm bg-obsidian"
                                                    title="Edit Product"
                                                >
                                                    <IconEdit size={16} />
                                                </button>
                                                <button
                                                    onClick={() => void handleDeleteProduct(product.id, product.name)}
                                                    className="p-2 text-red-400/70 hover:text-red-300 border border-red-500/20 rounded-sm bg-obsidian"
                                                    title="Delete Product"
                                                >
                                                    <IconTrash size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {!productsLoaded && productsLoading && <p className="p-10 text-center text-sm text-cream/40" role="status">Loading products…</p>}
                        {productsLoaded && !productsLoading && !products.length && <p className="p-10 text-center text-sm text-cream/40">No matching products found in catalogue.</p>}
                    </div>

                    {productTotal > 0 && products.length > 0 && (
                        <div className="mt-4 flex flex-col gap-3 text-xs text-cream/60 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                                <span>
                                    Showing {productPageStart + 1}–{productPageStart + products.length} of {productTotal}
                                </span>
                                <label className="flex items-center gap-2">
                                    <span className="sr-only sm:not-sr-only">Per page</span>
                                    <select
                                        value={productPageSize}
                                        onChange={(e) => {
                                            setProductPageSize(Number(e.target.value) as ProductPageSize);
                                            setProductPage(1);
                                        }}
                                        className="h-9 rounded-sm border border-gold-500/25 bg-obsidian px-3 text-xs text-cream outline-none"
                                        aria-label="Products per page"
                                    >
                                        {PRODUCT_PAGE_SIZES.map((size) => (
                                            <option key={size} value={size}>
                                                {size}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                            {productPageCount > 1 && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setProductPage(productPage - 1)}
                                        disabled={productPage <= 1}
                                        className="flex size-9 items-center justify-center rounded-sm border border-gold-500/25 bg-carbon text-cream hover:border-gold-400 disabled:pointer-events-none disabled:opacity-30"
                                        aria-label="Previous page"
                                    >
                                        <IconChevronLeft size={16} />
                                    </button>
                                    <span className="px-2">
                                        Page <strong className="text-gold-300">{productPage}</strong> of {productPageCount}
                                    </span>
                                    <button
                                        onClick={() => setProductPage(productPage + 1)}
                                        disabled={productPage >= productPageCount}
                                        className="flex size-9 items-center justify-center rounded-sm border border-gold-500/25 bg-carbon text-cream hover:border-gold-400 disabled:pointer-events-none disabled:opacity-30"
                                        aria-label="Next page"
                                    >
                                        <IconChevronRight size={16} />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                /* Category Management View */
                <div className={`${box} overflow-x-auto`}>
                    <table className="admin-responsive-table w-full min-w-[560px] text-left text-sm">
                        <thead className="border-b border-gold-500/20 text-[9px] uppercase tracking-[0.2em] text-gold-400 bg-obsidian/60">
                            <tr>
                                <th className="p-4">Category Name</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gold-500/10">
                            {categories.map((cat) => (
                                <tr key={cat.id}>
                                    <td data-label="Category" className="p-4 font-display text-lg text-cream">{cat.name}</td>
                                    <td data-label="Status" className="p-4">
                                        <span
                                            className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                                                cat.isPublished ? 'border-emerald-500/30 text-emerald-300' : 'border-gold-500/30 text-gold-300'
                                            }`}
                                        >
                                            {cat.isPublished ? 'Published' : 'Draft'}
                                        </span>
                                    </td>
                                    <td data-label="Actions" className="p-4 text-center">
                                        <div className="flex justify-center gap-2"><button
                                            onClick={() => {
                                                setEditingCategory(cat);
                                                setOpenCategoryModal(true);
                                            }}
                                            className="p-2 text-cream/60 hover:text-gold-300 border border-gold-500/20 rounded-sm bg-obsidian"
                                        >
                                            <IconEdit size={16} />
                                        </button><button onClick={() => void handleDeleteCategory(cat.id, cat.name)} className="p-2 text-red-400/70 hover:text-red-300 border border-red-500/20 rounded-sm bg-obsidian" title="Delete category"><IconTrash size={16} /></button></div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Product Modal (Create/Edit) */}
            {openProductModal && (
                <AdminModalLayer>
                <div className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden bg-black/85 p-2 backdrop-blur-sm sm:items-center sm:p-5">
                    <form
                        ref={productDialogRef}
                        tabIndex={-1}
                        onSubmit={handleProductSubmit}
                        className="flex max-h-[calc(100svh-1rem)] w-full max-w-5xl flex-col overflow-hidden border border-gold-500/30 bg-carbon shadow-2xl outline-none sm:max-h-[calc(100svh-2.5rem)]"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="product-dialog-title"
                    >
                        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gold-500/20 px-4 py-3 sm:px-7 sm:py-4">
                            <div>
                                <h2 id="product-dialog-title" className="font-display text-2xl text-cream sm:text-3xl">
                                    {editingProduct ? 'Edit Product' : 'Add New Product'}
                                </h2>
                            </div>
                            <button
                                type="button"
                                aria-label="Close product dialog"
                                onClick={closeProductModal}
                                disabled={saving}
                                className="flex min-h-11 shrink-0 items-center gap-2 rounded-sm px-3 text-xs font-semibold text-cream/60 hover:bg-obsidian hover:text-cream disabled:opacity-40"
                            >
                                <IconClose size={17} aria-hidden="true" /> Close
                            </button>
                        </div>

                        <div data-dialog-scroll-body="product" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 sm:px-7">
                        <div className="mt-5 grid gap-4 sm:grid-cols-2">
                            <label className="sm:col-span-2">
                                <span className="mb-1.5 block text-xs text-cream/60 font-medium">Product Name</span>
                                <input name="name" defaultValue={editingProduct?.name || ''} className={inputStyle} required />
                            </label>
                            <label>
                                <span className="mb-1.5 block text-xs text-cream/60 font-medium">Category</span>
                                <select name="categoryId" defaultValue={editingProduct?.categoryId || ''} className={inputStyle} required>
                                    <option value="">Select Category…</option>
                                    {categories.map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                <span className="mb-1.5 block text-xs text-cream/60 font-medium">Publish State</span>
                                <select name="status" defaultValue={editingProduct?.status || 'PUBLISHED'} className={inputStyle}>
                                    <option value="DRAFT">Draft</option>
                                    <option value="PUBLISHED">Published</option>
                                    <option value="ARCHIVED">Archived</option>
                                </select>
                            </label>

                            <label className="sm:col-span-2">
                                <span className="mb-1.5 block text-xs text-cream/60 font-medium">Material</span>
                                <input
                                    name="material"
                                    defaultValue={editingProduct?.material || ''}
                                    placeholder="e.g. Stainless steel"
                                    className={inputStyle}
                                />
                            </label>
                            <label className="sm:col-span-2">
                                <span className="mb-1.5 block text-xs text-cream/60 font-medium">Product Description (shown on storefront)</span>
                                <textarea
                                    name="description"
                                    defaultValue={editingProduct?.description || ''}
                                    rows={4}
                                    className="w-full border border-gold-500/25 bg-obsidian p-4 text-sm text-cream outline-none focus:border-gold-400 rounded-sm"
                                />
                            </label>

                            <section className="sm:col-span-2 border-y border-line py-5" aria-labelledby="product-options-heading">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h3 id="product-options-heading" className="font-display text-xl text-cream">
                                            Colour, size and pack combinations
                                        </h3>
                                        <p className="mt-1 text-xs leading-5 text-cream/55">
                                            Add one exact sellable combination per row. Each combination keeps its own SKU, price and stock.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setVariantDrafts((current) => [...current, createVariantDraft()])}
                                        className="flex min-h-11 items-center gap-2 border border-gold-400/45 px-3 text-xs font-semibold text-gold-200 hover:border-gold-300 hover:text-gold-100"
                                    >
                                        <IconPlus size={14} /> Add combination
                                    </button>
                                </div>

                                <div className="mt-5 space-y-4">
                                    {variantDrafts.map((draft, index) => (
                                        <div key={draft.key} className="bg-obsidian/55 p-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <strong className="text-sm text-cream">
                                                    Option {index + 1}
                                                    {draft.color ? ` · ${draft.color}` : ''}
                                                </strong>
                                                {variantDrafts.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleRemoveVariant(draft)}
                                                        disabled={saving || busyItem !== null}
                                                        className="min-h-11 px-2 text-xs text-red-200 hover:text-red-100 disabled:opacity-40"
                                                    >
                                                        {busyItem === `variant:${draft.key}` ? 'Removing…' : 'Remove'}
                                                    </button>
                                                )}
                                            </div>
                                            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                                <label>
                                                    <span className="mb-1.5 block text-xs text-cream/60">Colour name</span>
                                                    <input
                                                        value={draft.color}
                                                        onChange={(event) =>
                                                            updateVariantDraft(draft.key, {
                                                                color: event.target.value,
                                                            })
                                                        }
                                                        placeholder="e.g. Sage Green"
                                                        maxLength={80}
                                                        className={inputStyle}
                                                    />
                                                </label>
                                                <label>
                                                    <span className="mb-1.5 block text-xs text-cream/60">SKU (unique, required)</span>
                                                    <input
                                                        value={draft.sku}
                                                        onChange={(event) =>
                                                            updateVariantDraft(draft.key, {
                                                                sku: event.target.value.toUpperCase(),
                                                            })
                                                        }
                                                        placeholder="GHC-SET-SAGE"
                                                        pattern={'[A-Z0-9][A-Z0-9._\\-]*'}
                                                        maxLength={80}
                                                        className={inputStyle}
                                                        required
                                                    />
                                                </label>
                                                <label>
                                                    <span className="mb-1.5 block text-xs text-cream/60">Size (optional)</span>
                                                    <input
                                                        value={draft.size}
                                                        onChange={(event) => updateVariantDraft(draft.key, { size: event.target.value })}
                                                        placeholder="e.g. Large"
                                                        maxLength={80}
                                                        className={inputStyle}
                                                    />
                                                </label>
                                                <label>
                                                    <span className="mb-1.5 block text-xs text-cream/60">Pack quantity (optional)</span>
                                                    <input
                                                        type="number"
                                                        value={draft.packQuantity}
                                                        onChange={(event) => updateVariantDraft(draft.key, { packQuantity: event.target.value })}
                                                        min="1"
                                                        step="1"
                                                        placeholder="e.g. 2"
                                                        className={inputStyle}
                                                    />
                                                </label>
                                                <label>
                                                    <span className="mb-1.5 block text-xs text-cream/60">Alias name (optional)</span>
                                                    <input
                                                        type="text"
                                                        value={draft.alias}
                                                        onChange={(event) =>
                                                            updateVariantDraft(draft.key, {
                                                                alias: event.target.value,
                                                            })
                                                        }
                                                        placeholder="e.g. Sage green tea set"
                                                        maxLength={80}
                                                        className={inputStyle}
                                                    />
                                                    <span className="mt-1 block text-[10px] text-cream/40">Optional text; it does not need to be unique.</span>
                                                </label>
                                                <label>
                                                    <span className="mb-1.5 block text-xs text-cream/60">Swatch</span>
                                                    <span className="flex h-12 items-center gap-3 border border-gold-500/25 bg-obsidian px-3">
                                                        <input
                                                            type="color"
                                                            value={draft.colorHex}
                                                            onChange={(event) =>
                                                                updateVariantDraft(draft.key, {
                                                                    colorHex: event.target.value.toUpperCase(),
                                                                })
                                                            }
                                                            className="size-8 cursor-pointer border-0 bg-transparent"
                                                            aria-label={`Swatch colour for option ${index + 1}`}
                                                        />
                                                        <span className="text-xs tabular-nums text-cream/55">{draft.colorHex}</span>
                                                    </span>
                                                </label>
                                                <label>
                                                    <span className="mb-1.5 block text-xs text-cream/60">Price (₹)</span>
                                                    <input
                                                        type="number"
                                                        value={draft.priceRupees}
                                                        onChange={(event) =>
                                                            updateVariantDraft(draft.key, {
                                                                priceRupees: event.target.value,
                                                            })
                                                        }
                                                        min="0"
                                                        step="0.01"
                                                        placeholder="999.00"
                                                        className={inputStyle}
                                                        required
                                                    />
                                                </label>
                                                <label>
                                                    <span className="mb-1.5 block text-xs text-cream/60">Compare-at price (₹)</span>
                                                    <input
                                                        type="number"
                                                        value={draft.compareAtPriceRupees}
                                                        onChange={(event) =>
                                                            updateVariantDraft(draft.key, {
                                                                compareAtPriceRupees: event.target.value,
                                                            })
                                                        }
                                                        min="0"
                                                        step="0.01"
                                                        placeholder="Optional"
                                                        className={inputStyle}
                                                    />
                                                </label>
                                                <label className="sm:col-span-2">
                                                    <span className="mb-1.5 block text-xs text-cream/60">Images for this combination</span>
                                                    <input
                                                        type="file"
                                                        accept="image/jpeg,image/png,image/webp,image/gif"
                                                        multiple
                                                        onChange={(event) =>
                                                            updateVariantDraft(draft.key, {
                                                                images: Array.from(event.target.files || []),
                                                            })
                                                        }
                                                        className="block w-full text-xs text-cream/50 file:mr-3 file:h-11 file:border-0 file:bg-gold-400 file:px-4 file:text-xs file:font-bold file:text-obsidian"
                                                    />
                                                </label>
                                                <label className="sm:col-span-2">
                                                    <span className="mb-1.5 block text-xs text-cream/60">New image assignment</span>
                                                    <select
                                                        value={draft.imageScope}
                                                        onChange={(event) => updateVariantDraft(draft.key, { imageScope: event.target.value as VariantDraft['imageScope'] })}
                                                        className={inputStyle}
                                                    >
                                                        <option value="color">Every combination with this colour</option>
                                                        <option value="exact">This exact combination only</option>
                                                    </select>
                                                </label>
                                                <label className="sm:col-span-2">
                                                    <span className="mb-1.5 block text-xs text-cream/60">Google Drive image links</span>
                                                    <textarea
                                                        value={draft.driveImageUrls}
                                                        onChange={(event) =>
                                                            updateVariantDraft(draft.key, {
                                                                driveImageUrls: event.target.value,
                                                            })
                                                        }
                                                        rows={3}
                                                        placeholder={'Paste public Google Drive file links here\nOne image link per line'}
                                                        className={textareaStyle}
                                                    />
                                                    <span className="mt-1 block text-[10px] text-cream/40">
                                                        Your browser downloads each public Drive image, then uploads it to Glockery. Set access to “Anyone with the link”; folder links are not supported.
                                                    </span>
                                                </label>
                                            </div>
                                            <label className="mt-3 flex min-h-11 items-center gap-3 text-xs text-cream/65">
                                                <input
                                                    type="checkbox"
                                                    checked={draft.isActive}
                                                    onChange={(event) =>
                                                        updateVariantDraft(draft.key, {
                                                            isActive: event.target.checked,
                                                        })
                                                    }
                                                    className="size-4 accent-gold-400"
                                                />
                                                Available for customers
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {editingProduct && editingProduct.images.length > 0 && (
                                <section className="sm:col-span-2" aria-labelledby="existing-images-heading">
                                    <h3 id="existing-images-heading" className="text-sm font-semibold text-cream">
                                        Order and assign existing images
                                    </h3>
                                    <p className="mt-1 text-xs text-cream/55">
                                        The storefront shows images in this order, each option&rsquo;s own images before shared ones. A product card uses the first image of its lowest-priced option, or the first shared image when that option has none. Moving an image saves at once. Keep an image product-wide, reuse it for every combination of one colour, or choose exact combinations.
                                    </p>
                                    <p role="status" aria-live="polite" className="mt-1 min-h-4 text-[11px] text-gold-300">
                                        {imageOrderNotice}
                                    </p>
                                    <ol className="mt-2 grid gap-3 sm:grid-cols-2" aria-label="Product images in storefront order">
                                        {editingProduct.images.map((image, imageIndex) => {
                                            const assignedIds = imageAssignments[image.id] ?? [];
                                            const mode = assignmentMode(assignedIds, variantDrafts);
                                            const imageCount = editingProduct.images.length;
                                            const reorderBlocked = saving || busyItem !== null;
                                            const moveButtonClass = 'flex size-11 items-center justify-center rounded-sm border border-gold-500/25 bg-carbon text-cream hover:border-gold-400 aria-disabled:cursor-not-allowed aria-disabled:opacity-30';
                                            return (
                                            <li key={image.id} className="flex items-start gap-3 bg-obsidian/55 p-2" aria-busy={busyItem === `image-order:${image.id}`}>
                                                <span className="flex shrink-0 flex-col items-center gap-1.5">
                                                    <img loading="lazy" decoding="async" src={image.thumbnailUrl} alt={image.altText} className="size-16 bg-obsidian object-contain" />
                                                    <span className="text-[10px] tabular-nums text-cream/55">{imageIndex + 1} of {imageCount}</span>
                                                    {imageCount > 1 && (
                                                        <span className="flex gap-1">
                                                            {/* aria-disabled rather than disabled keeps keyboard focus on the button while it moves. */}
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleMoveImage(editingProduct.id, image.id, -1)}
                                                                aria-disabled={reorderBlocked || imageIndex === 0}
                                                                aria-label={`Move image ${imageIndex + 1} of ${imageCount} earlier`}
                                                                className={moveButtonClass}
                                                            >
                                                                <IconChevronLeft size={16} aria-hidden="true" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleMoveImage(editingProduct.id, image.id, 1)}
                                                                aria-disabled={reorderBlocked || imageIndex === imageCount - 1}
                                                                aria-label={`Move image ${imageIndex + 1} of ${imageCount} later`}
                                                                className={moveButtonClass}
                                                            >
                                                                <IconChevronRight size={16} aria-hidden="true" />
                                                            </button>
                                                        </span>
                                                    )}
                                                </span>
                                                <label className="min-w-0 flex-1">
                                                    <span className="mb-1 block text-[11px] text-cream/55">Gallery assignment</span>
                                                    <select
                                                        value={mode}
                                                        onChange={(event) => {
                                                            const value = event.target.value;
                                                            let variantIds: string[] = [];
                                                            if (value === 'exact') variantIds = assignedIds.length ? assignedIds : variantDrafts.flatMap((draft) => draft.id ? [draft.id] : []).slice(0, 1);
                                                            else if (value.startsWith('color:')) {
                                                                const color = value.slice('color:'.length);
                                                                variantIds = variantDrafts.flatMap((draft) => draft.id && draft.color.trim() === color ? [draft.id] : []);
                                                            }
                                                            setImageAssignments((current) => ({ ...current, [image.id]: variantIds }));
                                                        }}
                                                        className="field h-10 w-full text-xs"
                                                    >
                                                        <option value="shared">Shared across the product</option>
                                                        {[...new Set(variantDrafts.map((draft) => draft.color.trim()).filter(Boolean))].map((color) => (
                                                            <option key={color} value={`color:${color}`}>Every {color} combination</option>
                                                        ))}
                                                        <option value="exact">Selected exact combinations</option>
                                                    </select>
                                                    {mode === 'exact' && (
                                                        <span className="mt-2 grid gap-1.5">
                                                            {variantDrafts.filter((draft) => draft.id).map((draft) => (
                                                                <span key={draft.id} className="flex items-center gap-2 text-[11px] text-cream/65">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={assignedIds.includes(draft.id!)}
                                                                        onChange={(event) => setImageAssignments((current) => ({
                                                                            ...current,
                                                                            [image.id]: event.target.checked
                                                                                ? [...new Set([...(current[image.id] ?? []), draft.id!])]
                                                                                : (current[image.id] ?? []).filter((id) => id !== draft.id),
                                                                        }))}
                                                                        className="size-4 accent-gold-400"
                                                                    />
                                                                    {draft.color || 'No colour'} · {draft.size || 'No size'} · {draft.packQuantity ? `Pack of ${draft.packQuantity}` : 'Single'}
                                                                </span>
                                                            ))}
                                                        </span>
                                                    )}
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleDeleteExistingImage(editingProduct.id, image.id)}
                                                    disabled={saving || busyItem !== null}
                                                    aria-busy={busyItem === `image:${image.id}`}
                                                    className="p-2 text-red-300 disabled:opacity-40"
                                                    aria-label="Delete image"
                                                >
                                                    <IconTrash size={15} />
                                                </button>
                                            </li>
                                            );
                                        })}
                                    </ol>
                                </section>
                            )}

                            {editingProduct && editingProduct.videos.length > 0 && (
                                <section className="sm:col-span-2" aria-labelledby="existing-videos-heading">
                                    <h3 id="existing-videos-heading" className="text-sm font-semibold text-cream">Existing videos</h3>
                                    <p className="mt-1 text-xs text-cream/55">Uploaded videos are converted and stored as browser-ready MP4 files. Replace older external or unsupported videos here.</p>
                                    <div className="mt-3 space-y-2">
                                        {editingProduct.videos.map((video) => (
                                            <div key={video.id} className="flex flex-wrap items-center justify-between gap-3 bg-obsidian/55 p-3 text-xs">
                                                <a href={video.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-gold-300 hover:text-gold-100">{video.altText || 'Product video'}</a>
                                                <button type="button" disabled={saving} onClick={() => void handleDeleteVideo(editingProduct.id, video.id)} className="border border-red-500/35 px-3 py-2 font-semibold text-red-200 hover:bg-red-500/10 disabled:opacity-50">Remove video</button>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            )}

                            <label className="sm:col-span-2">
                                <span className="mb-1.5 block text-xs text-cream/60 font-medium">Shared gallery images</span>
                                <input
                                    name="images"
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                    multiple
                                    className="block w-full text-xs text-cream/50 file:mr-3 file:h-11 file:border-0 file:bg-gold-400 file:px-4 file:text-xs file:font-bold file:text-obsidian file:rounded-sm cursor-pointer"
                                />
                                <span className="mt-1 block text-[10px] text-cream/40">
                                    Optional lifestyle or packaging photos shown after every selected colour’s own images.
                                </span>
                            </label>

                            <label className="sm:col-span-2">
                                <span className="mb-1.5 block text-xs text-cream/60 font-medium">Shared Google Drive image links</span>
                                <textarea
                                    name="driveImageUrls"
                                    rows={3}
                                    placeholder={'Paste public Google Drive file links here\nOne image link per line'}
                                    className={textareaStyle}
                                />
                                <span className="mt-1 block text-[10px] text-cream/40">
                                    Your browser downloads and uploads these shared images. They appear after each option’s photos; Drive access must be “Anyone with the link”.
                                </span>
                            </label>

                            <label className="sm:col-span-2">
                                <span className="mb-1.5 block text-xs text-cream/60 font-medium">Upload Product Video</span>
                                <input
                                    name="videoFile"
                                    type="file"
                                    accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/mpeg,video/ogg"
                                    className="block w-full text-xs text-cream/50 file:mr-3 file:h-11 file:border-0 file:bg-gold-400 file:px-4 file:text-xs file:font-bold file:text-obsidian file:rounded-sm cursor-pointer"
                                />
                                <span className="mt-1 block text-[10px] text-cream/40">MP4, WebM, MOV, AVI, MPEG, or OGG; up to 25 MB. Every upload is converted to an H.264/AAC MP4 before Supabase storage.</span>
                            </label>
                        </div>

                        </div>
                        <div data-dialog-actions="product" className="shrink-0 border-t border-gold-500/20 bg-carbon px-4 py-3 sm:px-7 sm:py-4">
                            <button
                                disabled={saving || busyItem !== null}
                                className="h-12 w-full bg-gold-400 text-xs font-bold uppercase tracking-[0.2em] text-obsidian disabled:opacity-50 hover:bg-gold-300 rounded-sm shadow-md"
                            >
                                {saving ? 'Saving product and options…' : editingProduct ? 'Save product and options' : 'Create product and options'}
                            </button>
                        </div>
                    </form>
                </div>
                </AdminModalLayer>
            )}

            {/* Category Modal */}
            {openCategoryModal && (
                <AdminModalLayer>
                <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/85 p-5 backdrop-blur-sm">
                    <form
                        ref={categoryDialogRef}
                        tabIndex={-1}
                        onSubmit={handleCategorySubmit}
                        className="max-h-[calc(100svh-2rem)] w-full max-w-lg overflow-y-auto border border-gold-500/30 bg-carbon p-6 rounded-sm shadow-2xl outline-none"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="category-dialog-title"
                    >
                        <div className="flex justify-between border-b border-gold-500/20 pb-4">
                            <h2 id="category-dialog-title" className="font-display text-2xl text-cream">
                                {editingCategory ? 'Edit Category' : 'Create Category'}
                            </h2>
                            <button
                                type="button"
                                aria-label="Close category dialog"
                                onClick={() => {
                                    setOpenCategoryModal(false);
                                    setEditingCategory(null);
                                }}
                                disabled={saving}
                                className="flex min-h-11 shrink-0 items-center gap-2 rounded-sm px-3 text-xs font-semibold text-cream/60 hover:bg-obsidian hover:text-cream disabled:opacity-40"
                            >
                                <IconClose size={17} aria-hidden="true" /> Close
                            </button>
                        </div>
                        <div className="mt-5 space-y-4">
                            <label className="block">
                                <span className="mb-1.5 block text-xs text-cream/60">Category Name</span>
                                <input name="name" defaultValue={editingCategory?.name || ''} className={inputStyle} required />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-xs text-cream/60">Description</span>
                                <textarea
                                    name="description"
                                    defaultValue={editingCategory?.description || ''}
                                    rows={3}
                                    className="w-full border border-gold-500/25 bg-obsidian p-3 text-sm text-cream outline-none rounded-sm"
                                />
                            </label>
                            <label className="flex items-center gap-2 text-xs text-cream">
                                <input
                                    type="checkbox"
                                    name="isPublished"
                                    defaultChecked={editingCategory ? editingCategory.isPublished : true}
                                    className="accent-gold-400 size-4"
                                />
                                <span>Published on Storefront</span>
                            </label>
                        </div>
                        <button
                            disabled={saving}
                            className="mt-6 h-11 w-full bg-gold-400 text-xs font-bold uppercase tracking-wider text-obsidian hover:bg-gold-300 rounded-sm"
                        >
                            {saving ? 'Saving Category…' : editingCategory ? 'Update Category' : 'Create Category'}
                        </button>
                    </form>
                </div>
                </AdminModalLayer>
            )}
        </AdminShell>
    );
};

// ----------------------------------------------------
// 4. SMART INVENTORY & STOCK EDITOR
// ----------------------------------------------------
const INVENTORY_PAGE_SIZE = 50;

type InventoryHealth = 'inactive' | 'low' | 'ok';

/** Inactive variants and warehouses are not sold, so they never count as low stock. */
const inventoryHealth = (level: InventoryLevelView): InventoryHealth => {
    if (!level.variantIsActive || !level.warehouseIsActive) return 'inactive';
    return level.onHand - level.reserved <= level.lowStockThreshold ? 'low' : 'ok';
};

const inventoryLabel = (level: InventoryLevelView): string =>
    [level.productName, level.color, level.sku].filter(Boolean).join(' · ');

/** Row-level errors attached to a 409 from the bulk inventory endpoint. */
const apiRowErrors = (caught: unknown): { index: number; message: string }[] => {
    const details = caught && typeof caught === 'object' && 'details' in caught ? (caught as { details?: unknown }).details : undefined;
    const errors = details && typeof details === 'object' && 'errors' in details ? (details as { errors?: unknown }).errors : undefined;
    if (!Array.isArray(errors)) return [];
    return errors.filter(
        (item): item is { index: number; message: string } =>
            Boolean(item) && typeof item === 'object' && typeof item.index === 'number' && typeof item.message === 'string',
    );
};

const errorMessage = (caught: unknown, fallback: string): string => (caught instanceof Error ? caught.message : fallback);

const importPhaseLabel: Record<'reading' | 'checking' | 'saving', string> = {
    reading: 'Reading file…',
    checking: 'Checking rows…',
    saving: 'Saving stock…',
};

const InventoryAdmin = () => {
    const [levels, setLevels] = useState<InventoryLevelView[]>([]);
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const deferredSearch = useDeferredValue(searchQuery);
    const [lowStockOnly, setLowStockOnly] = useState(false);
    const [page, setPage] = useState(1);

    const [editingLevel, setEditingLevel] = useState<InventoryLevelView | null>(null);
    const [openWarehouseModal, setOpenWarehouseModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [warehouseBusyId, setWarehouseBusyId] = useState<string | null>(null);
    const [importPhase, setImportPhase] = useState<'idle' | 'reading' | 'checking' | 'saving'>('idle');
    const [bulkImportErrors, setBulkImportErrors] = useState<string[]>([]);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const warehouseDialogRef = useDialog<HTMLDivElement>(openWarehouseModal, () => setOpenWarehouseModal(false));
    const stockDialogRef = useDialog<HTMLFormElement>(Boolean(editingLevel), () => setEditingLevel(null));
    const importing = importPhase !== 'idle';

    // Levels carry their own SKU, product, colour and thumbnail, so warehouse managers
    // never need catalogue-manager access to use this page.
    const load = () =>
        Promise.all([api.inventory(), api.warehouses()])
            .then(([rows, warehouseRows]) => {
                setLevels(rows);
                setWarehouses(warehouseRows);
            })
            .catch((caught) => setError(errorMessage(caught, 'Unable to load inventory.')))
            .finally(() => setLoaded(true));

    useEffect(() => {
        void load();
    }, []);

    const mergeLevel = (saved: InventoryLevel) =>
        setLevels((current) =>
            current.map((level) =>
                level.warehouseId === saved.warehouseId && level.variantId === saved.variantId
                    ? { ...level, onHand: saved.onHand, reserved: saved.reserved, lowStockThreshold: saved.lowStockThreshold }
                    : level,
            ),
        );

    const handleCreateWarehouse = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        try {
            const warehouse = await api.createWarehouse({
                code: String(form.get('code')).trim().toUpperCase(),
                name: String(form.get('name')).trim(),
            });
            formElement.reset();
            setSuccessMsg(`${warehouse.name} created. Every catalogue variant is ready to stock.`);
            await load();
        } catch (caught) {
            setError(errorMessage(caught, 'Failed to create warehouse.'));
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateWarehouse = async (warehouse: Warehouse, event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const name = String(form.get('name') || '').trim();
        const isActive = form.get('isActive') === 'on';
        const input: { name?: string; isActive?: boolean } = {};
        if (name && name !== warehouse.name) input.name = name;
        if (isActive !== warehouse.isActive) input.isActive = isActive;
        if (!Object.keys(input).length) return;
        if (
            input.isActive === false &&
            !window.confirm(`Deactivate ${warehouse.name}? Its stock will no longer be offered to customers.`)
        ) {
            return;
        }
        setWarehouseBusyId(warehouse.id);
        setError('');
        try {
            const saved = await api.updateWarehouse(warehouse.id, input);
            setWarehouses((current) => current.map((item) => (item.id === saved.id ? saved : item)));
            setLevels((current) =>
                current.map((level) =>
                    level.warehouseId === saved.id ? { ...level, warehouseName: saved.name, warehouseIsActive: saved.isActive } : level,
                ),
            );
            setSuccessMsg(`${saved.name} updated.`);
        } catch (caught) {
            setError(errorMessage(caught, 'Failed to update warehouse.'));
        } finally {
            setWarehouseBusyId(null);
        }
    };

    const handleSaveStock = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingLevel) return;
        const form = new FormData(e.currentTarget);
        const onHand = Number(form.get('onHand'));
        const lowStockThreshold = Number(form.get('lowStockThreshold'));
        const onHandChanged = onHand !== editingLevel.onHand;
        if (!onHandChanged && lowStockThreshold === editingLevel.lowStockThreshold) {
            setEditingLevel(null);
            return;
        }
        setSaving(true);
        setError('');
        try {
            // Only send on-hand when it was edited, guarded by the value this editor loaded, so a
            // threshold change or a stale page can never overwrite stock checkout just moved.
            const saved = await api.setInventory(editingLevel.warehouseId, {
                variantId: editingLevel.variantId,
                lowStockThreshold,
                ...(onHandChanged ? { onHand, expectedOnHand: editingLevel.onHand } : {}),
            });
            mergeLevel(saved);
            setSuccessMsg(`${editingLevel.sku} · ${editingLevel.warehouseCode} updated.`);
            setEditingLevel(null);
        } catch (caught) {
            const status = caught && typeof caught === 'object' && 'status' in caught ? (caught as { status?: number }).status : undefined;
            if (status === 409) {
                setEditingLevel(null);
                setError(`${errorMessage(caught, 'Stock changed.')} The list has been refreshed.`);
                await load();
            } else {
                setError(errorMessage(caught, 'Failed to update stock.'));
            }
        } finally {
            setSaving(false);
        }
    };

    const handleInventoryImport = async (file: File) => {
        setImportPhase('reading');
        setBulkImportErrors([]);
        setError('');
        setSuccessMsg('');
        try {
            const rows = parseInventoryCsv(await readSpreadsheetText(file));
            setImportPhase('checking');
            const formatErrors = validateInventoryCsvRows(rows);
            const plan = formatErrors.length ? null : planInventoryImport(rows, levels, warehouses);
            const errors = plan ? plan.errors : formatErrors;
            if (!plan || errors.length) {
                setBulkImportErrors(errors);
                setError(`Import stopped: ${errors.length} validation error(s). No inventory was changed.`);
                return;
            }
            if (!plan.changes.length) {
                setSuccessMsg(`Nothing to import: all ${plan.unchanged} row(s) already match current stock.`);
                return;
            }
            if (
                !window.confirm(
                    `Update ${plan.changes.length} inventory row(s)? ${plan.unchanged} unchanged row(s) will be skipped. ` +
                        'All rows are saved together — if any row fails, nothing changes.',
                )
            ) {
                return;
            }
            setImportPhase('saving');
            const rowBySource = new Map(rows.map((row) => [row.sourceRow, row]));
            try {
                const result = await api.bulkSetInventory(
                    plan.changes.map((change) => ({
                        warehouseId: change.warehouseId,
                        variantId: change.variantId,
                        onHand: change.onHand,
                        lowStockThreshold: change.lowStockThreshold,
                        expectedOnHand: change.expectedOnHand,
                    })),
                );
                setSuccessMsg(
                    `Inventory import applied: ${result.updated} row(s) updated, ${plan.unchanged + result.unchanged} unchanged.`,
                );
                await load();
            } catch (caught) {
                const rowErrors = apiRowErrors(caught);
                if (rowErrors.length) {
                    setBulkImportErrors(
                        rowErrors.map(({ index, message }) => {
                            const change = plan.changes[index];
                            const row = change ? rowBySource.get(change.sourceRow) : undefined;
                            return row ? `Row ${row.sourceRow} (${row.warehouse_code} / ${row.sku}): ${message}` : message;
                        }),
                    );
                }
                throw caught;
            }
        } catch (caught) {
            setError(errorMessage(caught, 'Could not import the inventory CSV.'));
        } finally {
            setImportPhase('idle');
        }
    };

    const searchIndex = useMemo(
        () =>
            new Map(
                levels.map((level) => [
                    level.id,
                    [level.sku, level.alias, level.productName, level.color, level.warehouseCode, level.warehouseName]
                        .filter(Boolean)
                        .join('\n')
                        .toLowerCase(),
                ]),
            ),
        [levels],
    );
    const normalizedQuery = deferredSearch.trim().toLowerCase();
    const filteredLevels = useMemo(
        () =>
            levels.filter(
                (level) =>
                    (!lowStockOnly || inventoryHealth(level) === 'low') &&
                    (!normalizedQuery || Boolean(searchIndex.get(level.id)?.includes(normalizedQuery))),
            ),
        [levels, searchIndex, normalizedQuery, lowStockOnly],
    );
    const lowStockCount = useMemo(() => levels.filter((level) => inventoryHealth(level) === 'low').length, [levels]);
    const totalPages = Math.max(1, Math.ceil(filteredLevels.length / INVENTORY_PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pageLevels = filteredLevels.slice((currentPage - 1) * INVENTORY_PAGE_SIZE, currentPage * INVENTORY_PAGE_SIZE);

    return (
        <AdminShell
            title="Inventory"
            description="Review warehouse availability, reservations and low-stock thresholds. New variants appear here automatically with zero stock."
            action={
                <div className="flex flex-wrap justify-end gap-3">
                    <button
                        onClick={() => downloadCsv('glockery-inventory-template.csv', inventoryCsvTemplate())}
                        className="flex h-11 items-center gap-2 border border-gold-500/30 bg-carbon px-3 text-xs font-bold uppercase tracking-wider text-cream hover:border-gold-400"
                    >
                        <IconDownload size={15} /> Template
                    </button>
                    <button
                        onClick={() =>
                            downloadCsv(
                                'glockery-inventory-export.csv',
                                inventoryCsvExport(
                                    levels.map((level) => ({
                                        warehouseCode: level.warehouseCode,
                                        sku: level.sku,
                                        onHand: level.onHand,
                                        lowStockThreshold: level.lowStockThreshold,
                                    })),
                                ),
                            )
                        }
                        disabled={!levels.length}
                        className="flex h-11 items-center gap-2 border border-gold-500/30 bg-carbon px-3 text-xs font-bold uppercase tracking-wider text-cream hover:border-gold-400 disabled:opacity-40"
                    >
                        <IconDownload size={15} /> Export
                    </button>
                    <label
                        aria-disabled={importing}
                        className={`flex h-11 items-center gap-2 border border-gold-500/30 bg-carbon px-3 text-xs font-bold uppercase tracking-wider text-cream ${
                            importing ? 'cursor-wait opacity-50' : 'cursor-pointer hover:border-gold-400'
                        }`}
                    >
                        <IconPlus size={15} /> {importPhase === 'idle' ? 'Import CSV' : importPhaseLabel[importPhase]}
                        <input
                            type="file"
                            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            disabled={importing}
                            className="sr-only"
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = '';
                                if (file) void handleInventoryImport(file);
                            }}
                        />
                    </label>
                    <button
                        onClick={() => setOpenWarehouseModal(true)}
                        className="flex h-11 items-center gap-2 bg-gold-400 px-4 text-xs font-bold uppercase tracking-wider text-obsidian hover:bg-gold-300 rounded-sm"
                    >
                        <IconEdit size={16} /> Warehouses
                    </button>
                </div>
            }
        >
            <NotificationToast message={error} type="error" onClose={() => setError('')} />
            <NotificationToast message={successMsg} type="success" onClose={() => setSuccessMsg('')} />
            <p className="mb-4 text-xs leading-relaxed text-cream/55">
                CSV import: columns <code>warehouse_code, sku, on_hand, low_stock_threshold</code>. The <code>sku</code> column also accepts a
                variant alias. Start from Export to include <code>exported_on_hand</code>, which rejects rows whose stock changed after you
                exported. Spreadsheet apps can drop leading zeros from numeric SKUs — format that column as text before saving.
            </p>
            {bulkImportErrors.length > 0 && (
                <div className="mb-6 border border-amber-500/35 bg-amber-950/20 p-4 text-xs text-amber-100" role="alert">
                    <div className="flex items-center justify-between gap-4">
                        <strong>Inventory import report · {bulkImportErrors.length} issue(s)</strong>
                        <button onClick={() => setBulkImportErrors([])} className="text-amber-200/70 hover:text-amber-100">Close</button>
                    </div>
                    <ul className="mt-3 max-h-44 list-disc space-y-1 overflow-y-auto pl-5">
                        {bulkImportErrors.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}
                    </ul>
                </div>
            )}

            {/* Filter Bar */}
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
                <div className="flex min-w-0 flex-1 rounded-sm border border-gold-500/25 bg-carbon sm:min-w-[260px]">
                    <IconSearch className="m-3 text-gold-400" />
                    <input
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setPage(1);
                        }}
                        placeholder="Search by SKU, alias, product, colour or warehouse…"
                        aria-label="Search inventory"
                        className="min-w-0 flex-1 bg-transparent text-sm text-cream outline-none"
                    />
                </div>
                <button
                    onClick={() => {
                        setLowStockOnly(!lowStockOnly);
                        setPage(1);
                    }}
                    aria-pressed={lowStockOnly}
                    className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-sm border px-4 py-2.5 text-xs font-semibold transition-colors sm:w-auto ${
                        lowStockOnly ? 'border-red-500/40 bg-red-950/40 text-red-200' : 'border-gold-500/25 bg-carbon text-cream/60 hover:border-gold-400'
                    }`}
                >
                    <IconAlert size={16} />
                    {lowStockOnly ? `Showing ${lowStockCount} Low Stock Alert(s)` : `Filter Low Stock Alerts (${lowStockCount})`}
                </button>
            </div>

            {loaded && !warehouses.length && (
                <div className="mb-6 border border-amber-500/30 bg-amber-950/20 p-5 rounded-sm">
                    <h2 className="text-sm font-bold text-amber-300">Set up your first warehouse</h2>
                    <p className="mt-1 text-xs text-cream/65">
                        Inventory is tracked per warehouse. Creating one automatically adds every catalogue variant at zero stock, ready for you to set its
                        on-hand quantity.
                    </p>
                    <button
                        onClick={() => setOpenWarehouseModal(true)}
                        className="mt-4 flex h-10 items-center gap-2 border border-amber-400/40 px-3 text-xs font-semibold text-amber-200 hover:bg-amber-400/10 rounded-sm"
                    >
                        <IconPlus size={14} /> Create First Warehouse
                    </button>
                </div>
            )}

            {/* Inventory Table */}
            <div className={`${box} overflow-x-auto`}>
                <table className="admin-responsive-table w-full min-w-[860px] text-left text-sm">
                    <thead className="border-b border-gold-500/20 text-[9px] uppercase tracking-[0.2em] text-gold-400 bg-obsidian/60">
                        <tr>
                            <th className="p-4">SKU / Alias / Item</th>
                            <th className="p-4">Warehouse</th>
                            <th className="p-4 text-center">On Hand</th>
                            <th className="p-4 text-center">Reserved</th>
                            <th className="p-4 text-center">Available</th>
                            <th className="p-4 text-center">Low Threshold</th>
                            <th className="p-4 text-center">Health Status</th>
                            <th className="p-4 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gold-500/10">
                        {pageLevels.map((level) => {
                            const available = level.onHand - level.reserved;
                            const health = inventoryHealth(level);

                            return (
                                <tr key={level.id} className={`transition-colors hover:bg-gold-400/[.03] ${health === 'inactive' ? 'opacity-60' : ''}`}>
                                    <td data-label="Item" className="p-4 font-medium text-cream">
                                        <div className="flex items-center gap-3">
                                            <img
                                                loading="lazy"
                                                decoding="async"
                                                src={level.thumbnailUrl || fallbackImage}
                                                alt=""
                                                className="size-12 shrink-0 rounded-sm border border-gold-500/20 bg-obsidian object-contain"
                                                onError={(event) => { event.currentTarget.src = fallbackImage; }}
                                            />
                                            <div>
                                                <span className="block text-cream">{level.productName}</span>
                                                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                                    {level.color && (
                                                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-cream/75">
                                                            {level.colorHex && (
                                                                <span
                                                                    role="img"
                                                                    aria-label={`${level.color} colour swatch`}
                                                                    className="size-3.5 shrink-0 rounded-full border border-cream/30 shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
                                                                    style={{ backgroundColor: level.colorHex }}
                                                                />
                                                            )}
                                                            {level.color}
                                                        </span>
                                                    )}
                                                    <span className="font-mono text-[10px] font-semibold tracking-wide text-gold-300">{level.sku}</span>
                                                    {level.alias && <span className="font-mono text-[10px] text-cream/50">Alias: {level.alias}</span>}
                                                    {!level.variantIsActive && (
                                                        <span className="rounded-full border border-cream/20 px-2 text-[9px] uppercase tracking-wider text-cream/50">
                                                            Variant inactive
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td data-label="Warehouse" className="p-4 text-xs text-cream/60">
                                        {level.warehouseName}
                                        <span className="ml-2 text-[10px] text-gold-400">{level.warehouseCode}</span>
                                        {!level.warehouseIsActive && <span className="ml-2 text-[10px] uppercase text-cream/40">Inactive</span>}
                                    </td>
                                    <td data-label="On hand" className="p-4 text-center font-display text-base text-cream">{level.onHand}</td>
                                    <td data-label="Reserved" className="p-4 text-center text-cream/50">{level.reserved}</td>
                                    <td
                                        data-label="Available"
                                        className={`p-4 text-center font-display text-lg font-bold ${
                                            health === 'low' ? 'text-red-400' : health === 'ok' ? 'text-emerald-400' : 'text-cream/50'
                                        }`}
                                    >
                                        {available}
                                    </td>
                                    <td data-label="Low threshold" className="p-4 text-center text-cream/40">{level.lowStockThreshold}</td>
                                    <td data-label="Health" className="p-4 text-center">
                                        <span
                                            className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                                                health === 'low'
                                                    ? 'border-red-500/30 bg-red-950/30 text-red-300'
                                                    : health === 'ok'
                                                      ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300'
                                                      : 'border-cream/20 text-cream/50'
                                            }`}
                                        >
                                            {health === 'low' ? 'Low Stock Warning' : health === 'ok' ? 'Stocked' : 'Not on sale'}
                                        </span>
                                    </td>
                                    <td data-label="Actions" className="p-4 text-center">
                                        <button
                                            onClick={() => setEditingLevel(level)}
                                            className="rounded-sm border border-gold-500/25 bg-carbon px-3 py-1.5 text-xs text-gold-300 hover:border-gold-400"
                                        >
                                            Adjust Stock
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {!filteredLevels.length && (
                    <p className="p-10 text-center text-sm text-cream/40">{loaded ? 'No inventory level records found.' : 'Loading inventory…'}</p>
                )}
            </div>
            {filteredLevels.length > 0 && (
                <p className="mt-3 text-center text-[11px] text-cream/45">
                    Showing {(currentPage - 1) * INVENTORY_PAGE_SIZE + 1}–{Math.min(currentPage * INVENTORY_PAGE_SIZE, filteredLevels.length)} of{' '}
                    {filteredLevels.length} level(s)
                </p>
            )}
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setPage} />

            {openWarehouseModal && (
                <AdminModalLayer>
                <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/85 p-5 backdrop-blur-sm">
                    <div
                        ref={warehouseDialogRef}
                        tabIndex={-1}
                        className="max-h-[calc(100svh-2rem)] w-full max-w-lg overflow-y-auto border border-gold-500/30 bg-carbon p-6 rounded-sm shadow-2xl outline-none"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="warehouse-dialog-title"
                    >
                        <div className="flex justify-between border-b border-gold-500/20 pb-4">
                            <div>
                                <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-gold-400">Inventory Setup</span>
                                <h3 id="warehouse-dialog-title" className="font-display text-2xl text-cream">
                                    Warehouses
                                </h3>
                            </div>
                            <button type="button" onClick={() => setOpenWarehouseModal(false)} className="flex min-h-11 shrink-0 items-center gap-2 rounded-sm px-3 text-xs font-semibold text-cream/60 hover:bg-obsidian hover:text-cream" aria-label="Close warehouse dialog">
                                <IconClose size={17} aria-hidden="true" /> Close
                            </button>
                        </div>
                        {warehouses.length > 0 && (
                            <ul className="mt-5 space-y-3">
                                {warehouses.map((warehouse) => {
                                    const busy = warehouseBusyId === warehouse.id;
                                    return (
                                        <li key={`${warehouse.id}-${warehouse.name}-${warehouse.isActive}`}>
                                            <form
                                                onSubmit={(event) => void handleUpdateWarehouse(warehouse, event)}
                                                className="flex flex-wrap items-end gap-3 border border-gold-500/15 bg-obsidian/40 p-3 rounded-sm"
                                            >
                                                <label className="min-w-0 flex-1">
                                                    <span className="mb-1 block text-[10px] uppercase tracking-wider text-gold-400">{warehouse.code}</span>
                                                    <input
                                                        name="name"
                                                        defaultValue={warehouse.name}
                                                        maxLength={120}
                                                        required
                                                        aria-label={`${warehouse.code} warehouse name`}
                                                        className="admin-field h-10 w-full text-sm"
                                                    />
                                                </label>
                                                <label className="flex h-10 items-center gap-2 text-xs text-cream/75">
                                                    <input type="checkbox" name="isActive" defaultChecked={warehouse.isActive} /> Active
                                                </label>
                                                <button
                                                    disabled={busy}
                                                    className="h-10 border border-gold-500/30 px-3 text-xs font-semibold text-gold-300 hover:border-gold-400 disabled:cursor-wait disabled:opacity-50 rounded-sm"
                                                >
                                                    {busy ? 'Saving…' : 'Save'}
                                                </button>
                                            </form>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        <p className="mt-2 text-[11px] text-cream/45">
                            Inactive warehouses keep their stock but it is not offered to customers. A warehouse holding reserved units cannot be deactivated.
                        </p>
                        <form onSubmit={handleCreateWarehouse} className="mt-6 border-t border-gold-500/20 pt-5">
                            <h4 className="text-sm font-semibold text-cream">Add Warehouse</h4>
                            <p className="mt-1 text-xs leading-relaxed text-cream/60">All catalogue variants will be added to this warehouse with zero stock.</p>
                            <div className="mt-4 space-y-4">
                                <label className="block">
                                    <span className="mb-1.5 block text-xs text-cream/70">Warehouse Name</span>
                                    <input name="name" placeholder="Main Warehouse" maxLength={120} className={inputStyle} required />
                                </label>
                                <label className="block">
                                    <span className="mb-1.5 block text-xs text-cream/70">Warehouse Code</span>
                                    <input
                                        name="code"
                                        placeholder="MAIN"
                                        pattern={'[A-Za-z0-9_\\-]+'}
                                        maxLength={40}
                                        title="Letters, numbers, - and _ only. Saved in capitals."
                                        onBlur={(event) => { event.currentTarget.value = event.currentTarget.value.trim().toUpperCase(); }}
                                        className={`${inputStyle} uppercase`}
                                        required
                                    />
                                    <span className="mt-1 block text-[11px] text-cream/45">Letters, numbers, - and _ only. Codes are permanent and used in CSV files.</span>
                                </label>
                            </div>
                            <button
                                disabled={saving}
                                className="mt-6 h-12 w-full bg-gold-400 text-xs font-bold uppercase tracking-wider text-obsidian hover:bg-gold-300 disabled:cursor-wait disabled:opacity-50 rounded-sm"
                            >
                                {saving ? 'Creating Warehouse…' : 'Create Warehouse'}
                            </button>
                        </form>
                    </div>
                </div>
                </AdminModalLayer>
            )}

            {/* Adjust Stock Modal */}
            {editingLevel && (
                <AdminModalLayer>
                <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/85 p-5 backdrop-blur-sm">
                    <form
                        ref={stockDialogRef}
                        tabIndex={-1}
                        onSubmit={handleSaveStock}
                        className="max-h-[calc(100svh-2rem)] w-full max-w-md overflow-y-auto border border-gold-500/30 bg-carbon p-6 rounded-sm shadow-2xl outline-none"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="stock-dialog-title"
                    >
                        <div className="flex justify-between border-b border-gold-500/20 pb-4">
                            <div>
                                <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-gold-400">Warehouse Stock</span>
                                <h3 id="stock-dialog-title" className="font-display text-2xl text-cream">
                                    Adjust SKU Level
                                </h3>
                            </div>
                            <button type="button" onClick={() => setEditingLevel(null)} className="flex min-h-11 shrink-0 items-center gap-2 rounded-sm px-3 text-xs font-semibold text-cream/60 hover:bg-obsidian hover:text-cream" aria-label="Close stock dialog">
                                <IconClose size={17} aria-hidden="true" /> Close
                            </button>
                        </div>
                        <div className="mt-5 space-y-4">
                            <div>
                                <p className="text-xs text-cream/50">Target SKU:</p>
                                <p className="font-display text-lg text-gold-300">{inventoryLabel(editingLevel)}</p>
                                <p className="mt-1 text-xs text-cream/55">
                                    {editingLevel.warehouseName} ({editingLevel.warehouseCode}) · {editingLevel.reserved} reserved for open orders
                                </p>
                            </div>
                            <label className="block">
                                <span className="mb-1.5 block text-xs text-cream/70">On-Hand Warehouse Quantity</span>
                                <input
                                    name="onHand"
                                    type="number"
                                    min={editingLevel.reserved}
                                    step="1"
                                    defaultValue={editingLevel.onHand}
                                    className={inputStyle}
                                    required
                                />
                                <span className="mt-1 block text-[11px] text-cream/45">
                                    Can’t go below reserved units. If an order changes this stock before you save, you’ll be asked to reload.
                                </span>
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-xs text-cream/70">Low Stock Alert Threshold</span>
                                <input
                                    name="lowStockThreshold"
                                    type="number"
                                    min="0"
                                    step="1"
                                    defaultValue={editingLevel.lowStockThreshold}
                                    className={inputStyle}
                                    required
                                />
                            </label>
                        </div>
                        <button
                            disabled={saving}
                            className="mt-6 h-12 w-full bg-gold-400 text-xs font-bold uppercase tracking-wider text-obsidian hover:bg-gold-300 disabled:cursor-wait disabled:opacity-50 rounded-sm"
                        >
                            {saving ? 'Updating Level…' : 'Save Stock Levels'}
                        </button>
                    </form>
                </div>
                </AdminModalLayer>
            )}
        </AdminShell>
    );
};

// ----------------------------------------------------
// 5. PROMOTIONS & COUPON MANAGEMENT (NEW)
// ----------------------------------------------------
const couponStatusStyles: Record<CouponStatus, string> = {
    Active: 'border-emerald-500/30 text-emerald-300',
    Scheduled: 'border-sky-500/30 text-sky-300',
    Expired: 'border-amber-500/30 text-amber-300',
    Inactive: 'border-gold-500/30 text-cream/40',
};

type CouponPatch = Parameters<typeof api.updateCoupon>[1];

interface CouponFormValues {
    code: string;
    type: 'PERCENT' | 'FIXED';
    value: number;
    minimumSubtotalPaise: number;
    maximumDiscountPaise: number | null;
    usageLimit: number | null;
    perUserLimit: number | null;
    startDate: string;
    endDate: string;
}

const readCouponForm = (form: FormData): CouponFormValues => {
    const text = (name: string) => String(form.get(name) ?? '').trim();
    const optionalPaise = (name: string) => (text(name) ? rupeesToPaise(Number(text(name))) : null);
    const optionalCount = (name: string) => (text(name) ? Number(text(name)) : null);
    const type = form.get('type') === 'FIXED' ? 'FIXED' : 'PERCENT';
    const value = Number(text('value'));
    return {
        code: normalizeCouponCode(text('code')),
        type,
        value: type === 'PERCENT' ? percentToBasisPoints(value) : rupeesToPaise(value),
        minimumSubtotalPaise: rupeesToPaise(Number(text('minimumSubtotal') || 0)),
        maximumDiscountPaise: optionalPaise('maximumDiscount'),
        usageLimit: optionalCount('usageLimit'),
        perUserLimit: optionalCount('perUserLimit'),
        startDate: text('startsAt'),
        endDate: text('endsAt'),
    };
};

const couponFormError = (values: CouponFormValues): string | null => {
    if (!/^[A-Z0-9_-]{1,40}$/.test(values.code)) return 'Coupon code may only use letters, numbers, - and _ (up to 40 characters).';
    if (!Number.isFinite(values.value) || values.value < 1) return 'Enter a discount greater than zero.';
    if (values.type === 'PERCENT' && values.value > 10_000) return 'A percentage discount cannot exceed 100%.';
    if (!values.startDate || !values.endDate || values.endDate < values.startDate) return 'The end date must be on or after the start date.';
    return null;
};

const couponPatch = (coupon: Coupon, values: CouponFormValues): CouponPatch => {
    const patch: CouponPatch = {};
    if (values.code !== coupon.code) patch.code = values.code;
    if (values.type !== coupon.type) patch.type = values.type;
    if (values.type !== coupon.type || values.value !== coupon.value) patch.value = values.value;
    if (values.minimumSubtotalPaise !== coupon.minimumSubtotalPaise) patch.minimumSubtotalPaise = values.minimumSubtotalPaise;
    if (values.maximumDiscountPaise !== (coupon.maximumDiscountPaise ?? null)) patch.maximumDiscountPaise = values.maximumDiscountPaise;
    if (values.usageLimit !== (coupon.usageLimit ?? null)) patch.usageLimit = values.usageLimit;
    if (values.perUserLimit !== (coupon.perUserLimit ?? null)) patch.perUserLimit = values.perUserLimit;
    // Untouched dates are left out so an existing coupon keeps its exact start/end instants.
    if (values.startDate !== istDateInputValue(coupon.startsAt)) patch.startsAt = istDateBoundaryIso(values.startDate);
    if (values.endDate !== istDateInputValue(coupon.endsAt)) patch.endsAt = istDateBoundaryIso(values.endDate, true);
    return patch;
};

const PromotionsAdmin = () => {
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [modal, setModal] = useState<{ coupon: Coupon | null } | null>(null);
    const [discountType, setDiscountType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [saving, setSaving] = useState(false);
    const [busyCouponId, setBusyCouponId] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const couponDialogRef = useDialog<HTMLFormElement>(Boolean(modal), () => setModal(null));
    const editing = modal?.coupon ?? null;

    const load = () =>
        api
            .coupons()
            .then((rows) => {
                setCoupons(rows);
                setNow(Date.now());
            })
            .catch((caught) => setError(errorMessage(caught, 'Unable to load coupons.')));

    useEffect(() => {
        void load();
    }, []);

    const replaceCoupon = (saved: Coupon) =>
        setCoupons((current) => current.map((item) => (item.id === saved.id ? { ...saved, redemptionCount: item.redemptionCount } : item)));

    const openCouponModal = (coupon: Coupon | null) => {
        setDiscountType(coupon?.type ?? 'PERCENT');
        setNow(Date.now());
        setModal({ coupon });
    };

    const handleSaveCoupon = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        const values = readCouponForm(new FormData(e.currentTarget));
        const invalid = couponFormError(values);
        if (invalid) {
            setError(invalid);
            return;
        }
        setSaving(true);
        try {
            if (editing) {
                const patch = couponPatch(editing, values);
                if (!Object.keys(patch).length) {
                    setModal(null);
                    return;
                }
                replaceCoupon(await api.updateCoupon(editing.id, patch));
                setSuccessMsg(`Coupon ${values.code} updated.`);
            } else {
                const created = await api.createCoupon({
                    code: values.code,
                    type: values.type,
                    value: values.value,
                    minimumSubtotalPaise: values.minimumSubtotalPaise,
                    maximumDiscountPaise: values.maximumDiscountPaise ?? undefined,
                    usageLimit: values.usageLimit ?? undefined,
                    perUserLimit: values.perUserLimit ?? undefined,
                    startsAt: istDateBoundaryIso(values.startDate),
                    endsAt: istDateBoundaryIso(values.endDate, true),
                    isActive: true,
                });
                setCoupons((current) => [{ ...created, redemptionCount: 0 }, ...current]);
                setSuccessMsg(`Promotional coupon ${created.code} created.`);
            }
            setNow(Date.now());
            setModal(null);
        } catch (caught) {
            setError(errorMessage(caught, editing ? 'Coupon update failed.' : 'Coupon creation failed.'));
        } finally {
            setSaving(false);
        }
    };

    const toggleCoupon = async (coupon: Coupon) => {
        if (coupon.isActive && !window.confirm(`Deactivate ${coupon.code}? Customers will no longer be able to apply it.`)) return;
        setBusyCouponId(coupon.id);
        setError('');
        try {
            replaceCoupon(await api.updateCoupon(coupon.id, { isActive: !coupon.isActive }));
            setSuccessMsg(`Coupon ${coupon.code} ${coupon.isActive ? 'deactivated' : 'activated'}.`);
        } catch (caught) {
            setError(errorMessage(caught, 'Coupon update failed.'));
        } finally {
            setBusyCouponId(null);
        }
    };

    const valueDefault = (() => {
        if (editing && editing.type === discountType) {
            return discountType === 'PERCENT' ? String(basisPointsToPercent(editing.value)) : paiseToRupeesValue(editing.value);
        }
        return discountType === 'PERCENT' ? '10' : '100';
    })();

    return (
        <AdminShell
            title="Promotions"
            description="Create and manage coupon discounts, minimum spends and expiry dates. All dates follow India time (IST)."
            action={
                <button
                    onClick={() => openCouponModal(null)}
                    className="flex h-11 items-center gap-2 bg-gold-400 px-5 text-xs font-bold uppercase tracking-wider text-obsidian shadow-lg hover:bg-gold-300"
                >
                    <IconPlus size={16} /> Create Coupon
                </button>
            }
        >
            <NotificationToast message={error} type="error" onClose={() => setError('')} />
            <NotificationToast message={successMsg} type="success" onClose={() => setSuccessMsg('')} />

            {/* Coupons Table */}
            <div className={`${box} overflow-x-auto`}>
                <table className="admin-responsive-table w-full min-w-[900px] text-left text-sm">
                    <thead className="border-b border-gold-500/20 text-[9px] uppercase tracking-[0.2em] text-gold-400 bg-obsidian/60">
                        <tr>
                            <th className="p-4">Coupon Code</th>
                            <th className="p-4">Discount</th>
                            <th className="p-4">Min Spend</th>
                            <th className="p-4">Redemptions</th>
                            <th className="p-4">Valid Period (IST)</th>
                            <th className="p-4 text-center">Status</th>
                            <th className="p-4 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gold-500/10">
                        {coupons.map((c) => {
                            const status = couponStatus(c, now);
                            const busy = busyCouponId === c.id;
                            return (
                                <tr key={c.id} className="transition-colors hover:bg-gold-400/[.03]">
                                    <td data-label="Coupon" className="p-4 font-mono text-base font-bold text-gold-300">{c.code}</td>
                                    <td data-label="Discount" className="p-4 font-semibold text-cream">
                                        {c.type === 'PERCENT' ? `${basisPointsToPercent(c.value)}% off` : `${rupees(c.value)} off`}
                                        {c.maximumDiscountPaise ? (
                                            <span className="block text-[11px] font-normal text-cream/50">Capped at {rupees(c.maximumDiscountPaise)}</span>
                                        ) : null}
                                    </td>
                                    <td data-label="Min spend" className="p-4 text-xs text-cream/50">
                                        {c.minimumSubtotalPaise ? rupees(c.minimumSubtotalPaise) : 'None'}
                                    </td>
                                    <td data-label="Redemptions" className="p-4 text-xs text-cream/70">
                                        {c.redemptionCount ?? 0} / {c.usageLimit ?? '∞'} used
                                        <span className="block text-[11px] text-cream/45">
                                            {c.perUserLimit ? `${c.perUserLimit} per customer` : 'No per-customer limit'}
                                        </span>
                                    </td>
                                    <td data-label="Valid period" className="p-4 text-xs text-cream/55">
                                        {istDateTimeLabel(c.startsAt)}
                                        <span className="block text-cream/40">→ {istDateTimeLabel(c.endsAt)}</span>
                                    </td>
                                    <td data-label="Status" className="p-4 text-center">
                                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${couponStatusStyles[status]}`}>
                                            {status}
                                        </span>
                                    </td>
                                    <td data-label="Actions" className="p-4 text-center">
                                        <div className="flex justify-center gap-2">
                                            <button
                                                onClick={() => openCouponModal(c)}
                                                disabled={busy}
                                                className="border border-gold-500/30 px-3 py-2 text-xs text-gold-300 hover:border-gold-400 disabled:opacity-40"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => void toggleCoupon(c)}
                                                disabled={busy}
                                                className="border border-gold-500/30 px-3 py-2 text-xs text-gold-300 hover:border-gold-400 disabled:cursor-wait disabled:opacity-40"
                                            >
                                                {busy ? 'Saving…' : c.isActive ? 'Deactivate' : 'Activate'}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {!coupons.length && <p className="p-10 text-center text-sm text-cream/40">No promotional coupon codes created yet.</p>}
            </div>

            {/* Create / Edit Coupon Modal */}
            {modal && (
                <AdminModalLayer>
                <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/85 p-5 backdrop-blur-sm">
                    <form
                        key={editing?.id ?? 'new'}
                        ref={couponDialogRef}
                        tabIndex={-1}
                        onSubmit={handleSaveCoupon}
                        className="max-h-[calc(100svh-2rem)] w-full max-w-lg overflow-y-auto border border-gold-500/30 bg-carbon p-6 rounded-sm shadow-2xl outline-none"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="coupon-dialog-title"
                    >
                        <div className="flex justify-between border-b border-gold-500/20 pb-4">
                            <h3 id="coupon-dialog-title" className="font-display text-2xl text-cream">
                                {editing ? `Edit ${editing.code}` : 'Create Promo Coupon'}
                            </h3>
                            <button type="button" onClick={() => setModal(null)} className="flex min-h-11 shrink-0 items-center gap-2 rounded-sm px-3 text-xs font-semibold text-cream/60 hover:bg-obsidian hover:text-cream" aria-label="Close coupon dialog">
                                <IconClose size={17} aria-hidden="true" /> Close
                            </button>
                        </div>
                        <div className="mt-5 grid gap-4 sm:grid-cols-2">
                            <label className="sm:col-span-2">
                                <span className="mb-1 block text-xs text-cream/70">Coupon Code</span>
                                <input
                                    name="code"
                                    placeholder="WELCOME10"
                                    defaultValue={editing?.code ?? ''}
                                    pattern={COUPON_CODE_PATTERN}
                                    maxLength={40}
                                    title="Letters, numbers, - and _ only. Saved in capitals."
                                    onBlur={(event) => { event.currentTarget.value = normalizeCouponCode(event.currentTarget.value); }}
                                    className={`${inputStyle} uppercase`}
                                    required
                                />
                                <span className="mt-1 block text-[11px] text-cream/45">Letters, numbers, - and _ only. Customers can type it in any case.</span>
                            </label>
                            <label>
                                <span className="mb-1 block text-xs text-cream/70">Discount Type</span>
                                <select
                                    name="type"
                                    value={discountType}
                                    onChange={(event) => setDiscountType(event.target.value === 'FIXED' ? 'FIXED' : 'PERCENT')}
                                    className={inputStyle}
                                >
                                    <option value="PERCENT">Percentage (%)</option>
                                    <option value="FIXED">Fixed Amount (₹)</option>
                                </select>
                            </label>
                            <label>
                                <span className="mb-1 block text-xs text-cream/70">
                                    {discountType === 'PERCENT' ? 'Discount (%) · 0.01 – 100' : 'Discount Amount (₹)'}
                                </span>
                                <input
                                    key={discountType}
                                    name="value"
                                    type="number"
                                    min="0.01"
                                    max={discountType === 'PERCENT' ? '100' : undefined}
                                    step="0.01"
                                    placeholder={discountType === 'PERCENT' ? 'e.g. 15 for 15% off' : 'e.g. 250 for ₹250 off'}
                                    defaultValue={valueDefault}
                                    className={inputStyle}
                                    required
                                />
                            </label>
                            <label>
                                <span className="mb-1 block text-xs text-cream/70">Minimum Order Subtotal (₹)</span>
                                <input
                                    name="minimumSubtotal"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    defaultValue={editing ? paiseToRupeesValue(editing.minimumSubtotalPaise) : '0'}
                                    className={inputStyle}
                                />
                            </label>
                            <label>
                                <span className="mb-1 block text-xs text-cream/70">Maximum Discount (₹)</span>
                                <input
                                    name="maximumDiscount"
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    placeholder="Optional — no cap"
                                    defaultValue={editing?.maximumDiscountPaise ? paiseToRupeesValue(editing.maximumDiscountPaise) : ''}
                                    className={inputStyle}
                                />
                                <span className="mt-1 block text-[11px] text-cream/45">Caps percentage discounts on large orders.</span>
                            </label>
                            <label>
                                <span className="mb-1 block text-xs text-cream/70">Total Usage Limit</span>
                                <input
                                    name="usageLimit"
                                    type="number"
                                    min="1"
                                    step="1"
                                    placeholder="Optional — unlimited"
                                    defaultValue={editing?.usageLimit ?? ''}
                                    className={inputStyle}
                                />
                            </label>
                            <label>
                                <span className="mb-1 block text-xs text-cream/70">Uses Per Customer</span>
                                <input
                                    name="perUserLimit"
                                    type="number"
                                    min="1"
                                    step="1"
                                    placeholder="Optional — unlimited"
                                    defaultValue={editing?.perUserLimit ?? ''}
                                    className={inputStyle}
                                />
                                <span className="mt-1 block text-[11px] text-cream/45">Setting this requires customers to sign in — guests can’t use the coupon.</span>
                            </label>
                            <label>
                                <span className="mb-1 block text-xs text-cream/70">Starts (IST, from 00:00)</span>
                                <input
                                    name="startsAt"
                                    type="date"
                                    defaultValue={istDateInputValue(editing?.startsAt ?? now)}
                                    className={inputStyle}
                                    required
                                />
                            </label>
                            <label>
                                <span className="mb-1 block text-xs text-cream/70">Ends (IST, through 23:59)</span>
                                <input
                                    name="endsAt"
                                    type="date"
                                    defaultValue={editing ? istDateInputValue(editing.endsAt) : istDateInputValue(now, 30)}
                                    className={inputStyle}
                                    required
                                />
                            </label>
                        </div>
                        <button
                            disabled={saving}
                            className="mt-6 h-12 w-full bg-gold-400 text-xs font-bold uppercase tracking-wider text-obsidian hover:bg-gold-300 disabled:cursor-wait disabled:opacity-50 rounded-sm"
                        >
                            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Publish Promo Code'}
                        </button>
                    </form>
                </div>
                </AdminModalLayer>
            )}
        </AdminShell>
    );
};

// ----------------------------------------------------
// 6. AUDIT LOGS & SYSTEM SECURITY (NEW)
// ----------------------------------------------------
const AUDIT_PAGE_SIZE = 50;

/** Start or end of a calendar day (from a date input) in the browser's time zone, as ISO. */
const dayBoundaryIso = (value: string, endOfDay = false): string =>
    new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`).toISOString();

interface AuditFilterDraft {
    actorId: string;
    entityType: string;
    action: string;
    from: string;
    to: string;
}

const emptyAuditFilters: AuditFilterDraft = { actorId: '', entityType: '', action: '', from: '', to: '' };

const auditQuery = (filters: AuditFilterDraft, cursor?: string): AuditLogFilters => ({
    limit: AUDIT_PAGE_SIZE,
    cursor,
    actorId: filters.actorId || undefined,
    entityType: filters.entityType || undefined,
    action: filters.action.trim() || undefined,
    from: filters.from ? dayBoundaryIso(filters.from) : undefined,
    to: filters.to ? dayBoundaryIso(filters.to, true) : undefined,
});

const AuditLogsAdmin = () => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const [staff, setStaff] = useState<StaffUser[]>([]);
    const [draft, setDraft] = useState<AuditFilterDraft>(emptyAuditFilters);
    const [filters, setFilters] = useState<AuditFilterDraft>(emptyAuditFilters);
    const [reloadKey, setReloadKey] = useState(0);
    const staffById = useMemo(() => new Map(staff.map((member) => [member.id, member])), [staff]);
    const filtered = Object.values(filters).some(Boolean);

    useEffect(() => {
        // Staff names fill the actor filter and label role changes recorded before emails were stored.
        api.staffUsers().then(setStaff).catch(() => undefined);
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');
        api.auditLogs(auditQuery(filters), controller.signal)
            .then((page) => {
                setLogs(page.items);
                setNextCursor(page.nextCursor);
            })
            .catch((caught) => {
                if (controller.signal.aborted) return;
                setLogs([]);
                setNextCursor(null);
                setError(caught instanceof Error ? caught.message : 'Unable to load audit logs.');
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [filters, reloadKey]);

    const loadMore = async () => {
        if (!nextCursor || loadingMore) return;
        setLoadingMore(true);
        try {
            const page = await api.auditLogs(auditQuery(filters, nextCursor));
            setLogs((current) => [...current, ...page.items]);
            setNextCursor(page.nextCursor);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Unable to load more activity.');
        } finally {
            setLoadingMore(false);
        }
    };

    const applyFilters = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (draft.from && draft.to && draft.from > draft.to) {
            setError('The start date must be on or before the end date.');
            return;
        }
        setFilters({ ...draft, action: draft.action.trim() });
    };

    const resetFilters = () => {
        setDraft(emptyAuditFilters);
        setFilters(emptyAuditFilters);
    };

    const recordLabel = (log: AuditLog): string => {
        if (log.entityType === 'user' && !log.metadata?.entityLabel && log.entityId) {
            const member = staffById.get(log.entityId);
            if (member) return member.fullName ? `${member.fullName} · ${member.email}` : member.email;
        }
        return auditEntityLabel(log);
    };

    return (
        <AdminShell
            title="Activity log"
            description="Review staff actions, sign-ins, affected records and access details across the admin workspace."
            action={
                <button type="button" onClick={() => setReloadKey((key) => key + 1)} disabled={loading} className="button-secondary gap-2">
                    <IconRefresh size={15} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            }
        >
            <NotificationToast message={error} type="error" onClose={() => setError('')} />

            <form onSubmit={applyFilters} className={`${box} mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_0.8fr_0.8fr_auto] lg:items-end`} aria-label="Filter activity">
                <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-[#555b54]">Staff member</span>
                    <select value={draft.actorId} onChange={(event) => setDraft({ ...draft, actorId: event.target.value })} className={inputStyle}>
                        <option value="">Everyone</option>
                        {staff.map((member) => (
                            <option key={member.id} value={member.id}>{member.fullName ? `${member.fullName} (${member.email})` : member.email}</option>
                        ))}
                    </select>
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-[#555b54]">Record type</span>
                    <select value={draft.entityType} onChange={(event) => setDraft({ ...draft, entityType: event.target.value })} className={inputStyle}>
                        <option value="">All records</option>
                        {auditEntityTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-[#555b54]">Action contains</span>
                    <input value={draft.action} onChange={(event) => setDraft({ ...draft, action: event.target.value })} placeholder="e.g. role, refund, signed_in" maxLength={80} className={inputStyle} />
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-[#555b54]">From</span>
                    <input type="date" value={draft.from} max={draft.to || undefined} onChange={(event) => setDraft({ ...draft, from: event.target.value })} className={inputStyle} />
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-[#555b54]">To</span>
                    <input type="date" value={draft.to} min={draft.from || undefined} onChange={(event) => setDraft({ ...draft, to: event.target.value })} className={inputStyle} />
                </label>
                <div className="flex gap-2">
                    <button type="submit" className="button-primary h-12 gap-2"><IconFilter size={15} /> Apply</button>
                    {filtered && <button type="button" onClick={resetFilters} className="button-secondary h-12">Clear</button>}
                </div>
            </form>

            <div className={`${box} overflow-x-auto`}>
                <table className="admin-responsive-table w-full min-w-[1100px] text-left text-xs">
                    <thead className="border-b border-gold-500/20 text-[9px] uppercase tracking-[0.2em] text-gold-400 bg-obsidian/60">
                        <tr>
                            <th className="p-4">When</th>
                            <th className="p-4">Staff</th>
                            <th className="p-4">Action and record</th>
                            <th className="p-4">What changed</th>
                            <th className="p-4">Source</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gold-500/10">
                        {!loading && logs.map((log) => {
                            const changes = auditChangeRows(log);
                            const facts = auditFactRows(log);
                            return (
                                <tr key={log.id} className="align-top transition-colors hover:bg-gold-400/[.03]">
                                    <td data-label="When" className="p-4 text-cream/55">
                                        <time dateTime={log.createdAt}>{new Date(log.createdAt).toLocaleString('en-IN')}</time>
                                    </td>
                                    <td data-label="Staff" className="p-4">
                                        <p className="font-medium text-cream">{log.actorLabel || (log.actorId ? 'Former staff member' : 'System')}</p>
                                        {log.actorId && <p className="mt-1 font-mono text-[10px] text-cream/35">{log.actorId}</p>}
                                    </td>
                                    <td data-label="Action" className="p-4">
                                        <p className="font-semibold text-gold-300">{auditActionLabel(log)}</p>
                                        <p className="mt-1 text-cream/75">{recordLabel(log)}</p>
                                        <p className="mt-1 font-mono text-[10px] text-cream/35">
                                            {log.entityType}{log.entityId ? ` · ${log.entityId}` : ''}
                                        </p>
                                    </td>
                                    <td data-label="Changes" className="p-4">
                                        {changes.length > 0 || facts.length > 0 ? (
                                            <div className="space-y-2.5">
                                                {changes.map((change) => (
                                                    <div key={change.field} className="grid gap-1.5 sm:grid-cols-[minmax(110px,0.45fr)_1fr] sm:gap-3">
                                                        <span className="text-cream/50">{change.field}</span>
                                                        <span className="text-cream/80">
                                                            <span className="text-cream/45 line-through decoration-cream/25">{change.before}</span>
                                                            <span className="px-2 text-gold-400" aria-hidden="true">→</span>
                                                            <span>{change.after}</span>
                                                        </span>
                                                    </div>
                                                ))}
                                                {facts.map((fact) => (
                                                    <p key={fact.field} className="text-cream/75">
                                                        <span className="text-cream/45">{fact.field}:</span> {fact.value}
                                                    </p>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-cream/35">No field details recorded</span>
                                        )}
                                    </td>
                                    <td data-label="Source" className="p-4 text-cream/55">
                                        <p>{log.ipAddress || 'Internal'}</p>
                                        {log.userAgent && <p className="mt-1 max-w-56 truncate text-[10px] text-cream/35" title={log.userAgent}>{log.userAgent}</p>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {loading ? (
                    <div className="flex items-center justify-center gap-3 p-10 text-sm text-cream/50" role="status">
                        <span className="size-2 animate-pulse rounded-full bg-[#d3912e]" /> Loading activity…
                    </div>
                ) : !logs.length ? (
                    <p className="p-10 text-center text-sm text-cream/40">
                        {error ? 'Activity could not be loaded.' : filtered ? 'No activity matches these filters.' : 'No audit log records found.'}
                    </p>
                ) : (
                    <div className="flex flex-col items-center gap-2 border-t border-gold-500/10 p-4 text-xs text-cream/45 sm:flex-row sm:justify-between">
                        <span>Showing {logs.length} {logs.length === 1 ? 'record' : 'records'}, newest first</span>
                        {nextCursor ? (
                            <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="button-secondary h-10 disabled:opacity-50">
                                {loadingMore ? 'Loading…' : 'Load older activity'}
                            </button>
                        ) : (
                            <span>End of activity</span>
                        )}
                    </div>
                )}
            </div>
        </AdminShell>
    );
};

// ----------------------------------------------------
// 7. OPERATIONS & INFRASTRUCTURE MONITORING
// ----------------------------------------------------
type SignalStatus = 'pass' | 'attention' | 'unknown';

const countSignal = (label: string, value: number): { label: string; value: string; status: SignalStatus } => ({
    label,
    value: metricValue(value),
    status: value < 0 ? 'unknown' : value === 0 ? 'pass' : 'attention',
});

const signalBadge: Record<SignalStatus, { text: string; className: string }> = {
    pass: { text: 'Pass', className: 'bg-emerald-950/30 text-emerald-300' },
    attention: { text: 'Attention', className: 'bg-amber-950/30 text-amber-300' },
    unknown: { text: 'Not checked', className: 'bg-red-950/30 text-red-300' },
};

const healthToneClass: Record<HealthTone, string> = {
    ok: 'text-emerald-400',
    warning: 'text-amber-400',
    critical: 'text-red-400',
};

const OperationsAdmin = () => {
    const [ops, setOps] = useState<OperationsSnapshot | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = async (fresh = false) => {
        setRefreshing(true);
        setError('');
        try {
            setOps(await api.operations({ fresh }));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Unable to load operations.');
        } finally {
            setRefreshing(false);
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const signals = ops
        ? [
              {
                  label: 'Database Engine',
                  value: ops.databaseHealthy ? 'Healthy' : 'Unreachable',
                  status: (ops.databaseHealthy ? 'pass' : 'attention') as SignalStatus,
              },
              countSignal('API Server Errors (since restart)', ops.apiServerErrorsTotal),
              countSignal('Failed Webhooks', ops.failedWebhooks),
              countSignal('Terminal Job Failures', ops.terminalJobFailures),
              countSignal('Expired Pending Payments', ops.expiredPendingPayments),
              countSignal('Payment Mismatches', ops.paymentMismatches),
              countSignal('Failed Refunds', ops.failedRefunds),
              countSignal('Low-stock SKUs Alert', ops.lowStockSkus),
          ]
        : [];
    const health = ops ? operationsHealth(ops) : null;

    return (
        <AdminShell
            title="System health"
            description="Monitor the database, API errors, webhooks and background processing."
            action={
                <button
                    onClick={() => void load(true)}
                    disabled={refreshing}
                    className="flex items-center gap-2 border border-gold-400 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-gold-300 hover:bg-gold-400 hover:text-obsidian"
                >
                    <IconRefresh size={16} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Checking Signals…' : 'Refresh Telemetry'}
                </button>
            }
        >
            {ops && <NotificationToast message={error} type="error" onClose={() => setError('')} />}

            {!ops && loading && (
                <div className={`${box} flex items-center justify-center gap-3 p-10 text-sm text-cream/50`} role="status">
                    <span className="size-2 animate-pulse rounded-full bg-[#d3912e]" /> Checking system health…
                </div>
            )}

            {!ops && !loading && (
                <div className={`${box} flex flex-col items-center gap-4 p-10 text-center`} role="alert">
                    <IconAlert size={26} className="text-red-400" />
                    <div>
                        <p className="text-sm font-semibold text-cream">System health could not be checked</p>
                        <p className="mt-1 text-xs text-cream/55">{error || 'The health service did not respond.'}</p>
                    </div>
                    <button type="button" onClick={() => void load(true)} disabled={refreshing} className="button-primary gap-2">
                        <IconRefresh size={15} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Retrying…' : 'Retry'}
                    </button>
                </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {signals.map((signal) => {
                    const badge = signalBadge[signal.status];
                    return (
                        <article key={signal.label} className={`${box} p-6 transition-colors hover:border-gold-500/40`}>
                            <div className="flex items-center justify-between">
                                <span className={signal.status === 'pass' ? 'text-emerald-400' : signal.status === 'attention' ? 'text-amber-400' : 'text-red-400'}>
                                    {signal.status === 'pass' ? <IconCheckCircle color="#10B981" size={22} /> : <IconAlert size={22} />}
                                </span>
                                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${badge.className}`}>{badge.text}</span>
                            </div>
                            <p className="mt-4 text-[10px] uppercase tracking-[0.2em] font-semibold text-cream/40">{signal.label}</p>
                            <strong className="mt-2 block font-display text-3xl text-cream">{signal.value}</strong>
                        </article>
                    );
                })}
            </div>

            {ops && health && (
                <div className="mt-6 flex flex-col gap-2 border-t border-gold-500/15 pt-4 text-xs text-cream/40 sm:flex-row sm:items-center sm:justify-between">
                    <span>Telemetry check timestamp: {new Date(ops.checkedAt).toLocaleString('en-IN')}</span>
                    <span className={healthToneClass[health.tone]} role="status">{health.label}</span>
                </div>
            )}
        </AdminShell>
    );
};

// ----------------------------------------------------
// 8. USER MANAGEMENT & ROLE ASSIGNMENT
// ----------------------------------------------------
type StaffRole = StaffUser['roles'][number];

const staffRoleOptions: Array<{
    value: StaffRole;
    label: string;
    summary: string;
    access: string;
}> = [
    {
        value: 'ADMIN',
        label: 'Administrator',
        summary: 'Full operational and security control.',
        access: 'All areas, team access, activity log and system health',
    },
    {
        value: 'CATALOGUE_MANAGER',
        label: 'Catalogue manager',
        summary: 'Owns products, categories and offers.',
        access: 'Catalogue, product media, categories and promotions',
    },
    {
        value: 'WAREHOUSE_MANAGER',
        label: 'Warehouse manager',
        summary: 'Keeps fulfilment and stock accurate.',
        access: 'Orders, inventory, warehouses and stock adjustments',
    },
    {
        value: 'SUPPORT_AGENT',
        label: 'Support agent',
        summary: 'Resolves customer order issues.',
        access: 'Orders, returns, refunds and invoice lookup',
    },
];

const roleLabel = (role: StaffRole) => staffRoleOptions.find((option) => option.value === role)?.label || role;

type StaffAccountAction = 'suspend' | 'reinstate' | 'reset';

const staffAccountPrompts: Record<StaffAccountAction, { title: (member: { name: string; email: string }) => string; detail: string; confirm: string; busy: string }> = {
    suspend: {
        title: ({ name }) => `Suspend ${name}?`,
        detail: 'They are signed out everywhere and cannot sign in until reinstated. Their roles stay in place for when they return.',
        confirm: 'Suspend account',
        busy: 'Suspending…',
    },
    reinstate: {
        title: ({ name }) => `Reinstate ${name}?`,
        detail: 'They can sign in again with their existing password and roles.',
        confirm: 'Reinstate account',
        busy: 'Reinstating…',
    },
    reset: {
        title: ({ email }) => `Email a password reset link to ${email}?`,
        detail: 'They choose a new password from the link in the email. Their current password keeps working until they do.',
        confirm: 'Send reset email',
        busy: 'Sending…',
    },
};

const StaffRoleEditor = ({
    user,
    currentUserId,
    onSaved,
    onCancel,
    onError,
    onAccountChanged,
}: {
    user: StaffUser;
    currentUserId?: string;
    onSaved: (success: boolean) => Promise<void>;
    onCancel: () => void;
    onError: (message: string) => void;
    onAccountChanged: (message: string) => Promise<void>;
}) => {
    const [selectedRoles, setSelectedRoles] = useState<StaffRole[]>(user.roles);
    const [saving, setSaving] = useState(false);
    const [confirmingRemoval, setConfirmingRemoval] = useState(false);
    const [accountAction, setAccountAction] = useState<StaffAccountAction | null>(null);
    const [accountBusy, setAccountBusy] = useState(false);
    const isSelf = user.id === currentUserId;
    const memberName = user.fullName || user.email;
    const removingAllAccess = selectedRoles.length === 0;
    const changed = staffRoleOptions.some(({ value }) => selectedRoles.includes(value) !== user.roles.includes(value));

    useEffect(() => {
        setSelectedRoles(user.roles);
    }, [user.roles.join('|')]);

    const toggleRole = (role: StaffRole) => {
        setConfirmingRemoval(false);
        setSelectedRoles((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role]);
    };

    const save = async () => {
        // Removing every role strands the account (it has no customer role either), so ask first.
        if (removingAllAccess && !confirmingRemoval) {
            setConfirmingRemoval(true);
            return;
        }
        setSaving(true);
        onError('');
        const rolesToAdd = selectedRoles.filter((role) => !user.roles.includes(role));
        const rolesToRemove = user.roles.filter((role) => !selectedRoles.includes(role));
        try {
            // Grant replacement access before revoking anything so a failed request cannot lock a member out unexpectedly.
            for (const role of rolesToAdd) await api.assignRole(user.id, role);
            for (const role of rolesToRemove) await api.removeRole(user.id, role);
            await onSaved(true);
        } catch (caught) {
            onError(caught instanceof Error ? caught.message : 'Access changes could not be saved.');
            await onSaved(false);
        } finally {
            setSaving(false);
        }
    };

    const runAccountAction = async (action: StaffAccountAction) => {
        setAccountBusy(true);
        onError('');
        try {
            if (action === 'suspend') await api.suspendStaffUser(user.id);
            else if (action === 'reinstate') await api.reinstateStaffUser(user.id);
            else await api.sendStaffPasswordReset(user.id);
            setAccountAction(null);
            await onAccountChanged(
                action === 'suspend'
                    ? `${memberName} is suspended and has been signed out.`
                    : action === 'reinstate'
                        ? `${memberName} can sign in again.`
                        : `Password reset email sent to ${user.email}.`,
            );
        } catch (caught) {
            onError(caught instanceof Error ? caught.message : 'The account change could not be completed.');
        } finally {
            setAccountBusy(false);
        }
    };

    const accountPrompt = accountAction && staffAccountPrompts[accountAction];

    return (
        <div className="border-t border-[#e8e5dc] bg-[#fbfaf7] px-4 py-5 sm:px-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <fieldset className="min-w-0 flex-1">
                    <legend className="text-sm font-semibold text-[#252925]">Access for {user.fullName || user.email}</legend>
                    <p className="mt-1 text-xs leading-5 text-[#747971]">A team member can hold more than one role. Changes take effect on their next authorized request.</p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        {staffRoleOptions.map((option) => {
                            const checked = selectedRoles.includes(option.value);
                            const locked = isSelf && option.value === 'ADMIN';
                            return (
                                <label
                                    key={option.value}
                                    className={`flex min-h-20 items-start gap-3 rounded-xl border p-3 transition-colors ${checked ? 'border-[#d49a42] bg-[#fff8e9]' : 'border-[#dedbd2] bg-white hover:border-[#c9c5bb]'} ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={locked || saving || accountBusy}
                                        onChange={() => toggleRole(option.value)}
                                        className="mt-0.5 size-4 accent-[#b87820]"
                                    />
                                    <span>
                                        <span className="block text-xs font-semibold text-[#343934]">{option.label}</span>
                                        <span className="mt-1 block text-[11px] leading-4 text-[#777c75]">{locked ? 'Your own admin access is protected.' : option.summary}</span>
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                    {removingAllAccess && !confirmingRemoval && <p className="mt-3 text-xs font-medium text-[#a44c36]">Saving with no roles will remove this account from the staff workspace.</p>}
                </fieldset>
                {confirmingRemoval ? (
                    <div className="max-w-md rounded-xl border border-[#e3b8a9] bg-[#fff4f0] p-4" role="alertdialog" aria-labelledby={`remove-access-${user.id}`}>
                        <p id={`remove-access-${user.id}`} className="text-sm font-semibold text-[#7c2f1d]">Remove all access for {user.fullName || user.email}?</p>
                        <p className="mt-1 text-xs leading-5 text-[#8f4a37]">They will lose the admin workspace on their next request and leave the team directory. To restore access later, use Invite team member → Existing account.</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" onClick={() => setConfirmingRemoval(false)} disabled={saving} className="button-secondary">Keep editing</button>
                            <button type="button" onClick={() => void save()} disabled={saving} className="button-primary !bg-[#a44c36] disabled:opacity-45">
                                {saving ? 'Removing…' : 'Remove all access'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex shrink-0 items-center gap-2">
                        <button type="button" onClick={onCancel} disabled={saving} className="button-secondary">Cancel</button>
                        <button type="button" onClick={() => void save()} disabled={!changed || saving || accountBusy} className="button-primary disabled:cursor-not-allowed disabled:opacity-45">
                            {saving ? 'Saving…' : removingAllAccess ? 'Remove access…' : 'Save access'}
                        </button>
                    </div>
                )}
            </div>
            <div className="mt-5 flex flex-col gap-4 border-t border-[#e8e5dc] pt-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#252925]">Account</p>
                    <p className="mt-1 max-w-xl text-xs leading-5 text-[#747971]">
                        {user.suspended
                            ? 'Suspended: this person cannot sign in until the account is reinstated. Their roles are kept.'
                            : 'Send a password reset link, or suspend sign-in without removing any roles.'}
                    </p>
                </div>
                {accountAction && accountPrompt ? (
                    <div className={`max-w-md rounded-xl border p-4 ${accountAction === 'suspend' ? 'border-[#e3b8a9] bg-[#fff4f0]' : 'border-[#dedbd2] bg-white'}`} role="alertdialog" aria-labelledby={`account-action-${user.id}`}>
                        <p id={`account-action-${user.id}`} className={`text-sm font-semibold ${accountAction === 'suspend' ? 'text-[#7c2f1d]' : 'text-[#252925]'}`}>{accountPrompt.title({ name: memberName, email: user.email })}</p>
                        <p className={`mt-1 text-xs leading-5 ${accountAction === 'suspend' ? 'text-[#8f4a37]' : 'text-[#747971]'}`}>{accountPrompt.detail}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" onClick={() => setAccountAction(null)} disabled={accountBusy} className="button-secondary">Keep as is</button>
                            <button
                                type="button"
                                onClick={() => void runAccountAction(accountAction)}
                                disabled={accountBusy}
                                className={`button-primary disabled:opacity-45 ${accountAction === 'suspend' ? '!bg-[#a44c36]' : ''}`}
                            >
                                {accountBusy ? accountPrompt.busy : accountPrompt.confirm}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setAccountAction('reset')}
                            disabled={saving || accountBusy || Boolean(user.suspended)}
                            title={user.suspended ? 'Reinstate the account before sending a password reset' : undefined}
                            className="button-secondary disabled:cursor-not-allowed disabled:opacity-45"
                        >
                            Send password reset
                        </button>
                        {user.suspended ? (
                            <button type="button" onClick={() => setAccountAction('reinstate')} disabled={saving || accountBusy} className="button-secondary disabled:opacity-45">
                                Reinstate account
                            </button>
                        ) : isSelf ? (
                            <span className="text-[11px] text-[#777c75]">You cannot suspend your own account.</span>
                        ) : (
                            <button type="button" onClick={() => setAccountAction('suspend')} disabled={saving || accountBusy} className="button-secondary !text-[#a44c36] disabled:opacity-45">
                                Suspend account
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const UsersAdmin = () => {
    const [email, setEmail] = useState('');
    const [fullName, setFullName] = useState('');
    const [role, setRole] = useState<StaffRole>('SUPPORT_AGENT');
    const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
    const [createdUser, setCreatedUser] = useState<CreatedStaffUser | null>(null);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [inviteOpen, setInviteOpen] = useState(false);
    const [inviteMode, setInviteMode] = useState<'new' | 'existing'>('new');
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState<'ALL' | StaffRole>('ALL');
    const [passwordCopied, setPasswordCopied] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const { session } = useAuth();

    const load = async () => {
        try {
            const users = await api.staffUsers();
            setStaffUsers(users);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Unable to load staff accounts.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const handleCreateStaffUser = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        setSuccessMsg('');
        setCreatedUser(null);

        try {
            if (inviteMode === 'existing') {
                const granted = await api.grantStaffAccess({ email: email.trim(), role });
                setSuccessMsg(`${granted.email} now has ${roleLabel(role)} access and signs in with their existing password.`);
            } else {
                const created = await api.createStaffUser({
                    email: email.trim(),
                    role,
                    ...(fullName.trim() ? { fullName: fullName.trim() } : {}),
                });
                setCreatedUser(created);
                setSuccessMsg(`${created.user.email} can now sign in with the generated temporary password.`);
                setPasswordCopied(false);
            }
            setEmail('');
            setFullName('');
            setRole('SUPPORT_AGENT');
            setInviteOpen(false);
            await load();
        } catch (caught) {
            // The email already has an account: offer to grant access to it instead.
            if (caught instanceof ApiError && caught.status === 409 && inviteMode === 'new') setInviteMode('existing');
            setError(caught instanceof Error ? caught.message : 'Staff account creation failed.');
        } finally {
            setSaving(false);
        }
    };

    const normalizedSearch = search.trim().toLowerCase();
    const visibleUsers = staffUsers.filter((user) => {
        const matchesSearch = !normalizedSearch || `${user.fullName || ''} ${user.email}`.toLowerCase().includes(normalizedSearch);
        const matchesRole = roleFilter === 'ALL' || user.roles.includes(roleFilter);
        return matchesSearch && matchesRole;
    });
    const administratorCount = staffUsers.filter((user) => user.roles.includes('ADMIN') && !user.suspended).length;
    const suspendedCount = staffUsers.filter((user) => user.suspended).length;

    const copyTemporaryPassword = async () => {
        if (!createdUser) return;
        try {
            if (!navigator.clipboard) throw new Error('Clipboard access is unavailable');
            await navigator.clipboard.writeText(createdUser.temporaryPassword);
            setPasswordCopied(true);
        } catch {
            setError('The password could not be copied. Select it and copy it manually.');
        }
    };

    return (
        <AdminShell
            title="Team & roles"
            description="Invite staff and keep access aligned with each person’s responsibilities."
            action={(
                <button type="button" onClick={() => setInviteOpen((open) => !open)} className={inviteOpen ? 'button-secondary gap-2' : 'button-primary gap-2'}>
                    {inviteOpen ? <IconClose size={16} /> : <IconPlus size={16} />}
                    {inviteOpen ? 'Close invite' : 'Invite team member'}
                </button>
            )}
        >
            <NotificationToast message={error} type="error" onClose={() => setError('')} />
            <NotificationToast message={successMsg} type="success" onClose={() => setSuccessMsg('')} />

            <div className="mb-7 grid grid-cols-1 border-y border-[#dedbd2] bg-white min-[420px]:grid-cols-3">
                <div className="border-b border-[#e5e2da] px-4 py-4 min-[420px]:border-b-0 min-[420px]:border-r min-[420px]:px-3 sm:px-5">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#8a8e88] sm:text-[10px] sm:tracking-[0.13em]">Team members</p>
                    <p className="mt-1 text-2xl font-bold tracking-[-0.03em] text-[#252925]">{loading ? '—' : staffUsers.length}</p>
                </div>
                <div className="border-b border-[#e5e2da] px-4 py-4 min-[420px]:border-b-0 min-[420px]:border-r min-[420px]:px-3 sm:px-5">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#8a8e88] sm:text-[10px] sm:tracking-[0.13em]">Active administrators</p>
                    <p className="mt-1 text-2xl font-bold tracking-[-0.03em] text-[#252925]">{loading ? '—' : administratorCount}</p>
                    {!loading && suspendedCount > 0 && <p className="mt-0.5 text-[11px] font-medium text-[#a44c36]">{suspendedCount} suspended {suspendedCount === 1 ? 'account' : 'accounts'}</p>}
                </div>
                <div className="px-4 py-4 min-[420px]:px-3 sm:px-5">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#8a8e88] sm:text-[10px] sm:tracking-[0.13em]">Access model</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-[#343934] sm:text-sm">4 role-based levels</p>
                </div>
            </div>

            {inviteOpen && (
                <form onSubmit={handleCreateStaffUser} className={`${box} mb-7 overflow-hidden`} aria-labelledby="invite-team-title">
                    <div className="flex flex-col gap-4 border-b border-[#e5e2da] px-5 py-5 sm:px-6 md:flex-row md:items-start md:justify-between">
                        <div>
                            <h2 id="invite-team-title" className="text-lg font-bold text-[#252925]">Invite a team member</h2>
                            <p className="mt-1 max-w-xl text-xs leading-5 text-[#747971]">
                                {inviteMode === 'new'
                                    ? 'We create the account now and show its temporary password once.'
                                    : 'Give staff access to an account that already exists. They keep their password; a customer account becomes staff-only.'}
                            </p>
                        </div>
                        <div className="inline-flex shrink-0 rounded-xl border border-[#dedbd2] bg-[#f8f7f3] p-1" role="radiogroup" aria-label="Account type">
                            {([['new', 'New account'], ['existing', 'Existing account']] as const).map(([mode, label]) => (
                                <button
                                    key={mode}
                                    type="button"
                                    role="radio"
                                    aria-checked={inviteMode === mode}
                                    onClick={() => setInviteMode(mode)}
                                    className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${inviteMode === mode ? 'bg-white text-[#252925] shadow-sm' : 'text-[#6b7069] hover:text-[#252925]'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className={`grid gap-5 p-5 sm:grid-cols-2 sm:p-6 xl:items-end ${inviteMode === 'new' ? 'xl:grid-cols-[1fr_1fr_1.2fr_auto]' : 'xl:grid-cols-[1.4fr_1.2fr_auto]'}`}>
                        {inviteMode === 'new' && (
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-semibold text-[#555b54]">Full name <span className="font-normal text-[#8b8f89]">(optional)</span></span>
                                <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Sana Khan" className={inputStyle} />
                            </label>
                        )}
                        <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold text-[#555b54]">Work email</span>
                            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sana@example.com" className={inputStyle} required />
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold text-[#555b54]">Initial role</span>
                            <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className={inputStyle}>
                                {staffRoleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </label>
                        <button disabled={saving} className="button-primary h-12 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50">
                            {inviteMode === 'existing' ? (saving ? 'Granting…' : 'Grant access') : saving ? 'Creating…' : 'Create account'}
                        </button>
                    </div>
                </form>
            )}

            {createdUser && (
                <section className="mb-7 rounded-2xl border border-emerald-500/35 bg-emerald-950/20 p-5 sm:p-6" aria-labelledby="temporary-password-title">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-300">Account ready</p>
                            <h2 id="temporary-password-title" className="mt-1 text-lg font-bold text-[#252925]">Copy the temporary password now</h2>
                            <p className="mt-1 text-xs text-cream/70">Send it securely to {createdUser.user.email}. It disappears when you leave this page.</p>
                        </div>
                        <button type="button" onClick={() => setCreatedUser(null)} className="grid size-10 place-items-center rounded-lg text-[#697069] hover:bg-white/60 hover:text-[#252925]" aria-label="Dismiss temporary password"><IconClose size={17} /></button>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                        <code className="max-w-full overflow-x-auto rounded-lg border border-emerald-500/30 bg-white px-4 py-3 font-mono text-sm tracking-wide text-emerald-200 sm:text-base">{createdUser.temporaryPassword}</code>
                        <button
                            type="button"
                            onClick={() => void copyTemporaryPassword()}
                            className="button-secondary"
                        >
                            {passwordCopied ? 'Copied' : 'Copy password'}
                        </button>
                    </div>
                </section>
            )}

            <section className="mb-7" aria-labelledby="role-guide-title">
                <div className="mb-4">
                    <h2 id="role-guide-title" className="text-base font-bold text-[#252925]">Role guide</h2>
                    <p className="mt-1 text-xs text-[#747971]">Use the narrowest access that covers the person’s day-to-day work.</p>
                </div>
                <div className="admin-role-scroll flex snap-x snap-mandatory overflow-x-auto rounded-2xl border border-[#dedbd2] bg-white md:grid md:grid-cols-2 md:overflow-hidden xl:grid-cols-4">
                    {staffRoleOptions.map((option, index) => (
                        <div
                            key={option.value}
                            className={`w-[78vw] max-w-[290px] shrink-0 snap-start border-r border-[#e8e5dc] p-5 last:border-r-0 md:w-auto md:max-w-none ${index === 1 ? 'md:border-r-0 xl:border-r' : ''} ${index === 2 ? 'md:border-t md:border-r xl:border-t-0' : ''} ${index === 3 ? 'md:border-t md:border-r-0 xl:border-t-0' : ''}`}
                        >
                            <div className="flex items-center gap-2">
                                <span className="grid size-7 place-items-center rounded-lg bg-[#fff3da] text-[#9b671d]"><IconShield size={14} /></span>
                                <h3 className="text-sm font-semibold text-[#303530]">{option.label}</h3>
                            </div>
                            <p className="mt-3 text-xs leading-5 text-[#747971]">{option.access}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className={`${box} overflow-hidden`} aria-labelledby="staff-accounts-title">
                <div className="flex flex-col gap-4 border-b border-[#e5e2da] p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <h2 id="staff-accounts-title" className="text-base font-bold text-[#252925]">Team directory</h2>
                        <p className="mt-1 text-xs text-[#747971]">Only accounts with staff access are shown.</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <label className="relative block">
                            <span className="sr-only">Search team members</span>
                            <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8b8f89]" />
                            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" className="admin-field h-11 w-full !pl-9 text-xs sm:w-56" />
                        </label>
                        <label>
                            <span className="sr-only">Filter by role</span>
                            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as 'ALL' | StaffRole)} className="admin-field h-11 w-full text-xs sm:w-48">
                                <option value="ALL">All roles</option>
                                {staffRoleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </label>
                        <button type="button" onClick={() => void load()} className="button-secondary h-11 gap-2" aria-label="Refresh team directory"><IconRefresh size={15} /> Refresh</button>
                    </div>
                </div>

                <div className="hidden grid-cols-[minmax(220px,1.2fr)_minmax(200px,1fr)_minmax(260px,1.4fr)_120px_112px] gap-4 border-b border-[#e8e5dc] bg-[#f8f7f3] px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#858a83] lg:grid">
                    <span>Team member</span><span>Email</span><span>Access</span><span>Joined</span><span className="text-right">Action</span>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center gap-3 px-6 py-14 text-sm text-[#747971]" role="status"><span className="size-2 animate-pulse rounded-full bg-[#d3912e]" /> Loading team…</div>
                ) : visibleUsers.length ? (
                    <ul className="divide-y divide-[#ece9e2]">
                        {visibleUsers.map((user) => {
                            const isEditing = editingUserId === user.id;
                            const initials = (user.fullName || user.email).split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
                            return (
                                <li key={user.id}>
                                    <div className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(220px,1.2fr)_minmax(200px,1fr)_minmax(260px,1.4fr)_120px_112px] lg:items-center">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-xs font-bold ${user.roles.includes('ADMIN') ? 'bg-[#fff0ce] text-[#8d5a15]' : 'bg-[#eceee9] text-[#596059]'}`}>{initials}</span>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-[#303530]">{user.fullName || 'Unnamed staff member'}</p>
                                                {user.id === session?.user?.id && <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9b671d]">You</p>}
                                                {user.suspended && (
                                                    <span className="mt-1 inline-flex rounded-md border border-[#e3b8a9] bg-[#fff4f0] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#a44c36]">Suspended</span>
                                                )}
                                            </div>
                                        </div>
                                        <p className="break-all text-xs text-[#626861]"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#969a94] lg:hidden">Email</span>{user.email}</p>
                                        <div>
                                            <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#969a94] lg:hidden">Access</span>
                                            <div className="flex flex-wrap gap-1.5">{user.roles.map((item) => <span key={item} className="rounded-md border border-[#dfd8c9] bg-[#fffaf0] px-2 py-1 text-[10px] font-semibold text-[#82581b]">{roleLabel(item)}</span>)}</div>
                                        </div>
                                        <p className="text-xs text-[#737871]"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#969a94] lg:hidden">Joined</span>{shortDate(user.createdAt)}</p>
                                        <button type="button" onClick={() => setEditingUserId(isEditing ? null : user.id)} className={`h-10 justify-center text-xs ${isEditing ? 'button-primary' : 'button-secondary'}`} aria-expanded={isEditing}>
                                            {isEditing ? 'Editing' : 'Edit access'}
                                        </button>
                                    </div>
                                    {isEditing && (
                                        <StaffRoleEditor
                                            user={user}
                                            currentUserId={session?.user?.id}
                                            onCancel={() => setEditingUserId(null)}
                                            onError={setError}
                                            onAccountChanged={async (message) => {
                                                setSuccessMsg(message);
                                                await load();
                                            }}
                                            onSaved={async (success) => {
                                                await load();
                                                if (success) {
                                                    setEditingUserId(null);
                                                    setSuccessMsg(`Access updated for ${user.fullName || user.email}.`);
                                                }
                                            }}
                                        />
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <div className="px-6 py-14 text-center">
                        <p className="text-sm font-semibold text-[#434943]">{staffUsers.length ? 'No matching team members' : 'No staff accounts yet'}</p>
                        <p className="mt-1 text-xs text-[#7a7f78]">{staffUsers.length ? 'Try a different search or role filter.' : 'Invite the first person to start building your team.'}</p>
                    </div>
                )}
            </section>
        </AdminShell>
    );
};

// ----------------------------------------------------
// MAIN ROUTER CONTAINER
// ----------------------------------------------------
const AdminStatusScreen = ({ children }: { children: React.ReactNode }) => (
    <div className="grid min-h-screen place-items-center bg-[#f5f3ed] px-6 text-[#343934]">{children}</div>
);

/** The backend could not be reached to check the session: the person may well still be signed in. */
const AdminSessionUnavailable = ({ message, onRetry }: { message: string; onRetry: () => Promise<void> }) => {
    const [retrying, setRetrying] = useState(false);
    const retry = async () => {
        setRetrying(true);
        try {
            await onRetry();
        } finally {
            setRetrying(false);
        }
    };

    useEffect(() => {
        // Keep trying quietly while the backend starts up.
        const timer = window.setInterval(() => void onRetry(), 15_000);
        return () => window.clearInterval(timer);
    }, [onRetry]);

    return (
        <AdminStatusScreen>
            <div className="max-w-md text-center" role="alert">
                <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl border border-[#ddd8cd] bg-white text-[#9b671d]"><IconAlert size={22} /></span>
                <h1 className="text-xl font-bold text-[#252925]">We can’t reach the store service</h1>
                <p className="mt-2 text-sm leading-6 text-[#6b7069]">{message} You have not been signed out; we will keep retrying.</p>
                <button type="button" onClick={() => void retry()} disabled={retrying} className="button-primary mt-5 gap-2 disabled:opacity-60">
                    <IconRefresh size={15} className={retrying ? 'animate-spin' : ''} /> {retrying ? 'Retrying…' : 'Retry now'}
                </button>
            </div>
        </AdminStatusScreen>
    );
};

const AdminNotFound = ({ homePath }: { homePath: string }) => (
    <AdminShell title="Page not found" description="This admin page does not exist or has moved.">
        <div className={`${box} flex flex-col items-center gap-4 p-10 text-center`}>
            <p className="text-sm text-[#6b7069]">Check the address, or pick a section from the navigation.</p>
            <Link to={homePath} className="button-primary">Go to your workspace</Link>
        </div>
    </AdminShell>
);

const AdminPage = () => {
    const { signedIn, isInitializing, session, sessionError, retrySession } = useAuth();
    const { pathname: path, search } = useLocation();

    if (isInitializing) {
        return (
            <AdminStatusScreen>
                <div className="flex items-center gap-3 text-sm font-semibold" role="status">
                    <span className="size-2 animate-pulse rounded-full bg-[#d3912e]" /> Preparing your workspace…
                </div>
            </AdminStatusScreen>
        );
    }
    if (!signedIn && sessionError) return <AdminSessionUnavailable message={sessionError} onRetry={retrySession} />;
    if (!signedIn) {
        const next = encodeURIComponent(`${path}${search}`);
        return <Redirect to={`/admin/login?next=${next}${sessionHasExpired() ? '&reason=expired' : ''}`} />;
    }
    const roles = session?.roles || [];
    const homePath = defaultAdminPath(roles);
    if (!homePath) return <Redirect to="/account" />;
    const entry = matchAdminSection(path);
    if (!entry) return <AdminNotFound homePath={homePath} />;
    if (!entry.roles.some((role) => roles.includes(role))) return <Redirect to={homePath} />;

    switch (entry.section) {
        case 'orders': return <OrdersAdmin />;
        case 'catalogue': return <CatalogueAdmin />;
        case 'inventory': return <InventoryAdmin />;
        case 'promotions': return <PromotionsAdmin />;
        case 'users': return <UsersAdmin />;
        case 'audit-logs': return <AuditLogsAdmin />;
        case 'operations': return <OperationsAdmin />;
        default: return <Overview />;
    }
};

export default AdminPage;
