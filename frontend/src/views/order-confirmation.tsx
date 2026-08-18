'use client';

import React, { useEffect, useState } from 'react';
import { Link, useParams } from '../lib/router';
import Header from '../components/Header';
import SEOHead from '../components/SEOHead';
import StoreFooter from '../components/StoreFooter';
import { IconCheckCircle, IconDownload } from '../components/Icons';
import { api } from '../lib/api';
import { rupees, shortDate } from '../lib/commerce';
import { openTrustedUrl } from '../lib/navigation';
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
            const res = await api.invoice(order.id);
            if (res?.url && !openTrustedUrl(res.url)) throw new Error('Invoice URL was rejected');
        } catch {
            alert('Tax invoice is generating. Please check again shortly.');
        }
    };

    return (
        <div className="min-h-screen bg-obsidian text-cream flex flex-col justify-between font-body">
            <SEOHead title="Order Confirmed | Glockery" noIndex />
            <Header />
            <main id="main-content" className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-8 lg:py-16">
                {loading ? (
                    <div className="text-center py-20 text-cream/40 font-mono text-xs">Loading order confirmation details…</div>
                ) : error || !order ? (
                    <div className="border border-red-500/30 bg-red-950/20 p-8 text-center rounded-sm">
                        <h2 className="font-display text-2xl text-red-200">Confirmation Unavailable</h2>
                        <p className="mt-2 text-xs text-cream/60">{error || 'Order detail not found.'}</p>
                        <Link to="/" className="mt-6 inline-block bg-gold-400 px-6 py-2.5 text-xs font-bold text-obsidian uppercase rounded-sm">Return to Store</Link>
                    </div>
                ) : (
                    <div className="space-y-8 animate-fadeIn">
                        {/* Banner */}
                        <div className="border border-line bg-carbon p-8 text-center sm:p-12">
                            <div className="mx-auto flex size-16 items-center justify-center border border-emerald-500/40 bg-emerald-950/50 text-emerald-400">
                                <IconCheckCircle size={36} color="#10B981" />
                            </div>
                            <span className="mt-5 block text-[10px] font-bold uppercase tracking-[0.3em] text-gold-400">
                                Payment Verified &amp; Confirmed
                            </span>
                            <h1 className="mt-2 font-display text-4xl font-semibold text-cream sm:text-5xl">Thank you for your order</h1>
                            <p className="mt-3 text-xs text-cream/65 leading-relaxed max-w-lg mx-auto">
                                Order <strong className="text-sm text-gold-300">{order.orderNumber}</strong> has been received. Keep this confirmation for your records.
                            </p>
                        </div>

                        {/* Order Snapshot & Timeline */}
                        <div className="grid gap-6 md:grid-cols-2">
                            <div className="border border-gold-500/20 bg-carbon p-6 rounded-sm shadow-lg">
                                <h3 className="font-display text-xl font-bold text-gold-300 border-b border-gold-500/15 pb-3">Order Details</h3>
                                <div className="mt-4 space-y-2 text-xs text-cream/70">
                                    <p><strong>Order Reference:</strong> <span className="font-mono text-cream">{order.orderNumber}</span></p>
                                    <p><strong>Placed Date:</strong> {shortDate(order.createdAt)}</p>
                                    <p><strong>Payment Status:</strong> <span className="text-emerald-400 font-bold">VERIFIED</span></p>
                                    <p><strong>Total Amount:</strong> <span className="font-display font-bold text-lg text-gold-300">{rupees(order.totalPaise)}</span></p>
                                </div>
                                <button
                                    onClick={handleDownloadInvoice}
                                    className="mt-6 flex items-center gap-2 rounded-sm border border-gold-500/30 bg-obsidian px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gold-300 hover:border-gold-400 hover:bg-gold-400 hover:text-obsidian transition w-full justify-center shadow-sm"
                                >
                                    <IconDownload size={16} /> Download Tax Invoice
                                </button>
                            </div>

                            <div className="border border-gold-500/20 bg-carbon p-6 rounded-sm shadow-lg">
                                <h3 className="font-display text-xl font-bold text-gold-300 border-b border-gold-500/15 pb-3">Order Contact</h3>
                                <div className="mt-4 space-y-2 text-xs text-cream/70">
                                    <p><strong>Name:</strong> {order.addressSnapshot?.recipientName}</p>
                                    <p><strong>Email:</strong> {order.addressSnapshot?.email}</p>
                                    <p><strong>Phone:</strong> {order.addressSnapshot?.phone}</p>
                                    <p><strong>Address:</strong> {order.addressSnapshot?.line1}, {order.addressSnapshot?.city}, {order.addressSnapshot?.state} {order.addressSnapshot?.postalCode}</p>
                                </div>
                            </div>
                        </div>

                        {/* Items Snapshot */}
                        <div className="border border-gold-500/20 bg-carbon p-6 rounded-sm shadow-lg">
                            <h3 className="mb-4 font-display text-xl font-semibold text-cream">Items in this order</h3>
                            <div className="divide-y divide-gold-500/10">
                                {(order.itemsSnapshot || []).map((item, idx) => (
                                    <div key={idx} className="py-3.5 flex items-center justify-between text-xs">
                                        <div>
                                            <p className="font-bold text-cream">{item.productName}</p>
                                            <p className="text-[10px] text-cream/40 font-mono">SKU: {item.sku} · Qty: {item.quantity}</p>
                                        </div>
                                        <span className="font-bold text-gold-300 font-mono">{rupees(item.lineTotalPaise)}</span>
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
