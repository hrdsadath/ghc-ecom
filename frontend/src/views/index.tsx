'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Link } from '../lib/router';
import Header from '../components/Header';
import { IconArrowRight, IconMessageCircle, IconSparkles } from '../components/Icons';
import InstagramReels from '../components/InstagramReels';
import ProductCard from '../components/ProductCard';
import { ProductCardSkeleton } from '../components/Skeleton';
import StoreFooter from '../components/StoreFooter';
import TrustBadges from '../components/TrustBadges';
import { useDailyTheme } from '../hooks/useDailyTheme';
import { api } from '../lib/api';
import { Category, Product } from '../types';

interface HomePageProps {
    initialProducts?: Product[];
    initialCategories?: Category[];
}

const HomePage = ({ initialProducts, initialCategories }: HomePageProps) => {
    const [products, setProducts] = useState<Product[]>(initialProducts ?? []);
    const [categories, setCategories] = useState<Category[]>(initialCategories ?? []);
    const [activeCategory, setActiveCategory] = useState('');
    const [loading, setLoading] = useState(initialProducts === undefined);
    const [error, setError] = useState('');
    const theme = useDailyTheme();

    useEffect(() => {
        if (initialCategories !== undefined) return;
        api.categories()
            .then(setCategories)
            .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load categories.'));
    }, [initialCategories]);

    useEffect(() => {
        if (!activeCategory && initialProducts !== undefined) {
            setProducts(initialProducts);
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        const params = new URLSearchParams({ page: '1', limit: '8' });
        if (activeCategory) params.set('category', activeCategory);

        setLoading(true);
        setError('');
        api.products(params, controller.signal)
            .then((result) => {
                if (!controller.signal.aborted) setProducts(result.items);
            })
            .catch((caught) => {
                if (!controller.signal.aborted) {
                    setError(caught instanceof Error ? caught.message : 'Unable to load products.');
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [activeCategory, initialProducts]);

    const visibleProducts = useMemo(() => products.slice(0, 8), [products]);

    return (
        <div className="flex min-h-screen flex-col bg-obsidian font-body text-cream">
            <Header />

            <main id="main-content" className="flex-1">
                {/* Hero Showcase with Glassmorphism Elevation */}
                <section className="relative mx-auto max-w-[1440px] px-4 pt-4 sm:px-8 sm:pt-8 lg:px-12">
                    <div className="glass-panel relative grid overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-10 lg:grid-cols-12 lg:items-center lg:gap-12 lg:p-14">
                        {/* Ambient Gold Radial Orbs */}
                        <div className="pointer-events-none absolute -right-20 -top-20 size-96 rounded-full bg-gold-400/10 blur-3xl" />
                        <div className="pointer-events-none absolute -bottom-20 -left-20 size-96 rounded-full bg-amber-500/10 blur-3xl" />

                        {/* Hero Text Column */}
                        <div className="relative z-10 lg:col-span-7">
                            <div className="inline-flex items-center gap-2 rounded-full border border-gold-400/30 bg-gold-400/10 px-4 py-1.5 backdrop-blur-md">
                                <IconSparkles size={14} className="text-gold-300" />
                                <span className="text-xs font-semibold tracking-wider uppercase text-gold-300">
                                    Artisanal Tableware & Living
                                </span>
                            </div>

                            <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-cream sm:text-6xl lg:text-7xl">
                                Crockery & homeware{' '}
                                <span className="bg-gradient-to-r from-[#9e7627] via-[#c99738] to-[#795514] bg-clip-text text-transparent">
                                    crafted for elegance.
                                </span>
                            </h1>

                            <p className="mt-6 max-w-lg text-base sm:text-lg leading-relaxed text-cream/75">
                                Crockery and kitchenware for every home. Discover premium dinner sets, tea collections, crystal drinkware, and luxury kitchenware curated from Glockery Home Centre, Vengara.
                            </p>

                            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                                <a
                                    href="#collection"
                                    className="button-primary flex items-center justify-center gap-3 rounded-2xl py-3.5 px-8 text-sm font-semibold shadow-[0_8px_30px_rgba(26,24,21,0.25)]"
                                >
                                    Explore Collections <IconArrowRight size={16} />
                                </a>
                                <a
                                    href="https://wa.me/916282000289"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="glass-pill flex items-center justify-center gap-2 rounded-2xl py-3.5 px-6 text-sm font-semibold text-cream/90 hover:border-gold-500/50 hover:bg-gold-500/10 hover:text-gold-900 shadow-sm"
                                >
                                    <IconMessageCircle size={16} className="text-gold-600" />
                                    Chat with Glockery on WhatsApp
                                </a>
                            </div>

                            {/* Trust Highlights Pills */}
                            <div className="mt-10 flex flex-wrap items-center gap-3 pt-6 border-t border-white/5">
                                <span className="glass-pill rounded-full px-3.5 py-1 text-xs text-cream/70">
                                    ✨ Premium Fine Ceramics
                                </span>
                                <span className="glass-pill rounded-full px-3.5 py-1 text-xs text-cream/70">
                                    🛡️ Shockproof Transit Packing
                                </span>
                                <span className="glass-pill rounded-full px-3.5 py-1 text-xs text-cream/70">
                                    📍 Direct Vengara Storefront
                                </span>
                            </div>
                        </div>

                        {/* Hero Visual Column */}
                        <div className="relative mt-8 lg:mt-0 lg:col-span-5">
                            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-white/10 shadow-[0_20px_50px_rgba(35,30,24,0.12)] sm:aspect-[16/11]">
                                <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-obsidian/40 via-transparent to-transparent" />
                                <Image
                                    src={theme.hero}
                                    alt={theme.heroAlt}
                                    fill
                                    priority
                                    sizes="(min-width: 1024px) 45vw, 100vw"
                                    className="object-cover transition-transform duration-700 hover:scale-105"
                                />
                                <div className="absolute bottom-4 left-4 z-20">
                                    <span className="glass-pill rounded-xl px-3.5 py-1.5 text-xs font-medium text-cream/90 backdrop-blur-md shadow-sm">
                                        Signature Showcase
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Trust Badges Bar */}
                <TrustBadges />

                {/* Collections Section */}
                <section id="collection" className="mx-auto max-w-[1440px] px-4 py-12 sm:px-8 lg:px-12 lg:py-16">
                    <header className="mb-10 flex flex-col gap-6 border-b border-stone-200/80 pb-8 md:flex-row md:items-end md:justify-between">
                        <div>
                            <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold-600">
                                See what’s new in store
                            </span>
                            <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight text-cream sm:text-5xl">
                                Signature Collections
                            </h2>
                            <p className="mt-2 text-sm text-cream/75">
                                Handcrafted dinnerware and kitchen accents available online and in-store.
                            </p>
                        </div>

                        {categories.length > 0 && (
                            <div className="flex max-w-full gap-2.5 overflow-x-auto pb-1" aria-label="Filter products">
                                <button
                                    onClick={() => setActiveCategory('')}
                                    className={`shrink-0 rounded-full px-5 py-2 text-xs sm:text-sm font-medium transition-all ${
                                        !activeCategory
                                            ? 'border border-gold-500/60 bg-gold-500/15 text-gold-700 shadow-sm'
                                            : 'glass-pill text-cream/70 hover:text-cream hover:border-gold-500/30'
                                    }`}
                                >
                                    All Pieces
                                </button>
                                {categories.map((category) => (
                                    <button
                                        key={category.id}
                                        onClick={() => setActiveCategory(category.slug)}
                                        className={`shrink-0 rounded-full px-5 py-2 text-xs sm:text-sm font-medium transition-all ${
                                            activeCategory === category.slug
                                                ? 'border border-gold-500/60 bg-gold-500/15 text-gold-700 shadow-sm'
                                                : 'glass-pill text-cream/70 hover:text-cream hover:border-gold-500/30'
                                        }`}
                                    >
                                        {category.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </header>

                    {loading ? (
                        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4 lg:gap-8" aria-label="Loading products">
                            {Array.from({ length: 8 }).map((_, index) => (
                                <ProductCardSkeleton key={index} />
                            ))}
                        </div>
                    ) : error ? (
                        <div className="glass-panel rounded-2xl p-8 text-center text-sm text-red-600" role="alert">
                            {error}
                        </div>
                    ) : visibleProducts.length ? (
                        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4 lg:gap-8">
                            {visibleProducts.map((product, index) => (
                                <ProductCard key={product.id} product={product} priority={index < 4} />
                            ))}
                        </div>
                    ) : (
                        <div className="glass-panel rounded-3xl py-16 text-center">
                            <h3 className="font-display text-2xl text-cream">No products found in this collection.</h3>
                            <button
                                onClick={() => setActiveCategory('')}
                                className="glass-pill mt-4 rounded-full px-5 py-2 text-sm text-gold-600 hover:text-gold-800"
                            >
                                View all collections
                            </button>
                        </div>
                    )}

                    <div className="mt-14 text-center">
                        <Link
                            to="/search"
                            className="glass-pill inline-flex items-center gap-3 rounded-2xl px-8 py-3.5 text-sm font-semibold text-gold-700 transition-all hover:border-gold-500/50 hover:bg-gold-500/10 hover:text-gold-900 shadow-sm"
                        >
                            Explore Full Catalog <IconArrowRight size={16} />
                        </Link>
                    </div>
                </section>

                {/* Social Showcase */}
                <InstagramReels />

                {/* WhatsApp Concierge Pavilion */}
                <section className="mx-auto max-w-[1440px] px-4 py-14 sm:px-8 lg:px-12 lg:py-20" aria-labelledby="whatsapp-heading">
                    <div className="glass-panel relative overflow-hidden rounded-3xl border border-white/10 p-8 sm:p-12 md:p-16">
                        <div className="pointer-events-none absolute -right-20 -top-20 size-96 rounded-full bg-emerald-500/10 blur-3xl" />
                        <div className="relative z-10 grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
                            <div className="max-w-2xl">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-700">
                                    Direct Store Concierge
                                </span>
                                <h2 id="whatsapp-heading" className="mt-2 font-display text-3xl font-semibold tracking-tight text-cream sm:text-5xl">
                                    Need Personalized Assistance?
                                </h2>
                                <p className="mt-4 text-sm sm:text-base leading-relaxed text-cream/75">
                                    Send us a product screenshot, inquire about custom dinner sets, or check instant in-store stock availability. Our team in Vengara responds promptly.
                                </p>
                            </div>
                            <a
                                href="https://wa.me/916282000289?text=Hi%20Glockery%20Home%20Centre%2C%20I%27d%20like%20help%20choosing%20a%20product."
                                target="_blank"
                                rel="noreferrer"
                                className="button-primary flex items-center justify-center gap-3 rounded-2xl py-4 px-8 text-sm font-semibold shadow-[0_8px_30px_rgba(26,24,21,0.25)] md:min-w-56"
                            >
                                <IconMessageCircle size={20} /> Chat on WhatsApp
                            </a>
                        </div>
                    </div>
                </section>
            </main>

            <StoreFooter />
        </div>
    );
};

export default HomePage;
