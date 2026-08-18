'use client';

import React, { useEffect, useState } from 'react';
import { Link } from '../lib/router';
import Header from '../components/Header';
import StoreFooter from '../components/StoreFooter';
import ProductCard from '../components/ProductCard';
import SEOHead from '../components/SEOHead';
import { useWishlist } from '../contexts/WishlistContext';
import { api } from '../lib/api';
import { Product } from '../types';

const WishlistPage = () => {
    const { wishlistIds } = useWishlist();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.products(new URLSearchParams({ limit: '100' }))
            .then((result) => setProducts(result.items.filter((product) => wishlistIds.includes(product.id))))
            .catch(() => setProducts([]))
            .finally(() => setLoading(false));
    }, [wishlistIds]);

    return (
        <div className="min-h-screen bg-obsidian text-cream flex flex-col justify-between font-body">
            <SEOHead title="Wishlist | Glockery" noIndex />
            <Header />
            <main id="main-content" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-8 lg:px-12 lg:py-16">
                <header className="mb-12 border-y border-line py-9 sm:py-11">
                    <span className="eyebrow">Wishlist</span>
                    <h1 className="mt-2 font-display text-4xl font-semibold text-cream sm:text-5xl lg:text-7xl">Saved for later.</h1>
                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-cream/60">
                        Keep the pieces that caught your eye close by. Your wishlist is stored securely on this device.
                    </p>
                </header>

                {loading ? (
                    <div className="text-center py-20 text-cream/40 font-mono text-xs">Loading your edit…</div>
                ) : !products.length ? (
                    <div className="border border-line bg-carbon/45 py-20 text-center">
                        <h2 className="font-display text-3xl font-semibold text-cream">Nothing saved yet.</h2>
                        <p className="mt-3 text-xs text-cream/50">Start with a piece that makes the room feel different.</p>
                        <Link to="/" className="button-primary mt-8">
                            Explore collection
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {products.map((product) => (
                            <ProductCard key={product.id} product={product} />
                        ))}
                    </div>
                )}
            </main>
            <StoreFooter />
        </div>
    );
};

export default WishlistPage;
