'use client';

import React, { useEffect, useState } from 'react';
import { Link, useParams } from '../lib/router';
import Header from '../components/Header';
import { IconCheckCircle, IconPackage, IconTruck } from '../components/Icons';
import StoreFooter from '../components/StoreFooter';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { shortDate, titleCase } from '../lib/commerce';
import { Order, Shipment } from '../types';

export const ShipmentTrackingPage = () => {
    const { trackingNumber } = useParams<{ trackingNumber?: string }>();
    const { signedIn } = useAuth();
    const [order, setOrder] = useState<Order | null>(null);
    const [shipments, setShipments] = useState<Shipment[]>([]);
    const [loading, setLoading] = useState(Boolean(trackingNumber && signedIn));
    const [error, setError] = useState('');

    useEffect(() => {
        if (!trackingNumber || !signedIn) return;
        setLoading(true);
        api.orders()
            .then(async (orders) => {
                const match = orders.find((item) => item.orderNumber.toUpperCase() === trackingNumber.toUpperCase() || item.id === trackingNumber);
                if (!match) throw new Error('No order matching this reference was found in your account.');
                setOrder(match);
                setShipments(await api.shipments(match.id));
            })
            .catch((caught) => setError(caught instanceof Error ? caught.message : 'Tracking is unavailable.'))
            .finally(() => setLoading(false));
    }, [signedIn, trackingNumber]);

    return (
        <div className="relative flex min-h-screen flex-col justify-between overflow-hidden bg-obsidian font-body text-cream">
            {/* Ambient Background Glow Orbs */}
            <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-96 w-96 -translate-x-1/2 rounded-full bg-gold-400/10 blur-[130px]" />

            <Header />
            <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-8 lg:py-16">
                <header className="glass-panel mb-8 rounded-3xl p-8">
                    <p className="eyebrow text-gold-400">Order Tracking</p>
                    <h1 className="mt-2 font-display text-4xl font-semibold sm:text-5xl">Package journey</h1>
                    {trackingNumber && (
                        <p className="glass-pill mt-3 inline-block border-white/10 bg-white/[0.04] px-3.5 py-1 font-mono text-xs text-cream/60">
                            Reference: <span className="text-gold-300 font-bold">{trackingNumber}</span>
                        </p>
                    )}
                </header>

                {!signedIn ? (
                    <section className="glass-panel rounded-3xl p-8 text-center sm:p-12">
                        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl border border-gold-400/30 bg-gold-400/10 text-gold-400 shadow-[0_0_20px_rgba(201,163,91,0.15)]">
                            <IconPackage size={30} />
                        </div>
                        <h2 className="mt-2 font-display text-3xl font-semibold">Sign in to view live tracking</h2>
                        <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-cream/55">Shipment events contain private order information and are available from the account that placed the order.</p>
                        <Link to="/auth" className="button-primary mt-7 inline-block">Sign in</Link>
                    </section>
                ) : !trackingNumber ? (
                    <section className="glass-panel rounded-3xl p-8 text-center sm:p-12">
                        <h2 className="font-display text-3xl font-semibold">Choose an order from your account</h2>
                        <p className="mt-3 text-xs leading-relaxed text-cream/55">Open order history to see shipping details and tracking events.</p>
                        <Link to="/account/orders" className="button-primary mt-7 inline-block">View orders</Link>
                    </section>
                ) : loading ? (
                    <div className="glass-panel rounded-3xl p-12 text-center text-xs text-cream/45" role="status">Loading shipment events…</div>
                ) : error ? (
                    <div className="rounded-3xl border border-red-500/30 bg-red-950/20 p-6 text-xs text-red-200 backdrop-blur-xl" role="alert">{error}</div>
                ) : shipments.length === 0 ? (
                    <section className="glass-panel rounded-3xl p-8 text-center sm:p-12">
                        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl border border-gold-400/30 bg-gold-400/10 text-gold-400 shadow-[0_0_20px_rgba(201,163,91,0.15)]">
                            <IconPackage size={30} />
                        </div>
                        <h2 className="mt-2 font-display text-3xl font-semibold">Preparing for dispatch</h2>
                        <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-cream/55">Your order {order?.orderNumber} is confirmed. Tracking will appear here after a shipment is created.</p>
                    </section>
                ) : (
                    <div className="space-y-6">
                        {shipments.map((shipment) => (
                            <section key={shipment.id} className="glass-card rounded-3xl p-6 sm:p-8">
                                <header className="flex flex-col justify-between gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end">
                                    <div>
                                        <p className="eyebrow text-gold-400">{shipment.carrier || shipment.provider}</p>
                                        <h2 className="mt-1 font-display text-3xl font-semibold text-cream">{titleCase(shipment.status)}</h2>
                                        <p className="mt-1 font-mono text-xs text-cream/40">{shipment.trackingNumber || 'Tracking number pending'}</p>
                                    </div>
                                    <span className="glass-pill border-gold-400/30 bg-gold-400/10 px-3 py-1 text-xs font-semibold text-gold-300">
                                        <IconTruck size={16} className="inline mr-1.5" /> {shipment.items.reduce((sum, item) => sum + item.quantity, 0)} item(s)
                                    </span>
                                </header>
                                <ol className="mt-7 space-y-0">
                                    {shipment.events.length ? shipment.events.map((event, index) => (
                                        <li key={event.id} className="grid grid-cols-[36px_1fr] gap-4">
                                            <div className="flex flex-col items-center">
                                                <span className="grid size-9 place-items-center rounded-2xl border border-gold-400/40 bg-gold-400/10 text-gold-300 shadow-[0_0_15px_rgba(201,163,91,0.15)]">
                                                    <IconCheckCircle size={15} color="#c9a35b" />
                                                </span>
                                                {index < shipment.events.length - 1 && <span className="h-12 w-px bg-gold-400/20" />}
                                            </div>
                                            <div className="pb-6">
                                                <p className="text-sm font-semibold text-cream">{event.message || titleCase(event.status)}</p>
                                                <p className="mt-1 text-xs text-cream/40">{shortDate(event.occurredAt)}{event.location ? ` · ${event.location}` : ''}</p>
                                            </div>
                                        </li>
                                    )) : (
                                        <li className="text-xs text-cream/45">The carrier has not posted an event yet.</li>
                                    )}
                                </ol>
                            </section>
                        ))}
                    </div>
                )}
            </main>
            <StoreFooter />
        </div>
    );
};

export default ShipmentTrackingPage;
