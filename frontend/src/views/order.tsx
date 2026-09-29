'use client';

import React, { useEffect, useState } from 'react';
import { Link, Redirect, useParams } from '../lib/router';
import AccountShell from '../components/AccountShell';
import { IconDownload, IconMapPin } from '../components/Icons';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { fallbackImage, rupees, shortDate, titleCase } from '../lib/commerce';
import { openTrustedUrl } from '../lib/navigation';
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
            const result = await api.invoice(orderId);
            if (!openTrustedUrl(result.url)) throw new Error('Invoice URL was rejected');
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
            {error && <p className="mb-5 rounded-sm border border-red-500/30 bg-red-950/20 p-4 text-xs text-red-200">{error}</p>}
            {order && (
                <>
                    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                        <section className="rounded-sm border border-gold-500/20 bg-carbon p-6 shadow-xl">
                            <div className="flex items-center justify-between border-b border-gold-500/15 pb-4">
                                <span className="rounded-sm border border-gold-400/40 bg-gold-400/10 px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.24em] text-gold-300">
                                    {titleCase(order.status)}
                                </span>
                                {order.invoice && (
                                    <button onClick={() => void download()} className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gold-300 hover:text-gold-200 transition">
                                        <IconDownload size={15} /> Download Invoice
                                    </button>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-3 border-b border-gold-500/15 py-4">
                                {['PAYMENT_PENDING', 'CONFIRMED'].includes(order.status) && (
                                    <button disabled={working} onClick={() => void cancel()} className="border border-red-500/40 px-4 py-2 text-xs font-bold uppercase text-red-200 disabled:opacity-50">Cancel order</button>
                                )}
                                {order.status === 'DELIVERED' && (
                                    <button disabled={working} onClick={() => void requestReturn()} className="border border-gold-500/40 px-4 py-2 text-xs font-bold uppercase text-gold-200 disabled:opacity-50">Request return</button>
                                )}
                                {shipments.map((shipment) => (
                                    <Link key={shipment.id} to={`/tracking/${order.orderNumber}`} className="border border-gold-500/30 px-4 py-2 text-xs font-bold uppercase text-gold-300">
                                        Track {shipment.trackingNumber || 'shipment'}
                                    </Link>
                                ))}
                            </div>

                            <div className="divide-y divide-gold-500/15 my-4">
                                {order.itemsSnapshot.map((item) => (
                                    <article key={item.id || item.variantId} className="grid grid-cols-[72px_1fr_auto] items-center gap-5 py-5">
                                        <img
                                            loading="lazy"
                                            decoding="async"
                                            src={item.imageUrl || fallbackImage}
                                            alt=""
                                            className="aspect-square w-full object-contain rounded-sm border border-gold-500/20 bg-obsidian"
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

                        <aside className="rounded-sm border border-gold-500/20 bg-carbon p-6 shadow-xl h-fit">
                            <div className="flex items-center gap-2 text-gold-400 border-b border-gold-500/15 pb-3">
                                <IconMapPin size={18} />
                                <h2 className="font-display text-xl font-bold text-cream">Order Contact</h2>
                            </div>
                            <p className="mt-4 text-xs leading-relaxed text-cream/65">
                                <strong className="block text-cream font-semibold">{order.addressSnapshot.recipientName}</strong>
                                {order.addressSnapshot.line1}<br />
                                {order.addressSnapshot.city}, {order.addressSnapshot.state} {order.addressSnapshot.postalCode}<br />
                                Phone: {order.addressSnapshot.phone}
                            </p>

                            <dl className="mt-6 space-y-3 border-t border-gold-500/15 pt-5 text-xs">
                                <div className="flex justify-between text-cream/55">
                                    <dt>Subtotal</dt>
                                    <dd className="font-mono">{rupees(order.subtotalPaise)}</dd>
                                </div>
                                <div className="flex justify-between text-cream/55">
                                    <dt>GST Tax</dt>
                                    <dd className="font-mono">{rupees(order.taxPaise)}</dd>
                                </div>
                                <div className="flex justify-between pt-3 border-t border-gold-500/15 text-gold-300">
                                    <dt className="font-display text-base font-bold">Total Paid</dt>
                                    <dd className="font-display text-2xl font-bold">{rupees(order.totalPaise)}</dd>
                                </div>
                            </dl>
                        </aside>
                    </div>

                    <Link className="mt-8 inline-block text-xs uppercase tracking-wider font-semibold text-gold-300 hover:underline" to="/account/orders">
                        Back to order history
                    </Link>
                </>
            )}
        </AccountShell>
    );
};

export default OrderDetailPage;
