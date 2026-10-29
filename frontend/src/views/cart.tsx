'use client';

import React from 'react';
import { Link } from '../lib/router';
import Header from '../components/Header';
import { IconArrowRight, IconMinus, IconPackage, IconPlus, IconTrash } from '../components/Icons';
import StoreFooter from '../components/StoreFooter';
import TrustBadges from '../components/TrustBadges';
import { useCart } from '../contexts/CartContext';
import { fallbackImage, rupees } from '../lib/commerce';

const CartPage = () => {
    const { cart, loading, error, updateQuantity, removeItem } = useCart();
    const items = cart?.items || [];

    return (
        <div className="min-h-screen bg-obsidian text-cream font-body flex flex-col justify-between">
            <Header />

            <main id="main-content" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
                {/* Header Pavilion */}
                <header className="glass-panel relative mb-10 overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-10 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
                    <div className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-gold-400/10 blur-3xl" />
                    <div>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold-400/80">
                            Order Review
                        </span>
                        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-cream sm:text-5xl">
                            Shopping Bag
                        </h1>
                        <p className="mt-2 text-xs sm:text-sm text-cream/65">
                            {items.length} {items.length === 1 ? 'selected piece' : 'selected pieces'}
                        </p>
                    </div>
                    <Link to="/" className="glass-pill rounded-full px-5 py-2 text-xs font-semibold text-gold-300 hover:text-white transition">
                        Continue Browsing
                    </Link>
                </header>

                {error && (
                    <p className="mb-6 rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-xs text-red-200">
                        {error}
                    </p>
                )}

                {!items.length && !loading ? (
                    <div className="glass-panel rounded-3xl py-20 text-center">
                        <div className="glass-pill mx-auto mb-5 grid size-16 place-items-center rounded-2xl border-gold-400/30 bg-gold-400/10 text-gold-300">
                            <IconPackage size={32} />
                        </div>
                        <h2 className="font-display text-2xl font-bold text-cream">Nothing here—yet.</h2>
                        <p className="mx-auto mt-2 max-w-sm text-xs sm:text-sm text-cream/60">
                            Your bag is empty. Explore dinner sets, tea sets, serving dishes, canisters and fine kitchenware.
                        </p>
                        <Link to="/" className="button-primary mx-auto mt-7 flex items-center justify-center gap-2 rounded-xl py-3 px-6 text-sm">
                            Explore collection <IconArrowRight size={15} />
                        </Link>
                    </div>
                ) : (
                    <div className="grid gap-8 lg:grid-cols-12">
                        {/* Cart Items List */}
                        <div className="space-y-4 lg:col-span-8">
                            {items.map((item) => (
                                <article
                                    key={item.id}
                                    className="glass-card flex flex-col items-start justify-between gap-6 rounded-2xl p-5 sm:flex-row sm:items-center border border-white/5 transition-all hover:border-gold-400/30"
                                >
                                    <div className="flex items-center gap-4 sm:gap-5">
                                        <div className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-xl border border-white/5 bg-obsidian/60 p-2">
                                            <img
                                                loading="lazy"
                                                decoding="async"
                                                src={item.imageUrl || fallbackImage}
                                                alt={item.productName}
                                                className="h-full w-full object-contain"
                                                onError={(e) => { e.currentTarget.src = fallbackImage; }}
                                            />
                                        </div>
                                        <div>
                                            <h3 className="font-display text-lg sm:text-xl font-medium text-cream">
                                                {item.productName}
                                            </h3>
                                            <p className="text-xs text-cream/50 mt-1">
                                                {item.optionLabel || item.color || item.sku}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between w-full gap-4 sm:w-auto sm:gap-6 pt-4 sm:pt-0 border-t sm:border-t-0 border-white/10">
                                        <div className="glass-pill flex h-9 items-center rounded-full px-1 border-white/10 bg-white/5">
                                            <button
                                                disabled={loading}
                                                className="grid size-8 place-items-center rounded-full text-cream/70 hover:bg-white/10 hover:text-gold-300 disabled:opacity-40"
                                                onClick={() => { void updateQuantity(item.variantId, item.quantity - 1).catch(() => undefined); }}
                                                aria-label="Decrease quantity"
                                            >
                                                <IconMinus size={13} />
                                            </button>
                                            <span className="w-8 text-center text-xs font-semibold tabular-nums text-cream">{item.quantity}</span>
                                            <button
                                                disabled={loading}
                                                className="grid size-8 place-items-center rounded-full text-cream/70 hover:bg-white/10 hover:text-gold-300 disabled:opacity-40"
                                                onClick={() => { void updateQuantity(item.variantId, item.quantity + 1).catch(() => undefined); }}
                                                aria-label="Increase quantity"
                                            >
                                                <IconPlus size={13} />
                                            </button>
                                        </div>

                                        <strong className="min-w-24 text-right font-display text-lg sm:text-xl font-semibold tabular-nums text-cream">
                                            {rupees(item.lineTotalPaise)}
                                        </strong>

                                        <button
                                            onClick={() => { void removeItem(item.variantId).catch(() => undefined); }}
                                            className="glass-pill grid size-9 place-items-center rounded-full text-cream/40 transition hover:border-red-400/40 hover:text-red-300"
                                            title="Remove item"
                                            aria-label={`Remove ${item.productName}`}
                                        >
                                            <IconTrash size={15} />
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>

                        {/* Sticky Order Summary Glass Column */}
                        <aside className="glass-panel h-fit rounded-3xl p-6 sm:p-8 lg:sticky lg:top-28 lg:col-span-4">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-400/80">
                                Total Breakdown
                            </span>
                            <h2 className="mt-1 font-display text-2xl font-semibold text-cream">Order Summary</h2>

                            <div className="mt-6 space-y-3 border-b border-white/10 pb-5 text-xs sm:text-sm">
                                <div className="flex justify-between">
                                    <span className="text-cream/60">Items Subtotal</span>
                                    <strong className="font-semibold text-cream tabular-nums">{rupees(cart?.subtotalPaise || 0)}</strong>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-cream/60">Shipping</span>
                                    <span className="text-cream/60">Calculated at checkout</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-cream/60">Estimated Taxes</span>
                                    <span className="text-cream/60">Included in prices</span>
                                </div>
                            </div>

                            <div className="mt-5 flex justify-between items-baseline">
                                <span className="font-display text-lg font-bold text-cream">Estimated Total</span>
                                <strong className="font-display text-3xl font-semibold text-cream">{rupees(cart?.subtotalPaise || 0)}</strong>
                            </div>

                            <Link
                                to="/checkout"
                                className="button-primary mt-7 flex h-13 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold shadow-[0_8px_30px_rgba(212,175,55,0.25)]"
                            >
                                Proceed to Checkout <IconArrowRight size={16} />
                            </Link>

                            <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-cream/50">
                                <span>🔒 100% Encrypted & Safe Checkout</span>
                            </div>
                        </aside>
                    </div>
                )}
            </main>

            <TrustBadges />
            <StoreFooter />
        </div>
    );
};

export default CartPage;
