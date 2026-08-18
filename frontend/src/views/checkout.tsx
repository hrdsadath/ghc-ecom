'use client';

import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, Redirect, useHistory } from '../lib/router';
import { IconAlert, IconArrowRight, IconCheckCircle, IconRefresh, IconShieldCheck } from '../components/Icons';
import SEOHead from '../components/SEOHead';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useDialog } from '../hooks/useDialog';
import { api, getCartIdentity, saveGuestOrderAccess } from '../lib/api';
import { fallbackImage, rupees } from '../lib/commerce';
import { formatRazorpayContact, resolveCheckoutEmail } from '../lib/razorpay';
import { Address, CheckoutQuote, Order, PaymentIntent, ShippingAddressInput } from '../types';

type RazorpaySuccess = {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
};

type RazorpayFailure = {
    error?: { description?: string; reason?: string };
};

type PaymentStage = 'idle' | 'preparing' | 'gateway' | 'verifying' | 'checking';

declare global {
    interface Window {
        Razorpay: new (options: Record<string, unknown>) => {
            open: () => void;
            on: (event: 'payment.failed', callback: (response: RazorpayFailure) => void) => void;
        };
    }
}

let razorpayScriptPromise: Promise<void> | null = null;

const loadRazorpay = () => {
    if (window.Razorpay) return Promise.resolve();
    if (razorpayScriptPromise) return razorpayScriptPromise;
    razorpayScriptPromise = new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout]');
        const script = existing ?? document.createElement('script');
        script.dataset.razorpayCheckout = 'true';
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.referrerPolicy = 'strict-origin-when-cross-origin';
        script.onload = () => resolve();
        script.onerror = () => {
            razorpayScriptPromise = null;
            reject(new Error('Razorpay Checkout could not be loaded. Please check your connection.'));
        };
        if (!existing) document.head.appendChild(script);
    });
    return razorpayScriptPromise;
};

