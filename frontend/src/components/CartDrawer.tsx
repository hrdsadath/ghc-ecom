import React from 'react';
import { Link } from '../lib/router';
import { useCart } from '../contexts/CartContext';
import { fallbackImage, rupees } from '../lib/commerce';
import { useDialog } from '../hooks/useDialog';
import { IconArrowRight, IconClose, IconMinus, IconPackage, IconPlus } from './Icons';

const CartDrawer = () => {
    const { cart, error, isCartOpen, closeCart, updateQuantity, removeItem, loading } = useCart();
    const dialogRef = useDialog<HTMLElement>(isCartOpen, closeCart);

    if (!isCartOpen) return null;
    const items = cart?.items || [];

    return (
        <div className="fixed inset-0 z-50">
            {/* Backdrop with frosted blur */}
            <button
                className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm transition-opacity"
                onClick={closeCart}
                aria-label="Close bag"
            />

            {/* Glassmorphic Drawer Panel */}
            <aside
                ref={dialogRef}
                tabIndex={-1}
                className="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col border-l border-gold-500/20 bg-white/95 backdrop-blur-2xl shadow-[-16px_0_50px_rgba(26,24,21,0.12)] outline-none animate-slide-left"
                role="dialog"
                aria-modal="true"
                aria-labelledby="bag-title"
            >
                {/* Header */}
                <header className="flex items-center justify-between border-b border-stone-200/80 bg-stone-50/70 px-6 py-5 sm:px-8">
                    <div>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-600">
                            Shopping Selection
                        </span>
                        <h2 id="bag-title" className="font-display text-2xl sm:text-3xl font-semibold text-cream">
                            The bag <span className="text-cream/50 text-xl font-normal">({items.length})</span>
                        </h2>
                    </div>
                    <button
                        className="glass-pill grid size-10 place-items-center rounded-full text-cream/70 transition-all hover:border-gold-500/50 hover:text-gold-600 shadow-sm"
                        onClick={closeCart}
                        aria-label="Close"
                    >
                        <IconClose size={18} />
                    </button>
                </header>

                {error && (
                    <p className="border-b border-red-500/30 bg-red-950/40 px-6 py-3 text-xs text-red-200" role="alert">
                        {error}
                    </p>
                )}

                {/* Items List */}
                <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-7 space-y-3">
                    {loading && !cart ? (
                        <div className="grid h-full place-content-center text-center" role="status">
                            <IconPackage size={44} className="mx-auto animate-pulse text-gold-400/80" />
                            <p className="mt-5 text-sm text-cream/60">Preparing your bag…</p>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="grid h-full place-content-center text-center py-12">
                            <div className="glass-pill mx-auto grid size-16 place-items-center rounded-2xl border-gold-400/30 bg-gold-400/10 text-gold-300">
                                <IconPackage size={32} />
                            </div>
                            <h3 className="mt-6 font-display text-2xl font-semibold text-cream">Your bag is empty</h3>
                            <p className="mx-auto mt-2 max-w-xs text-xs sm:text-sm leading-relaxed text-cream/60">
                                Explore our artisanal dinner sets and tableware to find timeless pieces for your home.
                            </p>
                            <button
                                onClick={closeCart}
                                className="button-primary mx-auto mt-7 rounded-xl py-3 px-6 text-xs sm:text-sm font-semibold"
                            >
                                Continue Shopping
                            </button>
                        </div>
                    ) : (
                        items.map((item) => (
                            <article
                                key={item.id}
                                className="glass-card group flex items-start gap-4 rounded-2xl p-3.5 sm:p-4 border border-stone-200/80 transition-all hover:border-gold-500/40 hover:shadow-md"
                            >
                                <div className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-xl border border-stone-200/60 bg-white p-2">
                                    <img
                                        loading="lazy"
                                        decoding="async"
                                        src={item.imageUrl || fallbackImage}
                                        alt={item.productName}
                                        className="h-full w-full object-contain"
                                    />
                                </div>
                                <div className="flex flex-1 flex-col justify-between self-stretch min-w-0">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h3 className="font-display text-base font-medium text-cream line-clamp-1">
                                                {item.productName}
                                            </h3>
                                            <p className="mt-0.5 text-xs text-cream/60">
                                                {item.optionLabel || item.color || item.sku}
                                            </p>
                                        </div>
                                        <button
                                            disabled={loading}
                                            onClick={() => {
                                                void removeItem(item.variantId).catch(() => undefined);
                                            }}
                                            className="text-xs text-cream/40 transition hover:text-red-600 font-medium"
                                        >
                                            Remove
                                        </button>
                                    </div>

                                    <div className="mt-3 flex items-center justify-between">
                                        <div className="glass-pill flex h-8 items-center rounded-full px-1 border-stone-200/80 bg-stone-100/80">
                                            <button
                                                disabled={loading}
                                                className="grid size-7 place-items-center rounded-full text-cream/70 hover:bg-white hover:text-gold-600 disabled:opacity-40"
                                                onClick={() => {
                                                    void updateQuantity(item.variantId, item.quantity - 1).catch(() => undefined);
                                                }}
                                                aria-label="Decrease quantity"
                                            >
                                                <IconMinus size={12} />
                                            </button>
                                            <span className="w-7 text-center text-xs font-semibold tabular-nums text-cream">
                                                {item.quantity}
                                            </span>
                                            <button
                                                disabled={loading}
                                                className="grid size-7 place-items-center rounded-full text-cream/70 hover:bg-white hover:text-gold-600 disabled:opacity-40"
                                                onClick={() => {
                                                    void updateQuantity(item.variantId, item.quantity + 1).catch(() => undefined);
                                                }}
                                                aria-label="Increase quantity"
                                            >
                                                <IconPlus size={12} />
                                            </button>
                                        </div>
                                        <strong className="text-sm sm:text-base font-semibold tabular-nums text-cream">
                                            {rupees(item.lineTotalPaise)}
                                        </strong>
                                    </div>
                                </div>
                            </article>
                        ))
                    )}
                </div>

                {/* Footer with Checkout CTA */}
                {items.length > 0 && (
                    <footer className="border-t border-stone-200/80 bg-[#faf8f5]/95 px-6 py-6 sm:px-8 backdrop-blur-xl">
                        <div className="mb-5 flex items-end justify-between">
                            <div>
                                <span className="text-xs text-cream/70 font-medium">Estimated Total</span>
                                <small className="mt-0.5 block text-[10px] text-cream/50">
                                    Taxes included & free pickup available
                                </small>
                            </div>
                            <strong className="font-display text-2xl sm:text-3xl font-semibold text-cream">
                                {rupees(cart?.subtotalPaise || 0)}
                            </strong>
                        </div>
                        <Link
                            to="/checkout"
                            onClick={closeCart}
                            className="button-primary flex h-13 w-full items-center justify-center gap-3 rounded-2xl text-sm font-semibold shadow-[0_8px_30px_rgba(26,24,21,0.25)]"
                        >
                            Proceed to Checkout <IconArrowRight size={17} />
                        </Link>
                    </footer>
                )}
            </aside>
        </div>
    );
};

export default CartDrawer;
