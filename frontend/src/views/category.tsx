'use client';

import React, { useEffect, useState } from 'react';
import { Link, useHistory, useLocation, useParams } from '../lib/router';
import Header from '../components/Header';
import Pagination from '../components/Pagination';
import ProductCard from '../components/ProductCard';
import SEOHead from '../components/SEOHead';
import StoreFooter from '../components/StoreFooter';
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
            <SEOHead title={`${categoryTitle} Collection | Glockery Home Centre`} />
            <Header />

            <main id="main-content" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-10 sm:px-8 lg:px-12 lg:py-16">
                <nav className="mb-8 text-sm text-cream/60">
                    <Link className="hover:text-cream" to="/">Shop</Link>
                    <span className="mx-2" aria-hidden="true">/</span>
                    <span className="text-cream">{categoryTitle}</span>
                </nav>

                <header className="mb-10 border-b border-line pb-7">
                    <p className="eyebrow">Collection</p>
                    <h1 className="mt-2 font-display text-4xl font-semibold tracking-[-0.02em] text-cream sm:text-5xl lg:text-6xl">{categoryTitle}</h1>
                    <p className="mt-2 text-sm text-cream/65" aria-live="polite">
                        {loading ? 'Loading products…' : `${total} ${total === 1 ? 'product' : 'products'}`}
                    </p>
                </header>

                {error ? (
                    <div className="surface rounded-sm border-red-500/30 p-6 text-sm text-red-200" role="alert">
                        <p>{error}</p>
                        <button type="button" onClick={() => setRetryKey((value) => value + 1)} className="mt-3 font-bold text-gold-300 underline underline-offset-4">Retry</button>
                    </div>
                ) : loading ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">
                        {Array.from({ length: 8 }).map((_, idx) => <div key={idx} className="aspect-[4/5] animate-pulse bg-panel" />)}
                    </div>
                ) : products.length === 0 ? (
                    <div className="surface rounded-sm border-y border-line bg-carbon/45 py-16 text-center">
                        <h2 className="font-display text-3xl font-semibold text-cream">No products found.</h2>
                        <Link to="/" className="button-secondary mt-5">Return to shop</Link>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4 lg:gap-y-14">
                            {products.map((product) => <ProductCard key={product.id} product={product} />)}
                        </div>
                        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={(page) => {
                            history.push(`/category/${categoryId}${page === 1 ? '' : `?page=${page}`}`);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        }} />
                    </>
                )}
            </main>

            <StoreFooter />
        </div>
    );
};

export default CategoryPage;