const CheckoutPage = () => {
    const history = useHistory();
    const { cart, resetCart } = useCart();
    const { signedIn, session } = useAuth();
    const [addresses, setAddresses] = useState<Address[]>([]);
    const [selectedAddress, setSelectedAddress] = useState('');
    const [quote, setQuote] = useState<CheckoutQuote | null>(null);
    const [loading, setLoading] = useState(false);
    const [paymentStage, setPaymentStage] = useState<PaymentStage>('idle');
    const [pendingIntent, setPendingIntent] = useState<PaymentIntent | null>(null);
    const [paymentFailed, setPaymentFailed] = useState(false);
    const [error, setError] = useState('');
    const isMounted = useRef(false);
    const paymentBlocking = paymentStage !== 'idle' && paymentStage !== 'gateway' && !paymentFailed;
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

    if (!cart?.items.length) return <Redirect to="/cart" />;

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!cart) return;
        setLoading(true);
        setPaymentStage('preparing');
        setPendingIntent(null);
        setPaymentFailed(false);
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
            const intent = await api.paymentIntent(createdQuote.id);
            if (!isMounted.current) return;
            setPendingIntent(intent);
            await loadRazorpay();
            if (!isMounted.current) return;
            const checkoutAddress = intent.checkout.shippingAddress;

            await new Promise<void>((resolve, reject) => {
                let settled = false;
                const settle = (callback: () => void) => {
                    if (settled) return;
                    settled = true;
                    callback();
                };
                const checkout = new window.Razorpay({
                    key: intent.keyId,
                    amount: intent.amount,
                    currency: intent.currency,
                    order_id: intent.razorpayOrderId,
                    name: 'Glockery Home Centre',
                    description: `Order ${intent.orderNumber}`,
                    theme: { color: '#d4af37' },
                    prefill: {
                        email: checkoutAddress.email || contactEmail,
                        contact: formatRazorpayContact(checkoutAddress.phone, checkoutAddress.country),
                        name: checkoutAddress.recipientName,
                    },
                    retry: { enabled: true, max_count: 2 },
                    handler: async (response: RazorpaySuccess) => {
                        if (isMounted.current) setPaymentStage('verifying');
                        try {
                            let verified: Order;
                            try {
                                verified = await api.verifyPayment({
                                    razorpayPaymentId: response.razorpay_payment_id,
                                    razorpayOrderId: response.razorpay_order_id,
                                    razorpaySignature: response.razorpay_signature,
                                });
                            } catch {
                                verified = await api.paymentStatus(response.razorpay_order_id);
                            }
                            if (verified.status === 'PAYMENT_PENDING') {
                                throw new Error('Payment was received and is still being confirmed. Check its status in a moment.');
                            }
                            if (verified.status === 'PAYMENT_FAILED' || verified.status === 'CANCELLED') {
                                throw new Error('Razorpay did not confirm this payment. Your cart has not been charged.');
                            }
                            if (!isMounted.current) {
                                settle(resolve);
                                return;
                            }
                            const guestToken = !signedIn ? getCartIdentity()?.guestToken : undefined;
                            if (guestToken) saveGuestOrderAccess(verified.id, guestToken);
                            resetCart();
                            history.push(`/order-confirmation/${verified.id}`);
                            settle(resolve);
                        } catch (caught) {
                            settle(() => reject(caught));
                        }
                    },
                    modal: {
                        confirm_close: true,
                        ondismiss: () => {
                            if (isMounted.current) setPaymentFailed(true);
                            settle(() => reject(new Error('Payment window closed. Your pending order is saved; retry to reopen the same payment.')));
                        },
                    },
                });
                checkout.on('payment.failed', (response) => {
                    if (isMounted.current) setPaymentFailed(true);
                    const message = response.error?.description || response.error?.reason || 'Razorpay could not complete the payment.';
                    settle(() => reject(new Error(message)));
                });
                if (isMounted.current) setPaymentStage('gateway');
                checkout.open();
            });
        } catch (caught) {
            if (isMounted.current) setError(caught instanceof Error ? caught.message : 'Checkout could not be completed.');
        } finally {
            if (isMounted.current) {
                setLoading(false);
                setPaymentStage('idle');
            }
        }
    };

    const checkPaymentStatus = async () => {
        if (!pendingIntent) return;
        setPaymentStage('checking');
        setError('');
        try {
            const order = await api.paymentStatus(pendingIntent.razorpayOrderId);
            if (!isMounted.current) return;
            if (order.status === 'PAYMENT_PENDING') {
                setError('Payment confirmation is still pending. Please wait a moment and check again.');
                return;
            }
            if (order.status === 'PAYMENT_FAILED' || order.status === 'CANCELLED') {
                setPaymentFailed(true);
                setError('This payment was not completed. You can safely retry checkout.');
                return;
            }
            const guestToken = !signedIn ? getCartIdentity()?.guestToken : undefined;
            if (guestToken) saveGuestOrderAccess(order.id, guestToken);
            resetCart();
            history.push(`/order-confirmation/${order.id}`);
        } catch (caught) {
            if (isMounted.current) setError(caught instanceof Error ? caught.message : 'Payment status could not be checked.');
        } finally {
            if (isMounted.current) setPaymentStage('idle');
        }
    };

    const input = 'field h-12 w-full text-sm placeholder:text-cream/25';

    return (
        <div className="min-h-screen bg-obsidian text-cream">
            <SEOHead title="Secure Checkout | Glockery" noIndex />
            <header className="flex h-20 items-center justify-between gap-4 border-b border-line px-4 sm:px-10">
                <Link to="/" className="shrink-0 text-sm font-bold tracking-[0.18em] text-cream sm:text-lg">GLOCKERY</Link>
                <span className="flex items-center gap-2 text-right text-[9px] uppercase tracking-[0.12em] text-cream/35 sm:text-[10px] sm:tracking-[0.18em]">
                    <IconShieldCheck size={15} className="shrink-0" /> Secure Razorpay Checkout
                </span>
            </header>
            <nav className="border-b border-line" aria-label="Checkout progress">
                <ol className="mx-auto flex max-w-[1240px] items-center gap-3 px-6 py-3 text-[10px] font-bold uppercase tracking-[0.14em] sm:px-10 lg:px-12">
                    <li className="text-cream/35">Bag</li><li className="text-cream/25" aria-hidden="true">/</li>
                    <li className="text-gold-300" aria-current="step">Order details</li><li className="text-cream/25" aria-hidden="true">/</li>
                    <li className="text-cream/35">Payment</li>
                </ol>
            </nav>

            {/* Payment Processing Overlay */}
            {paymentBlocking && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur-md">
                    <div ref={paymentDialogRef} tabIndex={-1} className="w-full max-w-sm text-center border border-gold-500/30 bg-carbon p-8 rounded-sm shadow-2xl outline-none" role="dialog" aria-modal="true" aria-busy="true" aria-label="Payment processing">
                        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-gold-400/10 text-gold-300">
                            <IconRefresh size={28} className="animate-spin" />
                        </div>
                        <h3 className="mt-4 font-display text-2xl text-cream">
                            {paymentStage === 'preparing' ? 'Preparing secure payment' : 'Confirming your payment'}
                        </h3>
                        <p className="mt-2 text-xs text-cream/60">Please do not close or refresh this page.</p>
                    </div>
                </div>
            )}

            <main id="main-content" className="mx-auto grid max-w-[1240px] gap-12 px-6 py-12 sm:px-10 lg:grid-cols-[1fr_420px] lg:px-12 lg:py-16">
                <form onSubmit={submit}>
                    <p className="eyebrow">Order details &amp; payment</p>
                    <h1 className="mt-2 font-display text-4xl font-semibold sm:text-5xl">Complete your order</h1>

                    {paymentFailed && (
                        <div className="mt-6 border border-amber-500/30 bg-amber-950/20 p-5 rounded-sm flex items-start gap-4">
                            <IconAlert size={24} className="text-amber-400 shrink-0" />
                            <div>
                                <h4 className="font-bold text-amber-300 text-sm">Payment not completed</h4>
                                <p className="mt-1 text-xs text-cream/70">Your cart and contact details are still here. Retry when you are ready.</p>
                            </div>
                        </div>
                    )}

                    {/* Address Selection / Form */}
                    {signedIn && addresses.length > 0 && (
                        <section className="mt-8">
                            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gold-400">Saved Contact Address</p>
                            <select value={selectedAddress} onChange={(e) => setSelectedAddress(e.target.value)} className={input}>
                                {addresses.map((address) => (
                                    <option key={address.id} value={address.id}>
                                        {address.label} — {address.line1}, {address.city} ({address.postalCode})
                                    </option>
                                ))}
                            </select>
                        </section>
                    )}

                    {(!signedIn || addresses.length === 0) && (
                        <section className="mt-8 grid gap-4 sm:grid-cols-2">
                            <label className="sm:col-span-2">
                                <span className="mb-1.5 block text-xs text-cream/60 font-medium">Full Name</span>
                                <input className={input} name="recipientName" autoComplete="name" required />
                            </label>
                            <label>
                                <span className="mb-1.5 block text-xs text-cream/60 font-medium">Email Address</span>
                                <input className={input} name="email" type="email" autoComplete="email" defaultValue={session?.user?.email || ''} required />
                            </label>
                            <label>
                                <span className="mb-1.5 block text-xs text-cream/60 font-medium">Mobile Number</span>
                                <input className={input} name="phone" type="tel" inputMode="tel" autoComplete="tel" minLength={10} required />
                            </label>
                            <label className="sm:col-span-2">
                                <span className="mb-1.5 block text-xs text-cream/60 font-medium">Street Address</span>
                                <input className={input} name="line1" autoComplete="address-line1" required />
                            </label>
                            <label className="sm:col-span-2">
                                <span className="mb-1.5 block text-xs text-cream/60 font-medium">Apartment / Suite / Landmark</span>
                                <input className={input} name="line2" autoComplete="address-line2" />
                            </label>
                            <label>
                                <span className="mb-1.5 block text-xs text-cream/60 font-medium">City</span>
                                <input className={input} name="city" autoComplete="address-level2" required />
                            </label>
                            <label>
                                <span className="mb-1.5 block text-xs text-cream/60 font-medium">State</span>
                                <input className={input} name="state" autoComplete="address-level1" required />
                            </label>
                            <label className="sm:col-span-2">
                                <span className="mb-1.5 block text-xs text-cream/60 font-medium">PIN Code</span>
                                <input className={input} name="postalCode" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{6}" required />
                            </label>
                        </section>
                    )}

                    {/* Coupon Code Input */}
                    <section className="mt-6">
                        <label className="block">
                            <span className="mb-1.5 block text-xs text-cream/60">Promo Coupon Code</span>
                            <input className={input} name="couponCode" placeholder="Enter coupon code (e.g. WELCOME10)" />
                        </label>
                    </section>

                    {error && (
                        <div className="mt-5 border border-red-500/30 bg-red-950/20 p-4 text-xs text-red-200" role="alert">
                            <p>{error}</p>
                            {pendingIntent && (
                                <button type="button" className="mt-3 font-bold text-gold-300 underline underline-offset-4" onClick={checkPaymentStatus}>
                                    Check payment status
                                </button>
                            )}
                        </div>
                    )}

                    <button
                        disabled={loading || paymentStage !== 'idle'}
                        className="button-primary mt-8 h-14 w-full gap-3 disabled:opacity-50"
                    >
                        {loading ? 'Preparing Razorpay Gateway…' : <>Pay Securely with Razorpay <IconArrowRight size={16} /></>}
                    </button>
                </form>

                {/* Order Summary Sidebar */}
                <aside className="h-fit border border-gold-500/25 bg-carbon p-6 rounded-sm lg:sticky lg:top-10">
                    <p className="text-[10px] uppercase tracking-[0.3em] font-semibold text-gold-400">Order Summary</p>
                    <div className="mt-4 divide-y divide-gold-500/15">
                        {cart?.items.map((item) => (
                            <article key={item.id} className="grid grid-cols-[60px_1fr_auto] items-center gap-3 py-3">
                                <img src={item.imageUrl || fallbackImage} alt="" className="aspect-square object-cover rounded-sm border border-gold-500/20 bg-obsidian" />
                                <div>
                                    <h4 className="text-xs font-medium text-cream">{item.productName}</h4>
                                    <p className="text-[10px] text-cream/40">{item.quantity} × {item.optionLabel || item.color || item.sku}</p>
                                </div>
                                <strong className="text-xs font-semibold text-gold-300">{rupees(item.lineTotalPaise)}</strong>
                            </article>
                        ))}
                    </div>
                    <div className="mt-6 border-t border-gold-500/20 pt-4 space-y-2 text-xs text-cream/60">
                        <div className="flex justify-between">
                            <span>Items subtotal</span>
                            <span>{rupees(cart?.subtotalPaise || 0)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Taxes</span>
                            <span>{quote?.taxPaise ? rupees(quote.taxPaise) : 'Included in prices'}</span>
                        </div>
                        {quote && quote.discountPaise > 0 && (
                            <div className="flex justify-between text-emerald-400 font-medium">
                                <span>Promo Discount</span>
                                <span>-{rupees(quote.discountPaise)}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-display text-xl text-gold-300 pt-2 border-t border-gold-500/15 font-normal">
                            <span>Total Payable</span>
                            <span>{rupees(quote?.totalPaise ?? cart?.subtotalPaise ?? 0)}</span>
                        </div>
                    </div>
                </aside>
            </main>
        </div>
    );
};
export default CheckoutPage;
