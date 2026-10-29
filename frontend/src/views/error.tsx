'use client';

import React from 'react';
import { Link } from '../lib/router';
import Header from '../components/Header';
import StoreFooter from '../components/StoreFooter';
import { IconAlert, IconShield } from '../components/Icons';

interface ErrorPageProps {
    code?: '401' | '403' | '404' | '500';
    title?: string;
    description?: string;
}

export const ErrorPage: React.FC<ErrorPageProps> = ({
    code = '404',
    title,
    description,
}) => {
    const errorDetails = {
        '401': {
            title: title || 'Authentication Required',
            desc: description || 'Please sign in to access your private account or orders.',
            icon: <IconShield size={36} className="text-gold-400" />,
            action: { label: 'Sign In Now', href: '/auth' },
        },
        '403': {
            title: title || 'Access Restricted',
            desc: description || 'You do not have administrative privileges to view this section.',
            icon: <IconShield size={36} className="text-red-400" />,
            action: { label: 'Return to Storefront', href: '/' },
        },
        '404': {
            title: title || 'Page Not Found',
            desc: description || 'The requested page or resource could not be located in our catalogue.',
            icon: <IconAlert size={36} className="text-gold-400" />,
            action: { label: 'Explore Catalogue', href: '/' },
        },
        '500': {
            title: title || 'Internal Service Exception',
            desc: description || 'Our servers encountered an unexpected failure. Please try again shortly.',
            icon: <IconAlert size={36} className="text-red-400" />,
            action: { label: 'Return Home', href: '/' },
        },
    }[code];

    return (
        <div className="relative flex min-h-screen flex-col justify-between overflow-hidden bg-obsidian font-body text-cream">
            {/* Ambient Background Glow Orbs */}
            <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-96 w-96 -translate-x-1/2 rounded-full bg-gold-400/10 blur-[130px]" />

            <Header />
            <main id="main-content" className="flex flex-1 items-center justify-center px-6 py-20">
                <div className="glass-panel-elevated w-full max-w-lg rounded-3xl p-8 text-center sm:p-12">
                    <div className="mx-auto flex size-20 items-center justify-center rounded-3xl border border-gold-400/30 bg-gold-400/10 text-gold-400 shadow-[0_0_25px_rgba(201,163,91,0.15)]">
                        {errorDetails.icon}
                    </div>
                    <span className="glass-pill mt-6 inline-block border-gold-400/30 bg-gold-400/10 px-3.5 py-1 font-mono text-xs font-bold uppercase tracking-[0.24em] text-gold-400">
                        HTTP Error {code}
                    </span>
                    <h1 className="mt-3 font-display text-4xl font-semibold text-cream sm:text-5xl">{errorDetails.title}</h1>
                    <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-cream/65">{errorDetails.desc}</p>
                    <div className="mt-8">
                        <Link
                            to={errorDetails.action.href}
                            className="button-primary inline-block"
                        >
                            {errorDetails.action.label}
                        </Link>
                    </div>
                </div>
            </main>
            <StoreFooter />
        </div>
    );
};
export default ErrorPage;
