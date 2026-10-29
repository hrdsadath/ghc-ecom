'use client';

import React, { useEffect, useState } from 'react';
import { Link, useHistory, useLocation, useParams } from '../lib/router';
import Header from '../components/Header';
import Pagination from '../components/Pagination';
import ProductCard from '../components/ProductCard';
import { ProductCardSkeleton } from '../components/Skeleton';
import StoreFooter from '../components/StoreFooter';
import TrustBadges from '../components/TrustBadges';
import { api } from '../lib/api';
import { titleCase } from '../lib/commerce';
import { PaginatedProducts, Product } from '../types';

const PAGE_SIZE = 24;

interface CategoryPageProps {
    initialData?: PaginatedProducts;
    initialCategoryId?: string;
    initialPage?: number;
}

const CategoryPage = ({ initialData, initialCategoryId, initialPage }: CategoryPageProps) => {
    const { categoryId } = useParams<{ categoryId: string }>();
    const location = useLocation();
    const history = useHistory();
    const parsedPage = Number(new URLSearchParams(location.search).get('page'));
    const currentPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const hasMatchingInitialData = Boolean(
        initialData && initialCategoryId === categoryId && initialPage === currentPage,
    );
    const [products, setProducts] = useState<Product[]>(hasMatchingInitialData ? initialData!.items : []);
    const [total, setTotal] = useState(hasMatchingInitialData ? initialData!.total : 0);
    const [loading, setLoading] = useState(!hasMatchingInitialData);
    const [error, setError] = useState('');
    const [retryKey, setRetryKey] = useState(0);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    useEffect(() => {
        if (retryKey === 0 && initialData && initialCategoryId === categoryId && initialPage === currentPage) {
            setProducts(initialData.items);
            setTotal(initialData.total);
            setLoading(false);
            setError('');
            return;
        }
        const controller = new AbortController();
        const params = new URLSearchParams({
            page: String(currentPage),
            limit: String(PAGE_SIZE),
            category: categoryId,
        });
        setLoading(true);
        setError('');
        api.products(params, controller.signal)
            .then((result) => {
                setProducts(result.items);
                setTotal(result.total);
                if (result.total > 0 && currentPage > Math.ceil(result.total / PAGE_SIZE)) {
                    history.replace(`/category/${categoryId}`);
                }
            })
            .catch((caught) => {
                if (!controller.signal.aborted) {
                    setProducts([]);
                    setTotal(0);
                    setError(caught instanceof Error ? caught.message : 'Unable to load category.');
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [categoryId, currentPage, history, initialCategoryId, initialData, initialPage, retryKey]);

    const categoryTitle = products[0]?.category.name || titleCase(categoryId.replace(/-/g, ' '));

    return (
        <div className="flex min-h-screen flex-col justify-between bg-obsidian font-body text-cream">
            <Header />

            <main id="main-content" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
                {/* Breadcrumbs */}
                <nav className="mb-6 flex items-center gap-2 text-xs sm:text-sm text-cream/60">
                    <Link className="hover:text-gold-200 transition" to="/">Home</Link>
                    <span className="text-white/20" aria-hidden="true">/</span>
                    <span className="text-cream/90 font-medium">{categoryTitle}</span>
                </nav>

                {/* Glass Category Hero Header */}
                <header className="glass-panel relative mb-10 overflow-hidden rounded-3xl border border-stone-200/80 p-6 sm:p-10">
                    <div className="pointer-events-none absolute -right-16 -top-16 size-80 rounded-full bg-gold-400/10 blur-3xl" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold-600">
                        Curated Collection
                    </span>
                    <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-cream sm:text-5xl lg:text-6xl">
                        {categoryTitle}
                    </h1>
                    <p className="mt-3 text-xs sm:text-sm text-cream/75" aria-live="polite">
                        {loading ? 'Curating collection…' : `Showing ${total} ${total === 1 ? 'curated item' : 'curated items'}`}
                    </p>
                </header>

                {error ? (
                    <div className="glass-panel rounded-2xl border-red-500/30 p-8 text-center text-sm text-red-600" role="alert">
                        <p>{error}</p>
                        <button
                            type="button"
                            onClick={() => setRetryKey((value) => value + 1)}
                            className="glass-pill mt-4 rounded-xl px-5 py-2 text-xs font-semibold text-gold-700 hover:text-gold-900"
                        >
                            Retry Loading
                        </button>
                    </div>
                ) : loading ? (
                    <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4 lg:gap-8">
                        {Array.from({ length: 8 }).map((_, idx) => (
                            <ProductCardSkeleton key={idx} />
                        ))}
                    </div>
                ) : products.length === 0 ? (
                    <div className="glass-panel rounded-3xl py-16 text-center">
                        <h2 className="font-display text-2xl font-semibold text-cream">No products found in this collection.</h2>
                        <Link to="/" className="button-primary mx-auto mt-6 rounded-xl py-3 px-6 text-sm">
                            Return to All Collections
                        </Link>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4 lg:gap-8">
                            {products.map((product) => <ProductCard key={product.id} product={product} />)}
                        </div>
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={(page) => {
                                history.push(`/category/${categoryId}${page === 1 ? '' : `?page=${page}`}`);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                        />
                    </>
                )}
            </main>

            <TrustBadges />
            <StoreFooter />
        </div>
    );
};

export default CategoryPage;
