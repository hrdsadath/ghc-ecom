'use client';

import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, Redirect } from '../lib/router';
import { IconArrowRight, IconRefresh, IconShieldCheck } from '../components/Icons';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useDialog } from '../hooks/useDialog';
import { api, getCartIdentity, saveGuestOrderAccess, savePendingPayment } from '../lib/api';
import { fallbackImage, rupees } from '../lib/commerce';
import { redirectToGateway, resolveCheckoutEmail } from '../lib/payment-gateway';
import { Address, CheckoutQuote, ShippingAddressInput } from '../types';

const CheckoutPage = () => {
    const { cart, loading: cartLoading } = useCart();
    const { signedIn, session } = useAuth();
    const [addresses, setAddresses] = useState<Address[]>([]);
    const [selectedAddress, setSelectedAddress] = useState('');
    const [quote, setQuote] = useState<CheckoutQuote | null>(null);
    const [loading, setLoading] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const [error, setError] = useState('');
    const isMounted = useRef(false);
    const leavingForGateway = useRef(false);
    const paymentBlocking = preparing;
    const paymentDialogRef = useDialog<HTMLDivElement>(paymentBlocking, () => undefined, { focusInitial: false });

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    useEffect(() => {
        if (!signedIn) return;
        let active = true;
        api.addresses()
            .then((items) => {
                if (!active) return;
                setAddresses(items);
                setSelectedAddress(items.find((item) => item.isDefault)?.id || items[0]?.id || '');
            })
            .catch(() => {
                if (active) setAddresses([]);
            });
        return () => {
            active = false;
        };
    }, [signedIn]);

    // Wait for the bag to load: opening or refreshing /checkout must not bounce to /cart.
    if (!cart && cartLoading) return null;
    if (!cart?.items.length) return <Redirect to="/cart" />;

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!cart) return;
        setLoading(true);
        setPreparing(true);
        setError('');

        const form = new FormData(event.currentTarget);
        const submittedEmail = form.get('email');
        const contactEmail = resolveCheckoutEmail(
            typeof submittedEmail === 'string' ? submittedEmail : null,
            session?.user?.email,
        );
        const shippingAddress: ShippingAddressInput = {
            recipientName: String(form.get('recipientName')),
            phone: String(form.get('phone')),
            line1: String(form.get('line1')),
            line2: String(form.get('line2') || ''),
            city: String(form.get('city')),
            state: String(form.get('state')),
            postalCode: String(form.get('postalCode')),
            country: 'IN',
        };

        try {
            let addressId = selectedAddress;
            if (signedIn && !addressId) {
                const address = await api.createAddress({ ...shippingAddress, label: 'Home', isDefault: true });
                addressId = address.id;
            }
            if (!isMounted.current) return;

            const createdQuote = await api.quote({
                cartId: cart.id,
                contactEmail,
                couponCode: String(form.get('couponCode') || '') || undefined,
                ...(signedIn ? { addressId } : { shippingAddress }),
            });

            if (!isMounted.current) return;
            setQuote(createdQuote);

            // HDFC SmartGateway hosted payment page: SmartGateway returns the customer
            // to /checkout/result?order_id=… and the API confirms the status.
            const intent = await api.hdfcPaymentIntent(createdQuote.id);
            if (!isMounted.current) return;
            const guestToken = !signedIn ? getCartIdentity()?.guestToken : undefined;
            if (guestToken) saveGuestOrderAccess(intent.orderId, guestToken);
            savePendingPayment(intent.orderId);
            leavingForGateway.current = true;
            redirectToGateway(intent);
        } catch (caught) {
            if (isMounted.current) setError(caught instanceof Error ? caught.message : 'Checkout could not be completed.');
        } finally {
            // Keep the overlay up while the browser navigates to the HDFC payment page.
            if (isMounted.current && !leavingForGateway.current) {
                setLoading(false);
                setPreparing(false);
            }
        }
    };

    const input = 'field h-12 w-full text-sm placeholder:text-cream/25';

    return (
        <div className="min-h-screen bg-obsidian text-cream">
            {/* Minimalist Glass Navigation Header */}
            <header className="glass-panel sticky top-0 z-40 flex h-20 items-center justify-between gap-4 border-b border-white/10 px-4 sm:px-10 backdrop-blur-2xl">
                <Link to="/" className="shrink-0 text-sm font-bold tracking-[0.2em] text-cream sm:text-lg">
                    GLOCKERY
                </Link>
                <div className="glass-pill flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[10px] sm:text-xs text-gold-300">
                    <IconShieldCheck size={15} className="shrink-0 text-gold-400" />
                    <span>HDFC Bank SmartGateway</span>
                </div>
            </header>

            {/* Stepper Bar */}
            <nav className="border-b border-white/5 bg-white/[0.02]" aria-label="Checkout progress">
                <ol className="mx-auto flex max-w-[1240px] items-center gap-3 px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] sm:px-10 lg:px-12">
                    <li className="text-cream/40">Shopping Bag</li>
                    <li className="text-white/20" aria-hidden="true">/</li>
                    <li className="text-gold-300 font-bold" aria-current="step">Delivery & Payment</li>
                    <li className="text-white/20" aria-hidden="true">/</li>
                    <li className="text-cream/40">Confirmation</li>
                </ol>
            </nav>

            {/* Payment Processing Overlay */}
            {paymentBlocking && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-6 backdrop-blur-md">
                    <div ref={paymentDialogRef} tabIndex={-1} className="glass-panel w-full max-w-sm rounded-3xl border border-stone-200/80 bg-white/95 p-8 text-center shadow-2xl outline-none" role="dialog" aria-modal="true" aria-busy="true" aria-label="Payment processing">
                        <div className="glass-pill mx-auto flex size-16 items-center justify-center rounded-2xl border-gold-500/40 bg-gold-500/10 text-gold-600 shadow-sm">
                            <IconRefresh size={28} className="animate-spin" />
                        </div>
                        <h3 className="mt-5 font-display text-2xl font-semibold text-cream">
                            Preparing Secure Gateway
                        </h3>
                        <p className="mt-2 text-xs text-cream/70 leading-relaxed">
                            Transferring to HDFC SmartGateway. Please do not close or reload.
                        </p>
                    </div>
                </div>
            )}

            <main id="main-content" className="mx-auto grid max-w-[1240px] gap-10 px-6 py-10 sm:px-10 lg:grid-cols-[1fr_420px] lg:px-12 lg:py-14">
                <form onSubmit={submit}>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold-600">
                        Express Checkout
                    </span>
                    <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl text-cream">
                        Shipping & Billing Information
                    </h1>

                    {/* Address Selection / Form */}
                    {signedIn && addresses.length > 0 && (
                        <section className="mt-8">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-600">
                                Select Saved Address
                            </p>
                            <select value={selectedAddress} onChange={(e) => setSelectedAddress(e.target.value)} className="field h-12 w-full rounded-xl text-sm border-stone-200/80 bg-white shadow-xs">
                                {addresses.map((address) => (
                                    <option key={address.id} value={address.id} className="bg-white text-cream">
                                        {address.label} — {address.line1}, {address.city} ({address.postalCode})
                                    </option>
                                ))}
                            </select>
                        </section>
                    )}

                    {(!signedIn || addresses.length === 0) && (
                        <section className="mt-8 grid gap-4 sm:grid-cols-2">
                            <label className="sm:col-span-2">
                                <span className="mb-1.5 block text-xs text-cream/70 font-medium">Recipient Full Name</span>
                                <input className="field h-12 w-full rounded-xl text-sm border-stone-200/80 bg-white shadow-xs" name="recipientName" autoComplete="name" required />
                            </label>
                            <label>
                                <span className="mb-1.5 block text-xs text-cream/70 font-medium">Email Address (Order Confirmation)</span>
                                <input className="field h-12 w-full rounded-xl text-sm border-stone-200/80 bg-white shadow-xs" name="email" type="email" autoComplete="email" defaultValue={session?.user?.email || ''} required />
                            </label>
                            <label>
                                <span className="mb-1.5 block text-xs text-cream/70 font-medium">Contact Phone Number</span>
                                <input className="field h-12 w-full rounded-xl text-sm border-stone-200/80 bg-white shadow-xs" name="phone" type="tel" inputMode="tel" autoComplete="tel" minLength={10} required />
                            </label>
                            <label className="sm:col-span-2">
                                <span className="mb-1.5 block text-xs text-cream/70 font-medium">Delivery Street Address</span>
                                <input className="field h-12 w-full rounded-xl text-sm border-stone-200/80 bg-white shadow-xs" name="line1" autoComplete="address-line1" required />
                            </label>
                            <label className="sm:col-span-2">
                                <span className="mb-1.5 block text-xs text-cream/70 font-medium">Apartment / Landmark (Optional)</span>
                                <input className="field h-12 w-full rounded-xl text-sm border-stone-200/80 bg-white shadow-xs" name="line2" autoComplete="address-line2" />
                            </label>
                            <label>
                                <span className="mb-1.5 block text-xs text-cream/70 font-medium">City</span>
                                <input className="field h-12 w-full rounded-xl text-sm border-stone-200/80 bg-white shadow-xs" name="city" autoComplete="address-level2" required />
                            </label>
                            <label>
                                <span className="mb-1.5 block text-xs text-cream/70 font-medium">State</span>
                                <input className="field h-12 w-full rounded-xl text-sm border-stone-200/80 bg-white shadow-xs" name="state" autoComplete="address-level1" required />
                            </label>
                            <label className="sm:col-span-2">
                                <span className="mb-1.5 block text-xs text-cream/70 font-medium">6-Digit PIN Code</span>
                                <input className="field h-12 w-full rounded-xl text-sm border-stone-200/80 bg-white shadow-xs" name="postalCode" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{6}" required />
                            </label>
                        </section>
                    )}

                    {/* Coupon Code Input */}
                    <section className="mt-6">
                        <label className="block">
                            <span className="mb-1.5 block text-xs text-cream/70 font-medium">Gift Card or Discount Code</span>
                            <input className="field h-12 w-full rounded-xl text-sm border-stone-200/80 bg-white shadow-xs" name="couponCode" placeholder="Enter promo code (e.g. WELCOME10)" />
                        </label>
                    </section>

                    {error && (
                        <div className="glass-panel mt-6 rounded-2xl border-red-500/30 p-4 text-xs text-red-600" role="alert">
                            <p>{error}</p>
                        </div>
                    )}

                    <button
                        disabled={loading}
                        className="button-primary mt-8 flex h-14 w-full items-center justify-center gap-3 rounded-2xl text-sm font-semibold shadow-[0_8px_30px_rgba(26,24,21,0.25)] disabled:opacity-50"
                    >
                        {loading ? 'Redirecting to HDFC Gateway…' : <>Pay Securely via HDFC Bank <IconArrowRight size={16} /></>}
                    </button>
                </form>

                {/* Order Summary Sidebar */}
                <aside className="glass-panel h-fit rounded-3xl p-6 sm:p-8 lg:sticky lg:top-28 border border-stone-200/80 bg-white/95 shadow-sm">
                    <span className="text-[10px] uppercase tracking-[0.25em] font-semibold text-gold-600">
                        Selected Items
                    </span>
                    <h3 className="mt-1 font-display text-2xl font-semibold text-cream">Order Summary</h3>

                    <div className="mt-4 divide-y divide-stone-200/70">
                        {cart?.items.map((item) => (
                            <article key={item.id} className="grid grid-cols-[56px_1fr_auto] items-center gap-3.5 py-3">
                                <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-stone-200/60 bg-white p-1">
                                    <img
                                        loading="lazy"
                                        decoding="async"
                                        src={item.imageUrl || fallbackImage}
                                        alt=""
                                        className="h-full w-full object-contain"
                                    />
                                </div>
                                <div className="min-w-0">
                                    <h4 className="text-xs font-medium text-cream line-clamp-1">{item.productName}</h4>
                                    <p className="text-[11px] text-cream/55">{item.quantity} × {item.optionLabel || item.color || item.sku}</p>
                                </div>
                                <strong className="text-xs font-semibold tabular-nums text-gold-700">
                                    {rupees(item.lineTotalPaise)}
                                </strong>
                            </article>
                        ))}
                    </div>

                    <div className="mt-6 border-t border-stone-200/80 pt-4 space-y-2.5 text-xs text-cream/70">
                        <div className="flex justify-between">
                            <span>Items Subtotal</span>
                            <span className="tabular-nums font-medium text-cream">{rupees(cart?.subtotalPaise || 0)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Taxes</span>
                            <span>{quote?.taxPaise ? rupees(quote.taxPaise) : 'Included in prices'}</span>
                        </div>
                        {quote && quote.discountPaise > 0 && (
                            <div className="flex justify-between text-emerald-700 font-medium">
                                <span>Promo Discount</span>
                                <span>-{rupees(quote.discountPaise)}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-display text-xl text-cream pt-3 border-t border-stone-200/80 font-medium">
                            <span>Total Payable</span>
                            <span className="text-gold-700 tabular-nums font-bold">{rupees(quote?.totalPaise ?? cart?.subtotalPaise ?? 0)}</span>
                        </div>
                    </div>
                </aside>
            </main>
        </div>
    );
};
export default CheckoutPage;
