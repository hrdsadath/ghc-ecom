'use client';

import React, { useEffect, useState } from 'react';
import { Link, useParams } from '../lib/router';
import Header from '../components/Header';
import StoreFooter from '../components/StoreFooter';
import { IconCheckCircle, IconDownload } from '../components/Icons';
import { api } from '../lib/api';
import { rupees, shortDate } from '../lib/commerce';
import { openTrustedUrlFrom } from '../lib/navigation';
import { Order } from '../types';

export const OrderConfirmationPage = () => {
    const { orderId } = useParams<{ orderId: string }>();
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!orderId) return;
        api.order(orderId)
            .then(setOrder)
            .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to fetch order confirmation.'))
            .finally(() => setLoading(false));
    }, [orderId]);

    const handleDownloadInvoice = async () => {
        if (!order) return;
        try {
            await openTrustedUrlFrom(() => api.invoice(order.id).then((res) => res?.url));
        } catch {
            alert('Tax invoice is generating. Please check again shortly.');
        }
    };

    return (
        <div className="relative flex min-h-screen flex-col justify-between overflow-hidden bg-obsidian font-body text-cream">
            {/* Ambient Background Glow Orbs */}
            <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[120px]" />
            <div className="pointer-events-none absolute top-1/3 -right-20 -z-10 h-96 w-96 rounded-full bg-gold-400/10 blur-[130px]" />

            <Header />
            <main id="main-content" className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-8 lg:py-16">
                {loading ? (
                    <div className="py-20 text-center font-mono text-xs text-cream/40">Loading order confirmation details…</div>
                ) : error || !order ? (
                    <div className="glass-panel rounded-3xl border-red-500/30 bg-red-950/20 p-8 text-center sm:p-12">
                        <h2 className="font-display text-2xl text-red-200">Confirmation Unavailable</h2>
                        <p className="mt-2 text-xs text-cream/60">{error || 'Order detail not found.'}</p>
                        <Link to="/" className="button-primary mt-6 inline-block">Return to Store</Link>
                    </div>
                ) : (
                    <div className="space-y-8 animate-fadeIn">
                        {/* Hero Banner */}
                        <div className="glass-panel-elevated relative overflow-hidden rounded-3xl p-8 text-center sm:p-12">
                            <div className="mx-auto flex size-20 items-center justify-center rounded-3xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                                <IconCheckCircle size={40} color="#10B981" />
                            </div>
                            <span className="glass-pill mt-6 inline-block border-gold-400/30 bg-gold-400/10 px-3.5 py-1 text-[10px] font-bold uppercase tracking-[0.28em] text-gold-400">
                                Payment Verified &amp; Confirmed
                            </span>
                            <h1 className="mt-3 font-display text-4xl font-semibold text-cream sm:text-5xl">Thank you for your order</h1>
                            <p className="mx-auto mt-3 max-w-lg text-xs leading-relaxed text-cream/65">
                                Order <strong className="font-mono text-sm text-gold-300">{order.orderNumber}</strong> has been received and is being prepared with artisanal care.
                            </p>
                        </div>

                        {/* Order Snapshot & Details */}
                        <div className="grid gap-6 md:grid-cols-2">
                            <div className="glass-card rounded-3xl p-6 md:p-8">
                                <h3 className="border-b border-white/10 pb-3 font-display text-xl font-bold text-gold-300">Order Details</h3>
                                <div className="mt-4 space-y-2.5 text-xs text-cream/70">
                                    <p className="flex justify-between">
                                        <span className="text-cream/50">Reference:</span>
                                        <span className="font-mono font-bold text-cream">{order.orderNumber}</span>
                                    </p>
                                    <p className="flex justify-between">
                                        <span className="text-cream/50">Placed Date:</span>
                                        <span className="text-cream">{shortDate(order.createdAt)}</span>
                                    </p>
                                    <p className="flex justify-between">
                                        <span className="text-cream/50">Payment Status:</span>
                                        <span className="font-bold text-emerald-400">VERIFIED</span>
                                    </p>
                                    <p className="flex items-baseline justify-between pt-2 border-t border-white/10">
                                        <span className="text-cream/50">Total Amount:</span>
                                        <span className="font-display text-xl font-bold text-gold-300">{rupees(order.totalPaise)}</span>
                                    </p>
                                </div>
                                <button
                                    onClick={handleDownloadInvoice}
                                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-gold-400/30 bg-gold-400/10 py-3 text-xs font-bold uppercase tracking-wider text-gold-300 transition hover:border-gold-400/60 hover:bg-gold-400/20 hover:text-gold-200"
                                >
                                    <IconDownload size={16} /> Download Tax Invoice
                                </button>
                            </div>

                            <div className="glass-card rounded-3xl p-6 md:p-8">
                                <h3 className="border-b border-white/10 pb-3 font-display text-xl font-bold text-gold-300">Delivery Address</h3>
                                <div className="mt-4 space-y-2 text-xs leading-relaxed text-cream/70">
                                    <p className="font-bold text-cream text-sm">{order.addressSnapshot?.recipientName}</p>
                                    <p className="text-cream/60">{order.addressSnapshot?.line1}</p>
                                    {order.addressSnapshot?.line2 && <p className="text-cream/60">{order.addressSnapshot.line2}</p>}
                                    <p className="text-cream/60">{order.addressSnapshot?.city}, {order.addressSnapshot?.state} {order.addressSnapshot?.postalCode}</p>
                                    <p className="pt-2 text-gold-300">Phone: {order.addressSnapshot?.phone}</p>
                                </div>
                            </div>
                        </div>

                        {/* Items Snapshot */}
                        <div className="glass-card rounded-3xl p-6 md:p-8">
                            <h3 className="mb-4 font-display text-xl font-semibold text-cream">Items in this order</h3>
                            <div className="divide-y divide-white/10">
                                {(order.itemsSnapshot || []).map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between py-4 text-xs">
                                        <div>
                                            <p className="font-bold text-cream">{item.productName}</p>
                                            <p className="mt-0.5 font-mono text-[10px] text-cream/40">SKU: {item.sku} · Qty: {item.quantity}</p>
                                        </div>
                                        <span className="font-mono font-bold text-gold-300">{rupees(item.lineTotalPaise)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </main>
            <StoreFooter />
        </div>
    );
};

export default OrderConfirmationPage;
