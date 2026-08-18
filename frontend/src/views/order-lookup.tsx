'use client';

import React, { FormEvent, useState } from 'react';
import { Link } from '../lib/router';
import Header from '../components/Header';
import { IconArrowRight, IconSearch } from '../components/Icons';
import SEOHead from '../components/SEOHead';
import StoreFooter from '../components/StoreFooter';
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
            <SEOHead title="Find an order | Glockery" noIndex />
            <Header />
            <main id="main-content" className="mx-auto w-full max-w-xl flex-1 px-4 py-12 sm:px-8 lg:py-16">
                <header className="mb-8 border-y border-line py-8">
                    <p className="eyebrow">Order help</p>
                    <h1 className="mt-2 font-display text-4xl font-semibold sm:text-5xl">Find an order</h1>
                    <p className="mt-3 text-sm leading-6 text-cream/50">Search order history using the reference from your confirmation email.</p>
                </header>

                {!signedIn ? (
                    <section className="surface p-8 text-center sm:p-10">
                        <h2 className="font-display text-3xl font-semibold">Sign in to continue</h2>
                        <p className="mt-3 text-sm leading-6 text-cream/50">Order details are protected and only available to the account that placed the order.</p>
                        <Link to="/auth" className="button-primary mt-7">Sign in</Link>
                    </section>
                ) : (
                    <section className="surface p-7 sm:p-9">
                        <form onSubmit={handleLookup} className="space-y-4">
                            <label className="block" htmlFor="order-reference">
                                <span className="mb-2 block text-xs font-semibold text-cream/70">Order reference</span>
                                <input id="order-reference" value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} placeholder="e.g. GLK-1002" className="field h-12 w-full text-sm" required />
                            </label>
                            {error && <p className="border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-200" role="alert">{error}</p>}
                            <button disabled={loading} className="button-primary w-full gap-2 disabled:opacity-50"><IconSearch size={16} /> {loading ? 'Searching…' : 'Find order'}</button>
                        </form>

                        {result && (
                            <div className="mt-8 border-t border-line pt-6" aria-live="polite">
                                <div className="flex items-start justify-between gap-4">
                                    <div><p className="eyebrow">Order</p><h2 className="mt-1 font-display text-3xl font-semibold text-gold-200">{result.orderNumber}</h2></div>
                                    <span className="border border-line px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-cream/65">{titleCase(result.status)}</span>
                                </div>
                                <dl className="mt-5 grid grid-cols-2 gap-4 text-xs">
                                    <div><dt className="text-cream/40">Placed</dt><dd className="mt-1 text-cream">{shortDate(result.createdAt)}</dd></div>
                                    <div><dt className="text-cream/40">Total</dt><dd className="mt-1 font-semibold text-cream">{rupees(result.totalPaise)}</dd></div>
                                </dl>
                                <Link to={`/account/orders/${result.id}`} className="button-secondary mt-6 w-full gap-2">View order <IconArrowRight size={15} /></Link>
                            </div>
                        )}
                    </section>
                )}
            </main>
            <StoreFooter />
        </div>
    );
};

export default OrderLookupPage;
