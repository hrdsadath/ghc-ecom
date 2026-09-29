'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Link, useHistory, useLocation } from '../lib/router';
import Header from '../components/Header';
import StoreFooter from '../components/StoreFooter';
import { IconAlert, IconRefresh } from '../components/Icons';
import { useCart } from '../contexts/CartContext';
import { api, clearPendingPayment, readPendingPayment } from '../lib/api';
import { Order } from '../types';

type Outcome = 'success' | 'failed' | 'pending';

const POLL_INTERVAL_MS = 3_000;
const MAX_AUTOMATIC_POLLS = 10;

const readOutcome = (value: string | null): Outcome =>
    value === 'success' || value === 'failed' ? value : 'pending';

const isUuid = (value: string | null): value is string =>
    Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));

const isGatewayOrderId = (value: string | null): value is string => Boolean(value && /^[A-Za-z0-9]{1,20}$/.test(value));

type StatusLookup = { orderId: string } | { hdfcOrderId: string };

/**
 * `?order=<uuid>` from our own links, `?order_id=…` from the SmartGateway return URL,
 * or the order this tab sent to SmartGateway when the return carried no parameters.
 */
const readLookup = (params: URLSearchParams, pendingOrderId: string | null): StatusLookup | null => {
    const orderId = params.get('order');
    if (isUuid(orderId)) return { orderId };
    const hdfcOrderId = params.get('order_id');
    if (isGatewayOrderId(hdfcOrderId)) return { hdfcOrderId };
    if (isUuid(pendingOrderId)) return { orderId: pendingOrderId };
    return null;
};

/**
 * Landing page for the HDFC SmartGateway return URL. SmartGateway sends the customer
 * here with `?order_id=…&status=…`; those parameters are only a hint. The order status
 * from the API (which checks SmartGateway server-to-server) is the source of truth
 * and is polled while the bank confirmation is still pending.
 */
export const PaymentResultPage = () => {
    const history = useHistory();
    const { search } = useLocation();
    const { resetCart } = useCart();
    const params = new URLSearchParams(search);
    // sessionStorage is client-only; read it after hydration so server and client render the same.
    const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
    const [storageRead, setStorageRead] = useState(false);
    const lookup = readLookup(params, pendingOrderId);
    const lookupKey = lookup ? JSON.stringify(lookup) : null;
    const hint = readOutcome(params.get('outcome'));
    const [status, setStatus] = useState<'checking' | 'pending' | 'failed'>('checking');
    const [error, setError] = useState('');
    const polls = useRef(0);
    const isMounted = useRef(false);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    useEffect(() => {
        setPendingOrderId(readPendingPayment());
        setStorageRead(true);
    }, []);

    useEffect(() => {
        if (!storageRead) return;
        if (!lookup) {
            // Without an order to check we cannot say the payment failed; point to order tracking instead.
            setStatus(hint === 'failed' ? 'failed' : 'pending');
            return;
        }
        let timer: ReturnType<typeof setTimeout> | undefined;

        const check = async () => {
            try {
                const order: Order = await api.hdfcPaymentStatus(lookup);
                if (!isMounted.current) return;
                if (order.status === 'PAYMENT_PENDING') {
                    polls.current += 1;
                    if (polls.current < MAX_AUTOMATIC_POLLS) {
                        timer = setTimeout(check, POLL_INTERVAL_MS);
                    } else {
                        setStatus('pending');
                    }
                    return;
                }
                if (order.status === 'PAYMENT_FAILED' || order.status === 'CANCELLED') {
                    setStatus('failed');
                    return;
                }
                clearPendingPayment();
                resetCart();
                history.replace(`/order-confirmation/${order.id}`);
            } catch (caught) {
                if (!isMounted.current) return;
                setError(caught instanceof Error ? caught.message : 'Payment status could not be checked.');
                setStatus('pending');
            }
        };

        void check();
        return () => {
            if (timer) clearTimeout(timer);
        };
        // resetCart/history are stable; re-running on them would restart polling.
    }, [lookupKey, storageRead]);

    const retry = () => {
        polls.current = 0;
        setError('');
        setStatus('checking');
        api.hdfcPaymentStatus(lookup!)
            .then((order) => {
                if (!isMounted.current) return;
                if (order.status === 'PAYMENT_PENDING') {
                    setStatus('pending');
                } else if (order.status === 'PAYMENT_FAILED' || order.status === 'CANCELLED') {
                    setStatus('failed');
                } else {
                    clearPendingPayment();
                    resetCart();
                    history.replace(`/order-confirmation/${order.id}`);
                }
            })
            .catch((caught) => {
                if (!isMounted.current) return;
                setError(caught instanceof Error ? caught.message : 'Payment status could not be checked.');
                setStatus('pending');
            });
    };

    const failed = status === 'failed';

    return (
        <div className="min-h-screen bg-obsidian text-cream flex flex-col justify-between font-body">
            <Header />
            <main id="main-content" className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-8 lg:py-16">
                {status === 'checking' ? (
                    <div className="border border-line bg-carbon p-8 text-center sm:p-12" role="status" aria-live="polite">
                        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-gold-400/10 text-gold-300">
                            <IconRefresh size={28} className="animate-spin" />
                        </div>
                        <h1 className="mt-5 font-display text-3xl">Confirming your payment</h1>
                        <p className="mt-3 text-xs text-cream/60">
                            We are waiting for your bank to confirm the transaction. Please do not close this page or pay again.
                        </p>
                    </div>
                ) : failed ? (
                    <div className="border border-amber-500/30 bg-amber-950/20 p-8 text-center sm:p-12">
                        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-400/10 text-amber-300">
                            <IconAlert size={28} />
                        </div>
                        <h1 className="mt-5 font-display text-3xl text-amber-200">Payment not completed</h1>
                        <p className="mt-3 text-xs text-cream/60">
                            Your bank did not confirm this payment and nothing has been charged. Your bag has been kept so you can try again.
                        </p>
                        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                            <Link to="/checkout" className="button-primary h-12 px-6">Retry payment</Link>
                            <Link to="/cart" className="inline-flex h-12 items-center justify-center border border-line px-6 text-xs font-bold uppercase tracking-[0.14em] text-cream/70">Review bag</Link>
                        </div>
                    </div>
                ) : (
                    <div className="border border-line bg-carbon p-8 text-center sm:p-12">
                        <h1 className="font-display text-3xl">Payment confirmation pending</h1>
                        <p className="mt-3 text-xs text-cream/60">
                            Your bank has not sent the final confirmation yet. If money was debited, the order will be confirmed automatically
                            once the bank responds — you do not need to pay again.
                        </p>
                        {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
                        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                            {lookup && (
                                <button type="button" onClick={retry} className="button-primary h-12 px-6 gap-2">
                                    <IconRefresh size={16} /> Check again
                                </button>
                            )}
                            <Link to="/order-lookup" className="inline-flex h-12 items-center justify-center border border-line px-6 text-xs font-bold uppercase tracking-[0.14em] text-cream/70">Track my order</Link>
                        </div>
                    </div>
                )}
            </main>
            <StoreFooter />
        </div>
    );
};

export default PaymentResultPage;
