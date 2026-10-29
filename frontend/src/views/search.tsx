'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import { useHistory, useLocation } from '../lib/router';
import Header from '../components/Header';
import { IconSearch } from '../components/Icons';
import Pagination from '../components/Pagination';
import ProductCard from '../components/ProductCard';
import { ProductCardSkeleton } from '../components/Skeleton';
import StoreFooter from '../components/StoreFooter';
import TrustBadges from '../components/TrustBadges';
import { api } from '../lib/api';
import { positivePage, SEARCH_PAGE_SIZE, searchRequestParams } from '../lib/search-params';
import { Category, PaginatedProducts, Product } from '../types';

const PAGE_SIZE = SEARCH_PAGE_SIZE;

interface SearchPageProps {
    initialData?: PaginatedProducts;
    /** `searchRequestParams(...).toString()` for the request that produced initialData. */
    initialRequest?: string;
    initialCategories?: Category[];
}

export const SearchPage = ({ initialData, initialRequest, initialCategories }: SearchPageProps) => {
    const location = useLocation();
    const history = useHistory();
    const urlParams = new URLSearchParams(location.search);
    const query = urlParams.get('q')?.trim() || '';
    const selectedCategory = urlParams.get('category') || '';
    const currentPage = positivePage(urlParams.get('page'));
    const requestKey = searchRequestParams(query, selectedCategory, currentPage).toString();
    const hasMatchingInitialData = Boolean(initialData && initialRequest === requestKey);
    const [draftQuery, setDraftQuery] = useState(query);
    const [products, setProducts] = useState<Product[]>(hasMatchingInitialData ? initialData!.items : []);
    const [categories, setCategories] = useState<Category[]>(initialCategories ?? []);
    const [total, setTotal] = useState(hasMatchingInitialData ? initialData!.total : 0);
    const [loading, setLoading] = useState(!hasMatchingInitialData);
    const [error, setError] = useState('');
    const [retryKey, setRetryKey] = useState(0);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    useEffect(() => setDraftQuery(query), [query]);

    useEffect(() => {
        if (initialCategories !== undefined) return;
        const controller = new AbortController();
        api.categories()
            .then(setCategories)
            .catch(() => {
                if (!controller.signal.aborted) setCategories([]);
            });
        return () => controller.abort();
    }, [initialCategories]);

    useEffect(() => {
        if (retryKey === 0 && initialData && initialRequest === requestKey) {
            setProducts(initialData.items);
            setTotal(initialData.total);
            setLoading(false);
            setError('');
            return;
        }
        const controller = new AbortController();
        const params = new URLSearchParams(requestKey);
        setLoading(true);
        setError('');
        api.products(params, controller.signal)
            .then((result) => {
                setProducts(result.items);
                setTotal(result.total);
                if (result.total > 0 && currentPage > Math.ceil(result.total / PAGE_SIZE)) {
                    updateUrl({ page: '1' }, true);
                }
            })
            .catch((caught) => {
                if (!controller.signal.aborted) {
                    setProducts([]);
                    setTotal(0);
                    setError(caught instanceof Error ? caught.message : 'Products could not be loaded.');
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
        // location.search is the single source of truth for this request.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestKey, retryKey, initialData, initialRequest]);

    const updateUrl = (changes: Record<string, string>, replace = false) => {
        const params = new URLSearchParams(location.search);
        Object.entries(changes).forEach(([key, value]) => {
            if (value) params.set(key, value);
            else params.delete(key);
        });
        const target = `/search${params.toString() ? `?${params}` : ''}`;
        if (replace) history.replace(target);
        else history.push(target);
    };

    const submitSearch = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        updateUrl({ q: draftQuery.trim(), page: '' });
    };

    const resultLabel = loading
        ? 'Searching catalog…'
        : `Showing ${total} ${total === 1 ? 'item' : 'items'}`;

    return (
        <div className="flex min-h-screen flex-col bg-obsidian font-body text-cream">
            <Header />
            <main id="main-content" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
                {/* Search Bar Header Pavilion */}
                <div className="glass-panel relative overflow-hidden rounded-3xl border border-stone-200/80 p-6 sm:p-10">
                    <div className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-gold-400/10 blur-3xl" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold-600">
                        Artisanal Catalog
                    </span>
                    <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-5xl">
                        {query ? `Search: "${query}"` : 'Explore All Collections'}
                    </h1>

                    <form onSubmit={submitSearch} className="mt-6 flex max-w-2xl items-center rounded-2xl border border-stone-300/80 bg-white px-4 py-1.5 shadow-sm transition-all focus-within:border-gold-500/80 focus-within:shadow-md" role="search">
                        <IconSearch className="mr-3 shrink-0 text-gold-600" size={18} />
                        <label htmlFor="catalogue-search" className="sr-only">Search products</label>
                        <input
                            id="catalogue-search"
                            name="q"
                            type="search"
                            maxLength={100}
                            autoComplete="off"
                            value={draftQuery}
                            onChange={(event) => setDraftQuery(event.target.value)}
                            placeholder="Search by dinner set, cups, canisters, plates…"
                            className="min-w-0 flex-1 bg-transparent py-2.5 text-sm sm:text-base text-cream placeholder-cream/40 outline-none"
                        />
                        <button type="submit" className="button-primary rounded-xl px-4 py-2 text-xs font-semibold">
                            Search
                        </button>
                    </form>
                </div>

                {/* Filter and Count Bar */}
                <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-stone-200/80 bg-white/90 p-4 sm:flex-row sm:items-center sm:justify-between shadow-sm">
                    <p className="text-xs sm:text-sm text-cream/75" aria-live="polite">
                        {resultLabel}
                    </p>
                    <label className="flex items-center gap-3">
                        <span className="text-xs uppercase tracking-wider text-cream/60">Filter:</span>
                        <select
                            value={selectedCategory}
                            onChange={(event) => updateUrl({ category: event.target.value, page: '' })}
                            className="glass-pill rounded-xl px-3.5 py-2 text-xs sm:text-sm text-cream outline-none border-stone-200/80 bg-white cursor-pointer shadow-sm"
                        >
                            <option value="">All Categories</option>
                            {categories.map((category) => (
                                <option key={category.id} value={category.slug} className="bg-white text-cream">
                                    {category.name}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                {error ? (
                    <div className="glass-panel mt-8 rounded-2xl border-red-500/30 p-8 text-center text-sm text-red-600" role="alert">
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
                    <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4 lg:gap-8" aria-label="Loading products">
                        {Array.from({ length: 8 }).map((_, index) => (
                            <ProductCardSkeleton key={index} />
                        ))}
                    </div>
                ) : products.length ? (
                    <>
                        <div className="mt-8 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4 lg:gap-8">
                            {products.map((product) => (
                                <ProductCard key={product.id} product={product} />
                            ))}
                        </div>
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={(page) => {
                                updateUrl({ page: page === 1 ? '' : String(page) });
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                        />
                    </>
                ) : (
                    <div className="glass-panel mt-8 rounded-3xl py-16 text-center">
                        <h2 className="font-display text-2xl font-semibold text-cream">No products matched your search.</h2>
                        <p className="mt-2 text-xs sm:text-sm text-cream/65">Try checking for spelling or choosing another category.</p>
                        <button
                            onClick={() => {
                                setDraftQuery('');
                                updateUrl({ q: '', category: '', page: '' });
                            }}
                            className="button-primary mx-auto mt-6 rounded-xl py-3 px-6 text-sm"
                        >
                            Clear Filters & View All
                        </button>
                    </div>
                )}
            </main>

            <TrustBadges />
            <StoreFooter />
        </div>
    );
};

export default SearchPage;
