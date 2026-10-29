'use client';

import React, { useEffect, useState } from 'react';
import { Link } from '../lib/router';
import Header from '../components/Header';
import StoreFooter from '../components/StoreFooter';
import ProductCard from '../components/ProductCard';
import { ProductCardSkeleton } from '../components/Skeleton';
import TrustBadges from '../components/TrustBadges';
import { useWishlist } from '../contexts/WishlistContext';
import { api } from '../lib/api';
import { Product } from '../types';

const WishlistPage = () => {
    const { wishlistIds } = useWishlist();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!wishlistIds.length) {
            setProducts([]);
            setLoading(false);
            return;
        }
        api.productsByIds(wishlistIds)
            .then(setProducts)
            .catch(() => setProducts([]))
            .finally(() => setLoading(false));
    }, [wishlistIds]);

    return (
        <div className="min-h-screen bg-obsidian text-cream flex flex-col justify-between font-body">
            <Header />
            <main id="main-content" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
                {/* Glass Wishlist Header */}
                <header className="glass-panel relative mb-10 overflow-hidden rounded-3xl border border-stone-200/80 p-6 sm:p-10">
                    <div className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-gold-400/10 blur-3xl" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold-600">
                        Personal Sanctuary
                    </span>
                    <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-cream sm:text-5xl lg:text-6xl">
                        Your Saved Pieces
                    </h1>
                    <p className="mt-3 max-w-xl text-xs sm:text-sm leading-relaxed text-cream/75">
                        Keep the crockery, dinner sets, and kitchenware that caught your eye saved for your next order.
                    </p>
                </header>

                {loading ? (
                    <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4 lg:gap-8">
                        {Array.from({ length: 4 }).map((_, idx) => (
                            <ProductCardSkeleton key={idx} />
                        ))}
                    </div>
                ) : !products.length ? (
                    <div className="glass-panel rounded-3xl py-16 text-center">
                        <h2 className="font-display text-2xl font-semibold text-cream">Nothing saved yet</h2>
                        <p className="mt-2 text-xs sm:text-sm text-cream/60">
                            Explore our artisanal collections to discover pieces that transform your dining table.
                        </p>
                        <Link to="/" className="button-primary mx-auto mt-6 rounded-xl py-3 px-6 text-sm">
                            Explore Collections
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4 lg:gap-8">
                        {products.map((product) => (
                            <ProductCard key={product.id} product={product} />
                        ))}
                    </div>
                )}
            </main>

            <TrustBadges />
            <StoreFooter />
        </div>
    );
};

export default WishlistPage;
