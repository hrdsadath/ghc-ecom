'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import { Link } from '../lib/router';
import Header from '../components/Header';
import { IconShieldCheck } from '../components/Icons';
import StoreFooter from '../components/StoreFooter';
import { api } from '../lib/api';

interface RecoveryCredentials {
    accessToken: string;
    refreshToken: string;
}

function consumeRecoveryCredentials(): RecoveryCredentials {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const credentials = {
        accessToken: fragment.get('access_token') ?? '',
        refreshToken: fragment.get('refresh_token') ?? '',
    };
    window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
    return credentials;
}

export const ResetPasswordPage = () => {
    const [recovery, setRecovery] = useState<RecoveryCredentials>({ accessToken: '', refreshToken: '' });
    const [recoveryReady, setRecoveryReady] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        setRecovery(consumeRecoveryCredentials());
        setRecoveryReady(true);
    }, []);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!recovery.accessToken || !recovery.refreshToken) {
            setError('This password recovery link is invalid or expired.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        if (password.length < 12) {
            setError('Password must be at least 12 characters.');
            return;
        }
        setLoading(true);
        setError('');

        try {
            await api.resetPassword(recovery.accessToken, recovery.refreshToken, password);
            setSuccess(true);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Password reset failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col justify-between bg-obsidian text-cream">
            <Header />
            <main id="main-content" className="flex flex-1 items-center justify-center px-6 py-20">
                <div className="w-full max-w-md border border-line bg-carbon p-8">
                    <div className="mb-6 border-b border-gold-500/20 pb-4">
                        <span className="eyebrow">Account security</span>
                        <h1 className="mt-1 font-display text-4xl font-semibold text-cream">Create a new password</h1>
                    </div>

                    {success ? (
                        <div className="rounded-sm border border-emerald-500/30 bg-emerald-950/30 p-6 text-center">
                            <IconShieldCheck size={32} color="#10B981" className="mx-auto mb-3" />
                            <h2 className="font-display text-xl text-emerald-300">Password updated</h2>
                            <p className="mt-2 text-xs text-cream/70">All existing sessions were revoked. Sign in again with your new password.</p>
                            <Link to="/auth" className="mt-5 inline-flex h-11 items-center bg-gold-400 px-6 text-xs font-bold uppercase tracking-wider text-obsidian">Sign in</Link>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {recoveryReady && (!recovery.accessToken || !recovery.refreshToken) && (
                                <p className="rounded-sm border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-200" role="alert">
                                    This password recovery link is invalid or expired. Request a new link.
                                </p>
                            )}
                            {error && <p className="rounded-sm border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-200" role="alert">{error}</p>}
                            <label className="block">
                                <span className="mb-2 block text-xs text-cream/60">New password</span>
                                <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="field h-12 w-full text-sm" required minLength={12} maxLength={128} />
                            </label>
                            <label className="block">
                                <span className="mb-2 block text-xs text-cream/60">Confirm new password</span>
                                <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="field h-12 w-full text-sm" required minLength={12} maxLength={128} />
                            </label>
                            <button disabled={!recoveryReady || loading || !recovery.accessToken || !recovery.refreshToken} className="button-primary w-full disabled:opacity-50">
                                {loading ? 'Updating password…' : 'Set new password'}
                            </button>
                        </form>
                    )}
                </div>
            </main>
            <StoreFooter />
        </div>
    );
};

export default ResetPasswordPage;
