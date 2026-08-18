'use client';

import React from 'react';
import { Link } from '../lib/router';
import Header from '../components/Header';
import SEOHead from '../components/SEOHead';
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
        <div className="min-h-screen bg-obsidian text-cream flex flex-col justify-between">
            <SEOHead title={`${code} - ${errorDetails.title} | Glockery`} noIndex />
            <Header />
            <main id="main-content" className="flex flex-1 items-center justify-center px-6 py-20">
                <div className="w-full max-w-lg border border-line bg-carbon p-8 text-center sm:p-10">
                    <div className="mx-auto flex size-20 items-center justify-center border border-gold-500/30 bg-gold-500/10">
                        {errorDetails.icon}
                    </div>
                    <span className="mt-6 block font-mono text-xs font-bold uppercase tracking-[0.3em] text-gold-400">
                        HTTP Error {code}
                    </span>
                    <h1 className="mt-2 font-display text-4xl font-semibold text-cream sm:text-5xl">{errorDetails.title}</h1>
                    <p className="mt-3 text-xs leading-relaxed text-cream/60">{errorDetails.desc}</p>
                    <div className="mt-8">
                        <Link
                            to={errorDetails.action.href}
                            className="button-primary"
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
