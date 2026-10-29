'use client';

import React, { FormEvent, useState } from 'react';
import { Link, Redirect, useHistory, useLocation } from '../lib/router';
import { isStaffSession, useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { api, getCartIdentity, saveCartIdentity } from '../lib/api';
import { safeInternalPath } from '../lib/navigation';

const AuthPage = () => {
    const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const { signedIn, isStaff, sync } = useAuth();
    const cartContext = useCart();
    const history = useHistory();
    const location = useLocation();
    const requestedNext = new URLSearchParams(location.search).get('next');
    const nextPath = safeInternalPath(requestedNext, '/account');

    if (isStaff) return <Redirect to="/admin" />;
    if (signedIn) return <Redirect to={nextPath} />;

    const changeMode = (nextMode: typeof mode) => {
        setMode(nextMode);
        setShowPassword(false);
        setError('');
        setNotice('');
    };

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);
        setError('');
        setNotice('');
        const form = new FormData(event.currentTarget);
        try {
            if (mode === 'forgot') {
                await api.forgotPassword(String(form.get('email')));
                setNotice('If an account exists, password reset instructions have been sent.');
                return;
            }
            const guestItems = cartContext.cart?.items || [];
            const guestIdentity = getCartIdentity();
            const session = mode === 'login'
                ? await api.login(String(form.get('email')), String(form.get('password')))
                : await api.register(String(form.get('name')), String(form.get('email')), String(form.get('password')));
            if (!session) {
                setNotice('Check your email to confirm the account, then sign in.');
                return;
            }
            if (isStaffSession(session)) {
                // Staff accounts are not store accounts: send them to their workspace, no cart merge.
                sync();
                history.replace('/admin');
                return;
            }
            if (guestIdentity?.guestToken) {
                saveCartIdentity(null);
                const created = await api.createCart();
                saveCartIdentity({ cartId: created.cart.id });
                const currentQuantities = new Map(created.cart.items.map((item) => [item.variantId, item.quantity]));
                const failedItems: string[] = [];
                for (const item of guestItems) {
                    try {
                        const quantity = Math.min(99, (currentQuantities.get(item.variantId) || 0) + item.quantity);
                        await api.setCartItem(created.cart.id, item.variantId, quantity);
                        currentQuantities.set(item.variantId, quantity);
                    } catch {
                        failedItems.push(item.productName);
                    }
                }
                if (failedItems.length) {
                    setNotice(`Signed in, but ${failedItems.length} bag item(s) could not be merged because availability changed.`);
                }
            }
            sync();
            await cartContext.refreshCart();
            history.replace(nextPath);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Authentication failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen bg-obsidian font-body text-cream overflow-hidden">
            {/* Ambient Background Orbs */}
            <div className="pointer-events-none absolute -left-40 top-1/4 size-[500px] rounded-full bg-gold-400/5 blur-[120px]" />
            <div className="pointer-events-none absolute -right-40 bottom-1/4 size-[500px] rounded-full bg-amber-500/5 blur-[120px]" />

            {/* Header */}
            <header className="glass-panel relative z-20 flex h-20 items-center justify-between border-b border-white/10 px-6 sm:px-10">
                <Link to="/" className="text-sm font-bold tracking-[0.2em] text-cream sm:text-base">
                    GLOCKERY
                </Link>
                <Link to="/" className="glass-pill rounded-full px-4 py-1.5 text-xs text-cream/70 hover:text-white transition">
                    Return to Store
                </Link>
            </header>

            {/* Auth Pavilion Card */}
            <main className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-lg items-center px-4 py-12">
                <div className="glass-panel w-full rounded-3xl border border-white/10 p-8 sm:p-12 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)]">
                    {/* Mode Pill Switcher */}
                    <div className="glass-pill mb-8 flex rounded-full p-1 border-white/10 bg-white/5">
                        <button
                            type="button"
                            onClick={() => changeMode('login')}
                            className={`flex-1 rounded-full py-2.5 text-xs sm:text-sm font-medium transition-all ${
                                mode === 'login' || mode === 'forgot'
                                    ? 'bg-gold-400 text-obsidian shadow-md font-semibold'
                                    : 'text-cream/60 hover:text-cream'
                            }`}
                        >
                            Sign In
                        </button>
                        <button
                            type="button"
                            onClick={() => changeMode('register')}
                            className={`flex-1 rounded-full py-2.5 text-xs sm:text-sm font-medium transition-all ${
                                mode === 'register'
                                    ? 'bg-gold-400 text-obsidian shadow-md font-semibold'
                                    : 'text-cream/60 hover:text-cream'
                            }`}
                        >
                            Create account
                        </button>
                    </div>

                    <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                        {mode === 'forgot' ? 'Reset Password' : mode === 'login' ? 'Welcome Back' : 'Begin Your Collection'}
                    </h1>
                    <p className="mt-2 text-xs sm:text-sm text-cream/65 leading-relaxed">
                        {mode === 'forgot'
                            ? 'Enter your email address and we’ll send secure reset instructions.'
                            : mode === 'login'
                            ? 'Access saved addresses, past orders, and your personal wishlist.'
                            : 'Begin your collection. Join Glockery Home Centre for faster checkout and order tracking.'}
                    </p>

                    <form onSubmit={submit} className="mt-8 space-y-4">
                        {mode === 'register' && (
                            <label className="block">
                                <span className="mb-1.5 block text-xs text-cream/70 font-medium">Full Name</span>
                                <input className="field h-12 w-full rounded-xl text-sm border-white/10 bg-white/5" name="name" autoComplete="name" required />
                            </label>
                        )}
                        <label className="block">
                            <span className="mb-1.5 block text-xs text-cream/70 font-medium">Email Address</span>
                            <input className="field h-12 w-full rounded-xl text-sm border-white/10 bg-white/5" name="email" type="email" autoComplete="email" required />
                        </label>
                        {mode !== 'forgot' && (
                            <div>
                                <div className="mb-1.5 flex items-center justify-between">
                                    <label className="text-xs text-cream/70 font-medium" htmlFor="customer-password">Password</label>
                                    <button
                                        type="button"
                                        className="text-xs text-gold-300 hover:text-gold-100 transition"
                                        aria-controls="customer-password"
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        aria-pressed={showPassword}
                                        onClick={() => setShowPassword((visible) => !visible)}
                                    >
                                        {showPassword ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                                <input
                                    id="customer-password"
                                    className="field h-12 w-full rounded-xl text-sm border-white/10 bg-white/5"
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                    minLength={mode === 'login' ? 8 : 12}
                                    maxLength={128}
                                    required
                                />
                                {mode === 'register' && <small className="mt-1.5 block text-[11px] text-cream/50">Must contain at least 12 characters.</small>}
                            </div>
                        )}

                        {error && (
                            <div className="glass-panel rounded-xl border-red-500/30 p-3.5 text-xs text-red-200" role="alert">
                                {error}
                            </div>
                        )}
                        {notice && (
                            <div className="glass-panel rounded-xl border-emerald-500/30 p-3.5 text-xs text-emerald-200" role="status">
                                {notice}
                            </div>
                        )}

                        <button
                            disabled={loading}
                            className="button-primary mt-6 flex h-13 w-full items-center justify-center rounded-2xl text-sm font-semibold shadow-[0_8px_30px_rgba(212,175,55,0.25)] disabled:opacity-50"
                        >
                            {loading ? 'Please wait…' : mode === 'forgot' ? 'Send Reset Link' : mode === 'login' ? 'Sign In' : 'Create Account'}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <button
                            type="button"
                            className="text-xs text-cream/60 hover:text-gold-300 transition"
                            onClick={() => changeMode(mode === 'forgot' ? 'login' : 'forgot')}
                        >
                            {mode === 'forgot' ? '← Back to Sign In' : 'Forgot your password?'}
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AuthPage;
