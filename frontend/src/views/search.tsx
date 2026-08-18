'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import { useHistory, useLocation } from '../lib/router';
import Header from '../components/Header';
import { IconSearch } from '../components/Icons';
import Pagination from '../components/Pagination';
import ProductCard from '../components/ProductCard';
import SEOHead from '../components/SEOHead';
import StoreFooter from '../components/StoreFooter';
import { api } from '../lib/api';
import { Category, Product } from '../types';

const PAGE_SIZE = 24;

const positivePage = (value: string | null) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

export const SearchPage = () => {
    const location = useLocation();
    const history = useHistory();
    const urlParams = new URLSearchParams(location.search);
    const query = urlParams.get('q')?.trim() || '';
    const selectedCategory = urlParams.get('category') || '';
    const currentPage = positivePage(urlParams.get('page'));
    const [draftQuery, setDraftQuery] = useState(query);
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [retryKey, setRetryKey] = useState(0);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    useEffect(() => setDraftQuery(query), [query]);

    useEffect(() => {
        const controller = new AbortController();
        api.categories()
            .then(setCategories)
            .catch(() => {
                if (!controller.signal.aborted) setCategories([]);
            });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        const params = new URLSearchParams({
            page: String(currentPage),
            limit: String(PAGE_SIZE),
        });
        if (query) params.set('q', query);
        if (selectedCategory) params.set('category', selectedCategory);
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
    }, [query, selectedCategory, currentPage, retryKey]);

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
        ? 'Loading products…'
        : `${total} ${total === 1 ? 'product' : 'products'}`;

    return (
        <div className="flex min-h-screen flex-col bg-obsidian font-body text-cream">
            <SEOHead title={`${query ? `Search: ${query}` : 'All products'} | Glockery`} />
            <Header />
            <main id="main-content" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-10 sm:px-8 lg:px-12 lg:py-16">
                <div className="max-w-2xl">
                    <h1 className="font-display text-4xl font-semibold tracking-[-0.02em] sm:text-5xl">
                        {query ? 'Search results' : 'All products'}
                    </h1>
                    <form onSubmit={submitSearch} className="mt-7 flex min-h-12 items-center border-b border-line focus-within:border-gold-400" role="search">
                        <IconSearch className="mr-3 shrink-0 text-cream/60" size={19} />
                        <label htmlFor="catalogue-search" className="sr-only">Search products</label>
                        <input
                            id="catalogue-search"
                            name="q"
                            type="search"
                            autoComplete="off"
                            value={draftQuery}
                            onChange={(event) => setDraftQuery(event.target.value)}
                            placeholder="Search products"
                            className="min-w-0 flex-1 bg-transparent py-3 text-base text-cream outline-none"
                        />
                        <button type="submit" className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-gold-300">Search</button>
                    </form>
                </div>

                <div className="mt-10 flex flex-col gap-4 border-y border-line bg-carbon/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-cream/65" aria-live="polite">{resultLabel}</p>
                    <label>
                        <span className="sr-only">Category</span>
                        <select
                            value={selectedCategory}
                            onChange={(event) => updateUrl({ category: event.target.value, page: '' })}
                            className="field w-full min-w-0 text-sm sm:w-52"
                        >
                            <option value="">All categories</option>
                            {categories.map((category) => <option key={category.id} value={category.slug}>{category.name}</option>)}
                        </select>
                    </label>
                </div>

                {error ? (
                    <div className="mt-10 border border-red-500/30 bg-red-950/20 p-6 text-sm text-red-200" role="alert">
                        <p>{error}</p>
                        <button type="button" onClick={() => setRetryKey((value) => value + 1)} className="mt-3 font-bold text-gold-300 underline underline-offset-4">Retry</button>
                    </div>
                ) : loading ? (
                    <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4" aria-label="Loading products">
                        {Array.from({ length: 8 }).map((_, index) => <div key={index} className="aspect-[4/5] animate-pulse bg-panel" />)}
                    </div>
                ) : products.length ? (
                    <>
                        <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4 lg:gap-y-14">
                            {products.map((product) => <ProductCard key={product.id} product={product} />)}
                        </div>
                        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={(page) => {
                            updateUrl({ page: page === 1 ? '' : String(page) });
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        }} />
                    </>
                ) : (
                    <div className="mt-10 border-y border-line bg-carbon/45 py-16 text-center">
                        <h2 className="font-display text-3xl text-cream">No products found.</h2>
                        <p className="mt-2 text-sm text-cream/65">Try a different search or category.</p>
                    </div>
                )}
            </main>
            <StoreFooter />
        </div>
    );
};

export default SearchPage;
