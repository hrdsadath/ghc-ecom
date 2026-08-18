'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Link } from '../lib/router';
import Header from '../components/Header';
import { IconArrowRight, IconMessageCircle } from '../components/Icons';
import InstagramReels from '../components/InstagramReels';
import ProductCard from '../components/ProductCard';
import SEOHead from '../components/SEOHead';
import StoreFooter from '../components/StoreFooter';
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
            <SEOHead structuredData={{
                '@context': 'https://schema.org',
                '@type': 'HomeGoodsStore',
                name: 'Glockery Home Centre',
                description: 'Premium crockery and kitchenware in Vengara, Malappuram.',
                telephone: '+91 6282000289',
                address: {
                    '@type': 'PostalAddress',
                    streetAddress: 'Home Centre, Near ICICI Bank',
                    addressLocality: 'Vengara',
                    addressRegion: 'Kerala',
                    postalCode: '676304',
                    addressCountry: 'IN',
                },
                sameAs: ['https://www.instagram.com/glockery_home_centre/'],
            }} />
            <Header />

            <main id="main-content" className="flex-1">
                <section className="mx-auto grid max-w-[1440px] lg:grid-cols-2">
                    <div className="flex min-h-[360px] items-center px-6 py-12 sm:min-h-[420px] sm:px-8 lg:min-h-[600px] lg:px-12">
                        <div className="max-w-xl">
                            <h1 className="font-display text-4xl font-semibold leading-[0.98] tracking-[-0.03em] text-cream sm:text-6xl lg:text-7xl">
                                Crockery and kitchenware for every home.
                            </h1>
                            <p className="mt-6 max-w-md text-base leading-7 text-cream/70">
                                Shop dinner sets, tea sets, serving dishes, canisters and more from our Vengara store.
                            </p>
                            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
                                <a href="#collection" className="button-primary gap-3">Shop products <IconArrowRight size={16} /></a>
                                <a href="https://wa.me/916282000289" target="_blank" rel="noreferrer" className="min-h-11 content-center text-sm font-semibold text-gold-300 hover:text-gold-100">WhatsApp us</a>
                            </div>
                        </div>
                    </div>
                    <div className="relative min-h-[320px] bg-panel sm:min-h-[420px] lg:min-h-[600px]">
                        <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-obsidian/55 to-transparent" />
                        <Image
                            src={theme.hero}
                            alt={theme.heroAlt}
                            fill
                            priority
                            sizes="(min-width: 1024px) 50vw, 100vw"
                            className="relative z-0 object-cover"
                        />
                    </div>
                </section>

                <section id="collection" className="mx-auto max-w-[1440px] px-4 py-14 sm:px-8 lg:px-12 lg:py-20">
                    <header className="mb-8 flex flex-col gap-5 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
                        <div>
                            <h2 className="font-display text-3xl font-semibold tracking-[-0.02em] text-cream sm:text-5xl">Shop our collections</h2>
                            <p className="mt-2 text-sm text-cream/65">Available online and at Glockery Home Centre, Vengara.</p>
                        </div>
                        {categories.length > 0 && (
                            <div className="flex max-w-full gap-5 overflow-x-auto" aria-label="Filter products">
                                <button
                                    onClick={() => setActiveCategory('')}
                                    className={`shrink-0 rounded-full px-4 py-2 text-sm ${!activeCategory ? 'border border-gold-400 bg-gold-500/10 text-cream' : 'border border-transparent text-cream/60 hover:text-cream hover:border-line'}`}
                                >
                                    All
                                </button>
                                {categories.map((category) => (
                                    <button
                                        key={category.id}
                                        onClick={() => setActiveCategory(category.slug)}
                                        className={`shrink-0 rounded-full px-4 py-2 text-sm ${activeCategory === category.slug ? 'border border-gold-400 bg-gold-500/10 text-cream' : 'border border-transparent text-cream/60 hover:text-cream hover:border-line'}`}
                                    >
                                        {category.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </header>

                    {loading ? (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4" aria-label="Loading products">
                            {Array.from({ length: 8 }).map((_, index) => <div key={index} className="aspect-[4/5] animate-pulse bg-panel" />)}
                        </div>
                    ) : error ? (
                        <div className="border border-line p-8 text-sm text-red-200" role="alert">{error}</div>
                    ) : visibleProducts.length ? (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4 lg:gap-y-14">
                            {visibleProducts.map((product, index) => <ProductCard key={product.id} product={product} priority={index < 4} />)}
                        </div>
                    ) : (
                        <div className="border-y border-line bg-carbon/50 py-16 text-center">
                            <h3 className="font-display text-3xl text-cream">No products found.</h3>
                            <button onClick={() => setActiveCategory('')} className="mt-4 text-sm text-gold-300">View all products</button>
                        </div>
                    )}

                    <div className="mt-12 text-center">
                        <Link to="/search" className="button-secondary">View all products</Link>
                    </div>
                </section>

                <InstagramReels />

                <section className="mx-auto max-w-[1440px] px-4 py-14 sm:px-8 lg:px-12 lg:py-20" aria-labelledby="whatsapp-heading">
                    <div className="grid gap-7 border-y border-line py-10 md:grid-cols-[1fr_auto] md:items-center md:py-12">
                        <div className="max-w-2xl">
                            <p className="text-sm text-cream/60">Need help choosing?</p>
                            <h2 id="whatsapp-heading" className="mt-2 font-display text-3xl font-semibold tracking-[-0.02em] text-cream sm:text-5xl">Chat with Glockery on WhatsApp</h2>
                            <p className="mt-4 max-w-xl text-sm leading-7 text-cream/70">Send us a product screenshot or tell us what you need. We’ll help you check availability and place your order.</p>
                        </div>
                        <a
                            href="https://wa.me/916282000289?text=Hi%20Glockery%20Home%20Centre%2C%20I%27d%20like%20help%20choosing%20a%20product."
                            target="_blank"
                            rel="noreferrer"
                            className="button-primary gap-3 md:min-w-52"
                        >
                            <IconMessageCircle size={18} /> Chat on WhatsApp
                        </a>
                    </div>
                </section>
            </main>

            <StoreFooter />
        </div>
    );
};

export default HomePage;
