'use client';

import React from 'react';
import { usePath } from '../lib/router';
import Header from './Header';

/**
 * Shown while a storefront route renders on the server. Keeping the header and a page-shaped
 * placeholder on screen makes navigation feel immediate instead of blanking the whole page.
 */
const RouteLoading = () => {
    const pathname = usePath();
    if (pathname.startsWith('/admin')) {
        return (
            <div className="grid min-h-screen place-items-center bg-obsidian text-gold-300" role="status">
                <span className="text-xs uppercase tracking-[0.28em]">Loading…</span>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col bg-obsidian font-body text-cream">
            <Header />
            <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-10 sm:px-8 lg:px-12 lg:py-16" role="status" aria-label="Loading page">
                <div className="h-10 w-64 max-w-full animate-pulse bg-panel" />
                <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, index) => (
                        <div key={index} className="aspect-[4/5] animate-pulse bg-panel" />
                    ))}
                </div>
            </main>
        </div>
    );
};

export default RouteLoading;
