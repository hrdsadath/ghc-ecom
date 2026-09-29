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
            <button className="absolute inset-0 bg-black/75" onClick={closeCart} aria-label="Close bag" />
            <aside ref={dialogRef} tabIndex={-1} className="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col border-l border-line bg-carbon shadow-2xl shadow-black outline-none animate-slide-left" role="dialog" aria-modal="true" aria-labelledby="bag-title">
                <header className="flex items-center justify-between border-b border-line px-6 py-5 sm:px-8">
                    <h2 id="bag-title" className="font-display text-3xl font-semibold text-cream">The bag <span className="text-cream/60">({items.length})</span></h2>
                    <button className="grid size-11 place-items-center text-cream/70 hover:text-cream" onClick={closeCart} aria-label="Close"><IconClose /></button>
                </header>

                {error && <p className="border-b border-red-500/30 bg-red-950/40 px-6 py-3 text-xs text-red-200" role="alert">{error}</p>}

                <div className="flex-1 overflow-y-auto px-6 py-2 sm:px-8">
                    {loading && !cart ? (
                        <div className="grid h-full place-content-center text-center" role="status">
                            <IconPackage size={44} className="mx-auto animate-pulse text-gold-400/80" />
                            <p className="mt-5 text-sm text-cream/60">Preparing your bag…</p>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="grid h-full place-content-center text-center">
                            <IconPackage size={44} className="mx-auto text-gold-400/80" />
                            <h3 className="mt-6 font-display text-3xl font-semibold text-cream">Your bag is empty.</h3>
                            <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-cream/60">Browse the collection to find something for your home.</p>
                            <button onClick={closeCart} className="button-primary mx-auto mt-7">Continue shopping</button>
                        </div>
                    ) : items.map((item) => (
                        <article key={item.id} className="grid grid-cols-[88px_1fr] gap-5 border-b border-gold-500/15 py-6">
                            <img loading="lazy" decoding="async" src={item.imageUrl || fallbackImage} alt={item.productName} className="aspect-[4/5] w-full self-start object-contain rounded-sm border border-gold-500/20 bg-panel" />
                            <div className="flex min-w-0 flex-col justify-between">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h3 className="font-display text-lg font-semibold text-cream line-clamp-1">{item.productName}</h3>
                                        <p className="mt-0.5 text-xs text-cream/45">{item.optionLabel || item.color || item.sku}</p>
                                    </div>
                                    <button disabled={loading} onClick={() => { void removeItem(item.variantId).catch(() => undefined); }} className="text-xs text-cream/40 underline-offset-4 hover:text-gold-300 hover:underline">Remove</button>
                                </div>
                                <div className="mt-5 flex items-center justify-between">
                                    <div className="flex h-9 items-center border border-gold-500/25 rounded-sm bg-obsidian">
                                        <button disabled={loading} className="grid size-9 place-items-center hover:text-gold-300 text-cream/80" onClick={() => { void updateQuantity(item.variantId, item.quantity - 1).catch(() => undefined); }} aria-label="Decrease quantity"><IconMinus size={13} /></button>
                                        <span className="w-8 text-center text-xs font-bold text-cream font-mono">{item.quantity}</span>
                                        <button disabled={loading} className="grid size-9 place-items-center hover:text-gold-300 text-cream/80" onClick={() => { void updateQuantity(item.variantId, item.quantity + 1).catch(() => undefined); }} aria-label="Increase quantity"><IconPlus size={13} /></button>
                                    </div>
                                    <strong className="font-display font-semibold text-cream">{rupees(item.lineTotalPaise)}</strong>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
                {items.length > 0 && (
                    <footer className="border-t border-gold-500/20 bg-obsidian px-6 py-6 sm:px-8">
                        <div className="mb-5 flex items-end justify-between">
                            <span className="text-xs text-cream/55">Subtotal<small className="mt-0.5 block text-[10px] text-cream/40">Taxes are included in displayed prices</small></span>
                            <strong className="font-display text-3xl font-semibold text-cream">{rupees(cart?.subtotalPaise || 0)}</strong>
                        </div>
                        <Link to="/checkout" onClick={closeCart} className="button-primary h-14 w-full gap-3">
                            Checkout <IconArrowRight size={17} />
                        </Link>
                    </footer>
                )}
            </aside>
        </div>
    );
};

export default CartDrawer;
