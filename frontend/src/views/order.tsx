'use client';

import React, { useEffect, useState } from 'react';
import { Link, Redirect, useParams } from '../lib/router';
import AccountShell from '../components/AccountShell';
import { IconDownload, IconMapPin } from '../components/Icons';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { fallbackImage, rupees, shortDate, titleCase } from '../lib/commerce';
import { openTrustedUrlFrom } from '../lib/navigation';
import { Order, Shipment } from '../types';

const OrderDetailPage = () => {
    const { signedIn, isInitializing } = useAuth();
    const { orderId } = useParams<{ orderId: string }>();
    const [order, setOrder] = useState<Order | null>(null);
    const [error, setError] = useState('');
    const [shipments, setShipments] = useState<Shipment[]>([]);
    const [working, setWorking] = useState(false);

    useEffect(() => {
        if (signedIn) {
            Promise.all([api.order(orderId), api.shipments(orderId)])
                .then(([nextOrder, nextShipments]) => { setOrder(nextOrder); setShipments(nextShipments); })
                .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load order.'));
        }
    }, [orderId, signedIn]);

    if (isInitializing) return null;
    if (!signedIn) return <Redirect to="/auth" />;

    const download = async () => {
        try {
            await openTrustedUrlFrom(() => api.invoice(orderId).then((result) => result.url));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Invoice is not ready.');
        }
    };

    const cancel = async () => {
        if (!window.confirm('Cancel this order? Inventory will be released and this cannot be undone.')) return;
        setWorking(true);
        setError('');
        try { setOrder(await api.cancelOrder(orderId)); }
        catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to cancel order.'); }
        finally { setWorking(false); }
    };

    const requestReturn = async () => {
        const reason = window.prompt('Tell us why you would like to return this order:')?.trim();
        if (!reason) return;
        setWorking(true);
        setError('');
        try {
            await api.createReturn(orderId, reason);
            setError('Return request submitted. Support will review it shortly.');
        } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to request a return.'); }
        finally { setWorking(false); }
    };

    return (
        <AccountShell
            title={order?.orderNumber || 'Order Detail'}
            intro={order ? `Placed ${shortDate(order.createdAt)} · Status: ${titleCase(order.status)}` : 'Loading your order details from backend.'}
        >
            {error && <p className="mb-5 rounded-2xl border border-red-500/30 bg-red-950/20 p-4 text-xs text-red-200 backdrop-blur-xl">{error}</p>}
            {order && (
                <>
                    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
                        <section className="glass-card rounded-3xl p-6 md:p-8">
                            <div className="flex items-center justify-between border-b border-white/10 pb-4">
                                <span className="glass-pill border-gold-400/30 bg-gold-400/10 px-3.5 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-gold-300">
                                    {titleCase(order.status)}
                                </span>
                                {order.invoice && (
                                    <button onClick={() => void download()} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gold-300 transition hover:text-gold-200">
                                        <IconDownload size={15} /> Download Invoice
                                    </button>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-3 border-b border-white/10 py-4">
                                {['PAYMENT_PENDING', 'CONFIRMED'].includes(order.status) && (
                                    <button disabled={working} onClick={() => void cancel()} className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-2 text-xs font-bold uppercase text-red-200 transition hover:bg-red-950/40 disabled:opacity-50">Cancel order</button>
                                )}
                                {['SHIPPED', 'DELIVERED'].includes(order.status) && (
                                    <button disabled={working} onClick={() => void requestReturn()} className="rounded-xl border border-gold-400/30 bg-gold-400/10 px-4 py-2 text-xs font-bold uppercase text-gold-200 transition hover:bg-gold-400/20 disabled:opacity-50">Request return</button>
                                )}
                                {shipments.map((shipment) => (
                                    <Link key={shipment.id} to={`/tracking/${order.orderNumber}`} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold uppercase text-gold-300 transition hover:border-gold-400/40 hover:bg-gold-400/10">
                                        Track {shipment.trackingNumber || 'shipment'}
                                    </Link>
                                ))}
                            </div>

                            <div className="my-4 divide-y divide-white/10">
                                {order.itemsSnapshot.map((item) => (
                                    <article key={item.id || item.variantId} className="grid grid-cols-[72px_1fr_auto] items-center gap-5 py-5">
                                        <img
                                            loading="lazy"
                                            decoding="async"
                                            src={item.imageUrl || fallbackImage}
                                            alt=""
                                            className="aspect-square w-full rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 object-contain"
                                        />
                                        <div>
                                            <h2 className="font-display text-xl font-bold text-cream">{item.productName}</h2>
                                            <p className="mt-1 text-xs text-cream/45">{item.quantity} × {item.optionLabel || item.color || item.sku}</p>
                                        </div>
                                        <strong className="font-display text-lg font-bold text-gold-300">{rupees(item.lineTotalPaise)}</strong>
                                    </article>
                                ))}
                            </div>
                        </section>

                        <aside className="glass-panel h-fit rounded-3xl p-6 md:p-8">
                            <div className="flex items-center gap-2 border-b border-white/10 pb-4 text-gold-400">
                                <IconMapPin size={18} />
                                <h2 className="font-display text-xl font-bold text-cream">Order Contact</h2>
                            </div>
                            <p className="mt-4 text-xs leading-relaxed text-cream/65">
                                <strong className="block font-semibold text-cream text-sm">{order.addressSnapshot.recipientName}</strong>
                                {order.addressSnapshot.line1}<br />
                                {order.addressSnapshot.city}, {order.addressSnapshot.state} {order.addressSnapshot.postalCode}<br />
                                <span className="mt-1 inline-block text-gold-300 font-medium">Phone: {order.addressSnapshot.phone}</span>
                            </p>

                            <dl className="mt-6 space-y-3 border-t border-white/10 pt-5 text-xs">
                                <div className="flex justify-between text-cream/55">
                                    <dt>Subtotal</dt>
                                    <dd className="font-mono">{rupees(order.subtotalPaise)}</dd>
                                </div>
                                <div className="flex justify-between text-cream/55">
                                    <dt>GST Tax</dt>
                                    <dd className="font-mono">{rupees(order.taxPaise)}</dd>
                                </div>
                                <div className="flex justify-between border-t border-white/10 pt-3 text-gold-300">
                                    <dt className="font-display text-base font-bold">Total Paid</dt>
                                    <dd className="font-display text-2xl font-bold">{rupees(order.totalPaise)}</dd>
                                </div>
                            </dl>
                        </aside>
                    </div>

                    <Link className="mt-8 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gold-300 transition hover:text-gold-200" to="/account/orders">
                        ← Back to order history
                    </Link>
                </>
            )}
        </AccountShell>
    );
};

export default OrderDetailPage;
