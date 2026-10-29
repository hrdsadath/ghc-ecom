'use client';

import React, { FormEvent, useState } from 'react';
import { Link } from '../lib/router';
import Header from '../components/Header';
import { IconArrowRight, IconSearch } from '../components/Icons';
import StoreFooter from '../components/StoreFooter';
import TrustBadges from '../components/TrustBadges';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { rupees, shortDate, titleCase } from '../lib/commerce';
import { Order } from '../types';

export const OrderLookupPage = () => {
    const { signedIn } = useAuth();
    const [orderNumber, setOrderNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<Order | null>(null);
    const [error, setError] = useState('');

    const handleLookup = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);
        setError('');
        setResult(null);
        try {
            const orders = await api.orders();
            const reference = orderNumber.trim().toUpperCase();
            const found = orders.find((order) => order.orderNumber.toUpperCase() === reference || order.id === orderNumber.trim());
            if (!found) setError('No order matching that reference was found in your account.');
            else setResult(found);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Order lookup failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col justify-between bg-obsidian font-body text-cream">
            <Header />
            <main id="main-content" className="mx-auto w-full max-w-xl flex-1 px-4 py-8 sm:px-8 lg:py-14">
                {/* Header Pavilion */}
                <header className="glass-panel relative mb-8 overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-10">
                    <div className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-gold-400/10 blur-3xl" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold-400/80">
                        Order Assistance
                    </span>
                    <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">Track Your Order</h1>
                    <p className="mt-3 text-xs sm:text-sm leading-relaxed text-cream/65">
                        Locate order history, tracking updates, and delivery status using the reference from your confirmation email.
                    </p>
                </header>

                {!signedIn ? (
                    <section className="glass-panel rounded-3xl border border-white/10 p-8 text-center sm:p-10">
                        <h2 className="font-display text-2xl font-semibold">Sign In Required</h2>
                        <p className="mt-3 text-xs sm:text-sm leading-relaxed text-cream/60">
                            Order details are protected and only accessible to verified accounts for security.
                        </p>
                        <Link to="/auth" className="button-primary mx-auto mt-6 rounded-xl py-3 px-6 text-sm">
                            Sign In to Account
                        </Link>
                    </section>
                ) : (
                    <section className="glass-panel rounded-3xl border border-white/10 p-7 sm:p-9 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
                        <form onSubmit={handleLookup} className="space-y-4">
                            <label className="block" htmlFor="order-reference">
                                <span className="mb-2 block text-xs font-semibold text-cream/70">Order Reference / ID</span>
                                <input
                                    id="order-reference"
                                    value={orderNumber}
                                    onChange={(event) => setOrderNumber(event.target.value)}
                                    placeholder="e.g. GLK-1002"
                                    className="field h-12 w-full rounded-xl text-sm border-white/10 bg-white/5"
                                    required
                                />
                            </label>
                            {error && (
                                <p className="glass-panel rounded-xl border border-red-500/30 p-3 text-xs text-red-200" role="alert">
                                    {error}
                                </p>
                            )}
                            <button
                                disabled={loading}
                                className="button-primary flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold shadow-[0_8px_30px_rgba(212,175,55,0.25)] disabled:opacity-50"
                            >
                                <IconSearch size={16} /> {loading ? 'Searching…' : 'Locate Order'}
                            </button>
                        </form>

                        {result && (
                            <div className="glass-card mt-8 rounded-2xl border border-white/10 p-5" aria-live="polite">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-400">Order ID</span>
                                        <h2 className="mt-0.5 font-display text-2xl font-semibold text-cream">{result.orderNumber}</h2>
                                    </div>
                                    <span className="glass-pill rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gold-300">
                                        {titleCase(result.status)}
                                    </span>
                                </div>
                                <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-white/10 pt-4 text-xs">
                                    <div>
                                        <dt className="text-cream/50">Date Placed</dt>
                                        <dd className="mt-0.5 font-medium text-cream">{shortDate(result.createdAt)}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-cream/50">Total Amount</dt>
                                        <dd className="mt-0.5 font-semibold text-gold-200 tabular-nums">{rupees(result.totalPaise)}</dd>
                                    </div>
                                </dl>
                                <Link
                                    to={`/account/orders/${result.id}`}
                                    className="glass-pill mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-semibold text-gold-300 hover:text-white transition"
                                >
                                    View Full Order Details <IconArrowRight size={14} />
                                </Link>
                            </div>
                        )}
                    </section>
                )}
            </main>

            <TrustBadges />
            <StoreFooter />
        </div>
    );
};

export default OrderLookupPage;
