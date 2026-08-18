'use client';

import React from 'react';
import { Link } from '../lib/router';
import Header from '../components/Header';
import { IconArrowRight, IconMinus, IconPackage, IconPlus, IconTrash } from '../components/Icons';
import SEOHead from '../components/SEOHead';
import StoreFooter from '../components/StoreFooter';
import { useCart } from '../contexts/CartContext';
import { fallbackImage, rupees } from '../lib/commerce';

const CartPage = () => {
    const { cart, loading, error, updateQuantity, removeItem } = useCart();
    const items = cart?.items || [];

    return (
        <div className="min-h-screen bg-obsidian text-cream font-body flex flex-col justify-between">
            <SEOHead title="Your Shopping Bag | Glockery Home Centre" noIndex />
            <Header />

            <main id="main-content" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-8 lg:px-12 lg:py-16">
                <header className="mb-10 flex flex-col items-start justify-between gap-4 border-b border-line pb-7 sm:flex-row sm:items-end">
                    <div>
                        <h1 className="font-display text-4xl font-semibold tracking-[-0.02em] text-cream sm:text-5xl">Shopping bag</h1>
                        <p className="mt-2 text-sm text-cream/65">{items.length} {items.length === 1 ? 'item' : 'items'}</p>
                    </div>
                    <Link to="/" className="text-sm font-semibold text-gold-300 hover:text-gold-100">
                        Continue shopping
                    </Link>
                </header>

                {error && <p className="mb-6 rounded-sm border border-red-500/30 bg-red-950/20 p-4 text-xs text-red-200">{error}</p>}

                {!items.length && !loading ? (
                    <div className="border-y border-line py-20 text-center">
                        <div className="mx-auto mb-4 grid size-14 place-items-center text-gold-400">
                            <IconPackage size={32} />
                        </div>
                        <h2 className="font-display text-3xl font-bold text-cream">Nothing here—yet.</h2>
                        <p className="mx-auto mt-2 max-w-sm text-xs text-cream/60">Explore dinner sets, tea sets, serving dishes, canisters and kitchenware.</p>
                        <Link to="/" className="button-primary mt-7 gap-2">
                            Explore collection <IconArrowRight size={15} />
                        </Link>
                    </div>
                ) : (
                    <div className="grid gap-8 lg:grid-cols-12">
                        <div className="divide-y divide-line border border-line lg:col-span-8">
                            {items.map((item) => (
                                <article key={item.id} className="flex flex-col items-start justify-between gap-6 bg-carbon/20 px-5 py-6 sm:flex-row sm:items-center">
                                    <div className="flex items-center gap-5">
                                        <img
                                            src={item.imageUrl || fallbackImage}
                                            alt={item.productName}
                                            className="aspect-[4/5] w-20 object-cover bg-panel"
                                            onError={(e) => { e.currentTarget.src = fallbackImage; }}
                                        />
                                        <div>
                                            <h3 className="font-display text-xl font-semibold text-cream">{item.productName}</h3>
                                            <p className="text-xs text-cream/50 mt-1">{item.optionLabel || item.color || item.sku}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between w-full gap-4 sm:w-auto sm:gap-8 pt-4 sm:pt-0 border-t sm:border-t-0 border-line sm:border-none">
                                        <div className="flex h-10 border border-line bg-obsidian/80">
                                            <button
                                                disabled={loading}
                                                className="grid w-10 place-items-center text-cream/60 hover:text-gold-300 transition"
                                                onClick={() => { void updateQuantity(item.variantId, item.quantity - 1).catch(() => undefined); }}
                                                aria-label="Decrease quantity"
                                                >
                                                <IconMinus size={13} />
                                            </button>
                                            <span className="grid w-8 place-items-center text-xs font-bold text-cream tabular-nums">{item.quantity}</span>
                                            <button
                                                disabled={loading}
                                                className="grid w-10 place-items-center text-cream/60 hover:text-gold-300 transition"
                                                onClick={() => { void updateQuantity(item.variantId, item.quantity + 1).catch(() => undefined); }}
                                                aria-label="Increase quantity"
                                            >
                                                <IconPlus size={13} />
                                            </button>
                                        </div>

                                        <strong className="min-w-28 text-right font-display text-xl font-semibold text-cream">
                                            {rupees(item.lineTotalPaise)}
                                        </strong>

                                        <button
                                            onClick={() => { void removeItem(item.variantId).catch(() => undefined); }}
                                            className="grid size-9 place-items-center rounded-sm border border-red-500/25 text-red-300 transition hover:border-red-300 hover:text-red-100"
                                            title="Remove item"
                                            aria-label={`Remove ${item.productName}`}
                                        >
                                            <IconTrash size={16} />
                                        </button>
                                    </div>
                                </article>
                            ))}
                        </div>

                        <aside className="h-fit border border-line bg-carbon p-6 lg:sticky lg:top-28 lg:col-span-4">
                            <h2 className="text-lg font-semibold text-cream">Order summary</h2>

                            <div className="mt-6 space-y-3 border-b border-gold-500/15 pb-5 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-cream/60">Items subtotal</span>
                                    <strong className="font-semibold text-cream tabular-nums">{rupees(cart?.subtotalPaise || 0)}</strong>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-cream/60">Taxes</span>
                                    <span className="text-cream/60">Included in prices</span>
                                </div>
                            </div>

                            <div className="mt-5 flex justify-between items-baseline">
                                <span className="font-display text-lg font-bold text-cream">Total</span>
                                <strong className="font-display text-3xl font-semibold text-cream">{rupees(cart?.subtotalPaise || 0)}</strong>
                            </div>

                            <Link
                                to="/checkout"
                                className="mt-6 flex h-12 w-full items-center justify-center gap-2 bg-gold-400 text-xs font-bold uppercase tracking-[0.2em] text-obsidian hover:bg-gold-300 rounded-sm shadow-md transition"
                            >
                                Checkout <IconArrowRight size={16} />
                            </Link>
                        </aside>
                    </div>
                )}
            </main>

            <StoreFooter />
        </div>
    );
};

export default CartPage;
