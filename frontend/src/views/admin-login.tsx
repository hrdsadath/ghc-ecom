'use client';

import React, { FormEvent, useState } from 'react';
import { Link, Redirect, useHistory, useLocation } from '../lib/router';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { AppRole } from '../types';
import { IconAlert, IconArrowRight, IconCheckCircle, IconShield } from '../components/Icons';
import { safeInternalPath } from '../lib/navigation';

const staffRoles: AppRole[] = ['ADMIN', 'CATALOGUE_MANAGER', 'WAREHOUSE_MANAGER', 'SUPPORT_AGENT'];

const defaultAdminPath = (roles: AppRole[]) => {
    if (roles.includes('ADMIN')) return '/admin';
    if (roles.includes('CATALOGUE_MANAGER')) return '/admin/catalogue';
    if (roles.includes('WAREHOUSE_MANAGER') || roles.includes('SUPPORT_AGENT')) return '/admin/orders';
    return '/account';
};

const AdminLoginPage = () => {
    const { signedIn, isInitializing, session, sync, signOut } = useAuth();
    const history = useHistory();
    const location = useLocation();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const requestedNext = new URLSearchParams(location.search).get('next');
    const requestedPath = safeInternalPath(requestedNext, '');
    const safeNext = requestedPath === '/admin' || requestedPath.startsWith('/admin/') ? requestedPath : null;
    const roles = session?.roles || [];
    const isStaff = roles.some((role) => staffRoles.includes(role));

    if (isInitializing) {
        return (
            <div className="admin-login grid min-h-screen place-items-center bg-[#f4f1e9] px-6 text-[#252925]" role="status">
                <div className="flex items-center gap-3 text-sm font-semibold">
                    <span className="size-2 animate-pulse rounded-full bg-[#d3912e]" /> Checking your session…
                </div>
            </div>
        );
    }

    if (signedIn && isStaff) return <Redirect to={safeNext || defaultAdminPath(roles)} />;

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);
        setError('');
        const form = new FormData(event.currentTarget);

        try {
            const nextSession = await api.login(String(form.get('email')).trim(), String(form.get('password')));
            if (!nextSession) throw new Error('We could not start an admin session. Please try again.');
            const nextRoles = nextSession.roles || [];
            if (!nextRoles.some((role) => staffRoles.includes(role))) {
                await api.logout();
                sync();
                setError('This account does not have staff access. Use an admin or operations team account.');
                return;
            }
            sync();
            history.replace(safeNext || defaultAdminPath(nextRoles));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Sign-in failed. Check your details and try again.');
        } finally {
            setLoading(false);
        }
    };

    const changeAccount = async () => {
        await signOut();
        setError('');
    };

    return (
        <div className="admin-login min-h-screen bg-[#f4f1e9] font-body text-[#252925] lg:grid lg:grid-cols-[minmax(420px,0.92fr)_minmax(520px,1.08fr)]">
            <aside className="admin-login-visual relative hidden min-h-screen overflow-hidden bg-[#1d211f] p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
                <div className="admin-login-grid" aria-hidden="true" />
                <Link to="/" className="relative z-10 flex w-fit items-center gap-3" aria-label="Glockery storefront">
                    <span className="grid size-11 place-items-center rounded-xl bg-[#f0b44d] text-base font-extrabold text-[#1d211f]">G</span>
                    <span>
                        <span className="block text-sm font-extrabold tracking-[0.15em]">GLOCKERY</span>
                        <span className="block text-[10px] text-white/45">Home Centre</span>
                    </span>
                </Link>

                <div className="relative z-10 max-w-xl pb-8">
                    <p className="mb-5 text-xs font-semibold uppercase tracking-[0.18em] text-[#f0b44d]">Operations desk</p>
                    <h1 className="max-w-lg text-5xl font-bold leading-[1.04] tracking-[-0.045em] xl:text-6xl">Run the store from one calm workspace.</h1>
                    <p className="mt-6 max-w-md text-base leading-7 text-white/58">Manage orders, catalogue, stock and team access with live operational context.</p>
                </div>

                <div className="relative z-10 flex flex-wrap gap-x-7 gap-y-3 border-t border-white/10 pt-6 text-xs text-white/48">
                    <span className="flex items-center gap-2"><IconCheckCircle size={15} color="#f0b44d" /> Role-based access</span>
                    <span className="flex items-center gap-2"><IconCheckCircle size={15} color="#f0b44d" /> Activity recorded</span>
                </div>
            </aside>

            <main className="flex min-h-screen items-center px-5 py-10 sm:px-10 lg:px-14 xl:px-24">
                <div className="mx-auto w-full max-w-md animate-admin-enter">
                    <div className="mb-12 flex items-center justify-between lg:hidden">
                        <Link to="/" className="flex items-center gap-2 text-sm font-extrabold tracking-[0.12em]">
                            <span className="grid size-9 place-items-center rounded-lg bg-[#1d211f] text-xs text-[#f0b44d]">G</span> GLOCKERY
                        </Link>
                        <Link to="/" className="text-xs font-semibold text-[#6b7069] hover:text-[#252925]">Back to store</Link>
                    </div>

                    <div className="mb-8">
                        <span className="mb-5 grid size-12 place-items-center rounded-2xl border border-[#ddd8cd] bg-white text-[#9b671d] shadow-[0_12px_35px_rgba(46,42,33,0.06)]">
                            <IconShield size={22} />
                        </span>
                        <p className="text-xs font-semibold text-[#9b671d]">Staff access</p>
                        <h2 className="mt-2 text-4xl font-bold tracking-[-0.04em]">Welcome back</h2>
                        <p className="mt-3 text-sm leading-6 text-[#6b7069]">Sign in with the account provided by your administrator.</p>
                    </div>

                    {signedIn && !isStaff ? (
                        <div className="rounded-2xl border border-amber-300/70 bg-amber-50 p-5" role="alert">
                            <div className="flex gap-3">
                                <IconAlert size={20} className="mt-0.5 shrink-0 text-amber-700" />
                                <div>
                                    <h3 className="text-sm font-bold text-amber-950">Staff access is not enabled</h3>
                                    <p className="mt-1 text-sm leading-6 text-amber-900/70">{session?.user?.email || 'This account'} is signed in as a customer account.</p>
                                    <button onClick={() => void changeAccount()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#252925] px-4 text-xs font-semibold text-white hover:bg-[#353a35]">
                                        Use a different account <IconArrowRight size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={submit} className="space-y-5">
                            <label className="block" htmlFor="admin-email">
                                <span className="mb-2 block text-sm font-semibold">Work email</span>
                                <input id="admin-email" className="admin-login-field w-full" name="email" type="email" inputMode="email" autoComplete="username" placeholder="name@glockery.in" required autoFocus />
                            </label>

                            <div>
                                <div className="mb-2 flex items-center justify-between">
                                    <label className="text-sm font-semibold" htmlFor="admin-password">Password</label>
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((visible) => !visible)}
                                        className="min-h-8 px-1 text-xs font-medium text-[#7a5a26] hover:text-[#4a3514] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b671d]"
                                        aria-controls="admin-password"
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                        aria-pressed={showPassword}
                                    >
                                        {showPassword ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                                <input id="admin-password" className="admin-login-field w-full" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" minLength={8} maxLength={128} placeholder="Enter your password" required />
                            </div>

                            {error && (
                                <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm leading-5 text-red-800" role="alert">
                                    <IconAlert size={18} className="mt-0.5 shrink-0" /> <span>{error}</span>
                                </div>
                            )}

                            <button disabled={loading} className="flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#252925] px-5 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(30,34,30,0.15)] hover:-translate-y-0.5 hover:bg-[#343934] disabled:cursor-wait disabled:opacity-60">
                                {loading ? 'Signing in…' : 'Sign in to admin'} {!loading && <IconArrowRight size={16} />}
                            </button>
                        </form>
                    )}

                    <div className="mt-8 flex items-start gap-3 border-t border-[#ddd8cd] pt-6 text-xs leading-5 text-[#7a7e77]">
                        <IconShield size={16} className="mt-0.5 shrink-0" />
                        <p>Access is limited to authorized staff. Sign-in activity is recorded for account security.</p>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AdminLoginPage;
