'use client';

import React, { useEffect, useState } from 'react';
import { Link, useParams } from '../lib/router';
import Header from '../components/Header';
import { IconCheckCircle, IconPackage, IconTruck } from '../components/Icons';
import SEOHead from '../components/SEOHead';
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
        <div className="flex min-h-screen flex-col justify-between bg-obsidian font-body text-cream">
            <SEOHead title="Track an order | Glockery" noIndex />
            <Header />
            <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-8 lg:py-16">
                <header className="mb-9 border-y border-line py-8">
                    <p className="eyebrow">Order tracking</p>
                    <h1 className="mt-2 font-display text-4xl font-semibold sm:text-5xl">Package journey</h1>
                    {trackingNumber && <p className="mt-3 text-xs tabular-nums text-cream/45">Reference: {trackingNumber}</p>}
                </header>

                {!signedIn ? (
                    <section className="surface p-8 text-center sm:p-12">
                        <IconPackage size={30} className="mx-auto text-gold-400" />
                        <h2 className="mt-5 font-display text-3xl font-semibold">Sign in to view live tracking</h2>
                        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-cream/50">Shipment events contain private order information and are available from the account that placed the order.</p>
                        <Link to="/auth" className="button-primary mt-7">Sign in</Link>
                    </section>
                ) : !trackingNumber ? (
                    <section className="surface p-8 text-center sm:p-12">
                        <h2 className="font-display text-3xl font-semibold">Choose an order from your account</h2>
                        <p className="mt-3 text-sm text-cream/50">Open order history to see shipping details and tracking events.</p>
                        <Link to="/account/orders" className="button-primary mt-7">View orders</Link>
                    </section>
                ) : loading ? (
                    <div className="surface p-12 text-center text-sm text-cream/45" role="status">Loading shipment events…</div>
                ) : error ? (
                    <div className="border border-red-500/30 bg-red-950/20 p-6 text-sm text-red-200" role="alert">{error}</div>
                ) : shipments.length === 0 ? (
                    <section className="surface p-8 text-center sm:p-12">
                        <IconPackage size={30} className="mx-auto text-gold-400" />
                        <h2 className="mt-5 font-display text-3xl font-semibold">Preparing for dispatch</h2>
                        <p className="mt-3 text-sm text-cream/50">Your order {order?.orderNumber} is confirmed. Tracking will appear here after a shipment is created.</p>
                    </section>
                ) : (
                    <div className="space-y-6">
                        {shipments.map((shipment) => (
                            <section key={shipment.id} className="surface p-6 sm:p-8">
                                <header className="flex flex-col justify-between gap-4 border-b border-line pb-5 sm:flex-row sm:items-end">
                                    <div>
                                        <p className="eyebrow">{shipment.carrier || shipment.provider}</p>
                                        <h2 className="mt-1 font-display text-3xl font-semibold">{titleCase(shipment.status)}</h2>
                                        <p className="mt-1 text-xs tabular-nums text-cream/40">{shipment.trackingNumber || 'Tracking number pending'}</p>
                                    </div>
                                    <span className="flex items-center gap-2 text-xs font-semibold text-gold-200"><IconTruck size={17} /> {shipment.items.reduce((sum, item) => sum + item.quantity, 0)} item(s)</span>
                                </header>
                                <ol className="mt-7 space-y-0">
                                    {shipment.events.length ? shipment.events.map((event, index) => (
                                        <li key={event.id} className="grid grid-cols-[32px_1fr] gap-4">
                                            <div className="flex flex-col items-center">
                                                <span className="grid size-8 place-items-center border border-gold-500/40 text-gold-300"><IconCheckCircle size={14} color="#c9a35b" /></span>
                                                {index < shipment.events.length - 1 && <span className="h-12 w-px bg-line" />}
                                            </div>
                                            <div className="pb-6">
                                                <p className="text-sm font-semibold text-cream">{event.message || titleCase(event.status)}</p>
                                                <p className="mt-1 text-xs text-cream/40">{shortDate(event.occurredAt)}{event.location ? ` · ${event.location}` : ''}</p>
                                            </div>
                                        </li>
                                    )) : (
                                        <li className="text-sm text-cream/45">The carrier has not posted an event yet.</li>
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
