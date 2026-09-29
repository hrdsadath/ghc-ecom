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
        <div className="min-h-screen bg-obsidian font-body text-cream">
            <header className="flex h-16 items-center justify-between border-b border-line px-5 sm:px-8">
                <Link to="/" className="text-base font-bold tracking-[0.18em]">GLOCKERY</Link>
                <Link to="/" className="text-sm text-cream/65 hover:text-cream">Return to shop</Link>
            </header>

            <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center px-5 py-12">
                <div className="w-full">
                    <div className="mb-9 flex border-b border-line">
                        <button onClick={() => changeMode('login')} className={`min-h-12 flex-1 border-b text-sm font-semibold ${mode === 'login' || mode === 'forgot' ? 'border-gold-400 text-cream' : 'border-transparent text-cream/60'}`}>Sign in</button>
                        <button onClick={() => changeMode('register')} className={`min-h-12 flex-1 border-b text-sm font-semibold ${mode === 'register' ? 'border-gold-400 text-cream' : 'border-transparent text-cream/60'}`}>Create account</button>
                    </div>

                    <h1 className="font-display text-4xl font-semibold tracking-[-0.02em]">
                        {mode === 'forgot' ? 'Reset your password.' : mode === 'login' ? 'Welcome back.' : 'Begin your collection.'}
                    </h1>
                    <p className="mt-2 text-sm text-cream/65">
                        {mode === 'forgot' ? 'Enter your email and we’ll send reset instructions.' : mode === 'login' ? 'Sign in to view orders and saved addresses.' : 'Create an account to manage orders and addresses.'}
                    </p>

                    <form onSubmit={submit} className="mt-8 space-y-5">
                        {mode === 'register' && (
                            <label className="block">
                                <span className="mb-2 block text-sm">Full name</span>
                                <input className="field w-full text-sm" name="name" autoComplete="name" required />
                            </label>
                        )}
                        <label className="block">
                            <span className="mb-2 block text-sm">Email address</span>
                            <input className="field w-full text-sm" name="email" type="email" autoComplete="email" required />
                        </label>
                        {mode !== 'forgot' && (
                            <div>
                                <div className="mb-2 flex items-center justify-between">
                                    <label className="text-sm" htmlFor="customer-password">Password</label>
                                    <button
                                        type="button"
                                        className="min-h-8 px-1 text-xs font-semibold text-gold-300 hover:text-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                                        aria-controls="customer-password"
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        aria-pressed={showPassword}
                                        onClick={() => setShowPassword((visible) => !visible)}
                                    >
                                        {showPassword ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                                <input id="customer-password" className="field w-full text-sm" name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? 8 : 12} maxLength={128} required />
                                {mode === 'register' && <small className="mt-2 block text-xs text-cream/60">Use at least 12 characters.</small>}
                            </div>
                        )}

                        {error && <p className="border border-red-500/30 p-3 text-sm text-red-200" role="alert">{error}</p>}
                        {notice && <p className="border border-line p-3 text-sm text-cream" role="status">{notice}</p>}

                        <button disabled={loading} className="button-primary w-full disabled:opacity-50">
                            {loading ? 'Please wait…' : mode === 'forgot' ? 'Send reset link' : mode === 'login' ? 'Sign in' : 'Create account'}
                        </button>
                    </form>

                    <button type="button" className="mt-6 min-h-11 text-sm text-cream/65 hover:text-cream" onClick={() => changeMode(mode === 'forgot' ? 'login' : 'forgot')}>
                        {mode === 'forgot' ? 'Back to sign in' : 'Forgot password?'}
                    </button>
                </div>
            </main>
        </div>
    );
};

export default AuthPage;
