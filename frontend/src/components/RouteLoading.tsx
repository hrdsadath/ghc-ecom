'use client';

import React from 'react';
import { usePath } from '../lib/router';
import Header from './Header';
import {
    AccountPageSkeleton,
    CartPageSkeleton,
    CategoryPageSkeleton,
    HomePageSkeleton,
    ProductDetailSkeleton,
    SearchPageSkeleton,
} from './Skeleton';

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

    const renderPageSkeleton = () => {
        if (pathname.startsWith('/product')) {
            return <ProductDetailSkeleton />;
        }
        if (pathname.startsWith('/cart') || pathname.startsWith('/checkout')) {
            return <CartPageSkeleton />;
        }
        if (pathname.startsWith('/category')) {
            return <CategoryPageSkeleton />;
        }
        if (pathname.startsWith('/search')) {
            return <SearchPageSkeleton />;
        }
        if (pathname.startsWith('/account') || pathname.startsWith('/auth')) {
            return <AccountPageSkeleton />;
        }
        return <HomePageSkeleton />;
    };

    return (
        <div className="flex min-h-screen flex-col bg-obsidian font-body text-cream">
            <Header />
            <main className="flex-1" role="status" aria-label="Loading page">
                {renderPageSkeleton()}
            </main>
        </div>
    );
};

export default RouteLoading;
