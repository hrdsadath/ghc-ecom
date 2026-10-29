'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from '../lib/router';
import Header from '../components/Header';
import { IconChevronLeft, IconChevronRight, IconHeart, IconMinus, IconPlay, IconPlus, IconX } from '../components/Icons';
import ProductVariantSelector from '../components/ProductVariantSelector';
import StoreFooter from '../components/StoreFooter';
import TrustBadges from '../components/TrustBadges';
import { useCart } from '../contexts/CartContext';
import { useWishlist } from '../contexts/WishlistContext';
import { api } from '../lib/api';
import { fallbackImage, rupees } from '../lib/commerce';
import { productImagesForVariant, variantOptionLabel } from '../lib/product-options';
import { Product } from '../types';

interface ProductDetailPageProps {
    initialProduct?: Product;
    initialSlug?: string;
}

export const ProductDetailPage = ({ initialProduct, initialSlug }: ProductDetailPageProps) => {
    const { productId } = useParams<{ productId: string }>();
    const { addVariant } = useCart();
    const { isInWishlist, toggleWishlist } = useWishlist();
    const hasInitialProduct = Boolean(initialProduct && initialSlug === productId);
    const [product, setProduct] = useState<Product | null>(hasInitialProduct ? initialProduct! : null);
    const [selectedVariantId, setSelectedVariantId] = useState(() => hasInitialProduct
        ? initialProduct!.variants.find((variant) => variant.availableStock > 0)?.id || initialProduct!.variants[0]?.id || ''
        : '');
    const [activeImage, setActiveImage] = useState(0);
    const [isZoomed, setIsZoomed] = useState(false);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [quantity, setQuantity] = useState(1);
    const [loading, setLoading] = useState(!hasInitialProduct);
    const [error, setError] = useState('');
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState('');
    const [unplayableVideoIds, setUnplayableVideoIds] = useState<string[]>([]);
    const [requestedVideoId, setRequestedVideoId] = useState<string | null>(null);
    const galleryLengthRef = useRef(1);

    useEffect(() => {
        if (initialProduct && initialSlug === productId) {
            setProduct(initialProduct);
            setSelectedVariantId(initialProduct.variants.find((variant) => variant.availableStock > 0)?.id || initialProduct.variants[0]?.id || '');
            setLoading(false);
            setError('');
            return;
        }
        setLoading(true);
        api.product(productId)
            .then((result) => {
                setProduct(result);
                setSelectedVariantId(result.variants.find((variant) => variant.availableStock > 0)?.id || result.variants[0]?.id || '');
                setActiveImage(0);
                setIsZoomed(false);
                setIsLightboxOpen(false);
                setUnplayableVideoIds([]);
                setRequestedVideoId(null);
            })
            .catch((caught) => setError(caught instanceof Error ? caught.message : 'Product not found.'))
            .finally(() => setLoading(false));
    }, [initialProduct, initialSlug, productId]);

    useEffect(() => {
        if (!isLightboxOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            const count = galleryLengthRef.current || 1;
            if (e.key === 'Escape') setIsLightboxOpen(false);
            if (e.key === 'ArrowRight') setActiveImage((curr) => (curr + 1) % count);
            if (e.key === 'ArrowLeft') setActiveImage((curr) => (curr - 1 + count) % count);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isLightboxOpen]);

    if (loading) {
        return (
            <div className="min-h-screen bg-obsidian text-cream font-body">
                <Header />
                <main className="mx-auto grid max-w-[1440px] gap-8 px-4 py-8 sm:px-8 lg:grid-cols-2 lg:px-12 lg:py-12 animate-pulse">
                    {/* Contextual Media Stage Skeleton */}
                    <div className="space-y-4">
                        <div className="glass-panel aspect-square w-full rounded-3xl border border-white/10 bg-white/[0.03] p-8 flex items-center justify-center shadow-inner">
                            <div className="h-4/5 w-4/5 rounded-2xl bg-white/[0.04]" />
                        </div>
                        <div className="flex gap-3">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="size-16 sm:size-20 rounded-xl border border-white/10 bg-white/[0.03]" />
                            ))}
                        </div>
                    </div>

                    {/* Contextual Purchase Panel Skeleton */}
                    <div className="glass-panel rounded-3xl p-6 sm:p-8 space-y-6 border border-white/10 bg-white/[0.03] shadow-lg">
                        <div className="h-4 w-28 rounded-full bg-gold-400/20" />
                        <div className="space-y-2">
                            <div className="h-8 w-3/4 rounded-xl bg-white/[0.06]" />
                            <div className="h-8 w-1/2 rounded-xl bg-white/[0.05]" />
                        </div>
                        <div className="h-9 w-44 rounded-xl bg-white/[0.05]" />
                        <div className="space-y-3 pt-4 border-t border-white/10">
                            <div className="h-4 w-32 rounded-full bg-white/[0.05]" />
                            <div className="flex gap-2">
                                <div className="h-10 w-24 rounded-full bg-white/[0.05]" />
                                <div className="h-10 w-24 rounded-full bg-white/[0.05]" />
                            </div>
                        </div>
                        <div className="space-y-2 pt-4">
                            <div className="h-4 w-full rounded bg-white/[0.04]" />
                            <div className="h-4 w-5/6 rounded bg-white/[0.04]" />
                        </div>
                        <div className="h-12 w-full rounded-2xl bg-gold-400/20" />
                    </div>
                </main>
                <StoreFooter />
            </div>
        );
    }

    if (!product || error) {
        return (
            <div className="flex min-h-screen flex-col bg-obsidian text-cream">
                <Header />
                <main className="grid flex-1 place-content-center px-6 text-center py-20">
                    <div className="glass-panel mx-auto max-w-md rounded-3xl p-10 text-center">
                        <h1 className="font-display text-3xl font-semibold text-cream">This product is unavailable</h1>
                        <p className="mt-3 text-sm text-cream/75">{error || 'The item may have been moved or removed.'}</p>
                        <Link className="button-primary mx-auto mt-7 rounded-xl py-3 px-6" to="/">
                            Return to Collections
                        </Link>
                    </div>
                </main>
                <StoreFooter />
            </div>
        );
    }

    const variant = product.variants.find((item) => item.id === selectedVariantId) || product.variants[0];
    const outOfStock = !variant || variant.availableStock <= 0;
    const productImages = productImagesForVariant(product, variant);
    const imageMedia = productImages.map((image) => ({
        id: image.id,
        type: 'image' as const,
        sortOrder: image.sortOrder,
        altText: image.altText,
        url: image.largeUrl,
        mediumUrl: image.mediumUrl,
        thumbnailUrl: image.thumbnailUrl,
    }));
    if (imageMedia.length === 0) {
        imageMedia.push({
            id: `fallback-${variant?.id || product.id}`,
            type: 'image' as const,
            sortOrder: 0,
            altText: `${product.name}${variant ? ` — ${variantOptionLabel(variant)}` : ''}`,
            url: fallbackImage,
            mediumUrl: '',
            thumbnailUrl: fallbackImage,
        });
    }
    const gallery = [
        ...imageMedia,
        ...product.videos.map((video) => ({
            id: video.id,
            type: 'video' as const,
            sortOrder: video.sortOrder,
            altText: video.altText,
            url: video.url,
        })),
    ];
    galleryLengthRef.current = gallery.length;
    const activeMedia = gallery[activeImage] || gallery[0];
    const videoIsUnplayable = activeMedia.type === 'video' && unplayableVideoIds.includes(activeMedia.id);
    const videoRequested = activeMedia.type === 'video' && requestedVideoId === activeMedia.id;
    const isWishlisted = isInWishlist(product.id);

    const add = async () => {
        if (!variant || outOfStock) {
            setAddError('This product is currently out of stock.');
            return;
        }
        setAdding(true);
        setAddError('');
        try {
            await addVariant(variant, quantity);
        } catch (caught) {
            setAddError(caught instanceof Error ? caught.message : 'This item could not be added.');
        } finally {
            setAdding(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-obsidian font-body text-cream">
            <Header />

            <main id="main-content" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
                {/* Frosted Breadcrumb Chain */}
                <nav className="mb-6 flex items-center gap-2 text-xs sm:text-sm text-cream/60">
                    <Link to="/" className="hover:text-gold-200 transition">
                        Home
                    </Link>
                    <span className="text-white/20" aria-hidden="true">
                        /
                    </span>
                    <Link to={`/category/${product.category.slug}`} className="hover:text-gold-200 transition">
                        {product.category.name}
                    </Link>
                    <span className="text-white/20" aria-hidden="true">
                        /
                    </span>
                    <span className="text-cream/90 truncate max-w-xs">{product.name}</span>
                </nav>

                <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12">
                    {/* Media Stage Column */}
                    <div>
                        <div className="glass-panel relative aspect-square overflow-hidden rounded-3xl border border-stone-200/80 bg-white/95 p-4 sm:p-6 shadow-[0_20px_50px_rgba(35,30,24,0.08)]">
                            {/* Radial Glow reflection */}
                            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.08)_0%,transparent_70%)]" />

                            {activeMedia.type === 'video' && !videoIsUnplayable && videoRequested ? (
                                <video
                                    controls
                                    autoPlay
                                    preload="none"
                                    className="h-full w-full rounded-2xl bg-black object-contain"
                                    aria-label={activeMedia.altText || product.name}
                                    onError={() => setUnplayableVideoIds((current) => current.includes(activeMedia.id) ? current : [...current, activeMedia.id])}
                                >
                                    <source src={activeMedia.url} type={activeMedia.url.toLowerCase().includes('.webm') ? 'video/webm' : 'video/mp4'} />
                                    Your browser does not support this product video.
                                </video>
                            ) : activeMedia.type === 'video' && !videoIsUnplayable ? (
                                <button
                                    type="button"
                                    onClick={() => setRequestedVideoId(activeMedia.id)}
                                    className="grid h-full w-full place-items-center rounded-2xl bg-obsidian/60 p-8 text-center transition hover:bg-obsidian/80"
                                    aria-label={`Play ${activeMedia.altText || product.name}`}
                                >
                                    <span>
                                        <div className="glass-pill mx-auto grid size-16 place-items-center rounded-2xl border-gold-400/40 bg-gold-400/10 text-gold-300">
                                            <IconPlay size={32} />
                                        </div>
                                        <span className="mt-4 block font-semibold text-cream">Play product video</span>
                                        <span className="mt-1 block text-xs text-cream/60">Tap to load and play</span>
                                    </span>
                                </button>
                            ) : activeMedia.type === 'video' ? (
                                <div className="grid h-full place-items-center rounded-2xl bg-obsidian/60 p-8 text-center">
                                    <div>
                                        <IconPlay size={32} className="mx-auto text-gold-400" />
                                        <p className="mt-4 font-semibold text-cream">This video cannot be played in your browser.</p>
                                        <p className="mt-1 text-xs text-cream/60">Please ask the store to upload an MP4 video.</p>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsLightboxOpen(true);
                                        setIsZoomed((current) => !current);
                                    }}
                                    aria-label={isZoomed ? 'Zoom out selected product image' : 'Zoom in selected product image'}
                                    className="group relative block h-full w-full cursor-zoom-in overflow-hidden rounded-2xl text-left touch-manipulation"
                                >
                                    <img
                                        src={activeMedia.url || fallbackImage}
                                        srcSet={activeMedia.mediumUrl ? `${activeMedia.mediumUrl} 800w, ${activeMedia.url} 1600w` : undefined}
                                        sizes="(min-width: 1024px) 55vw, 100vw"
                                        fetchPriority="high"
                                        decoding="async"
                                        alt={activeMedia.altText || product.name}
                                        className="h-full w-full object-contain p-2 sm:p-4 transition-transform duration-500 ease-out group-hover:scale-105"
                                        onError={(event) => {
                                            event.currentTarget.removeAttribute('srcset');
                                            event.currentTarget.src = fallbackImage;
                                        }}
                                    />
                                    {/* Floating Touch to Enlarge Pill */}
                                    <span className="glass-pill absolute bottom-3.5 right-3.5 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-gold-300 shadow-md backdrop-blur-md opacity-90 transition-all group-hover:opacity-100 group-hover:border-gold-400/60 group-hover:text-gold-200">
                                        <span>🔍</span> Touch to view larger
                                    </span>
                                </button>
                            )}
                        </div>

                        {/* Thumbnails Gallery Strip */}
                        {gallery.length > 1 && (
                            <div data-product-gallery="thumbs" className="mt-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 no-scrollbar sm:gap-3">
                                {gallery.map((item, index) => (
                                    <button
                                        type="button"
                                        key={item.id}
                                        onClick={() => {
                                            setActiveImage(index);
                                            setIsZoomed(false);
                                        }}
                                        aria-label={`View ${item.type === 'video' ? 'video' : 'image'} ${index + 1}`}
                                        className={`size-16 sm:size-20 shrink-0 snap-start overflow-hidden rounded-xl border p-1 transition-all ${
                                            activeImage === index
                                                ? 'border-gold-400/80 bg-gold-400/15 shadow-[0_0_15px_rgba(212,175,55,0.3)]'
                                                : 'glass-pill opacity-70 hover:opacity-100'
                                        }`}
                                    >
                                        {item.type === 'video' ? (
                                            <span className="grid h-full place-items-center rounded-lg bg-obsidian text-cream">
                                                <IconPlay size={20} />
                                            </span>
                                        ) : (
                                            <img
                                                loading="lazy"
                                                decoding="async"
                                                src={item.thumbnailUrl}
                                                alt=""
                                                className="h-full w-full rounded-lg object-contain"
                                            />
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Product Purchase Column */}
                    <div className="glass-panel rounded-3xl p-6 sm:p-8 lg:sticky lg:top-24 lg:self-start">
                        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold-400">
                            {product.category.name}
                        </span>

                        <div className="mt-2 flex items-start justify-between gap-4">
                            <h1 className="font-display text-3xl font-bold leading-tight text-cream sm:text-4xl">
                                {product.name}
                            </h1>
                            <button
                                onClick={() => toggleWishlist(product.id)}
                                className={`glass-pill grid size-11 shrink-0 place-items-center rounded-full transition-all hover:scale-110 active:scale-95 ${
                                    isWishlisted
                                        ? 'border-gold-400/60 bg-gold-400/20 text-gold-300 shadow-[0_0_14px_rgba(212,175,55,0.4)]'
                                        : 'text-cream/70 hover:text-cream'
                                }`}
                                aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
                                aria-pressed={isWishlisted}
                            >
                                <IconHeart size={18} />
                            </button>
                        </div>

                        {/* Price Badge */}
                        <div className="mt-5 flex items-baseline gap-3 border-y border-white/10 py-4">
                            <strong className="font-display text-3xl font-bold text-cream">
                                {variant ? rupees(variant.pricePaise) : 'Unavailable'}
                            </strong>
                            {variant?.compareAtPricePaise && variant.compareAtPricePaise > variant.pricePaise && (
                                <s className="text-sm font-medium tabular-nums text-cream/55">{rupees(variant.compareAtPricePaise)}</s>
                            )}
                            <span className="ml-auto text-xs font-medium text-gold-400/90">Taxes included</span>
                        </div>

                        <ProductVariantSelector
                            product={product}
                            selectedVariantId={variant?.id || ''}
                            onSelect={(variantId) => {
                                setSelectedVariantId(variantId);
                                const nextVariant = product.variants.find((item) => item.id === variantId);
                                setQuantity((current) => Math.min(current, Math.max(1, nextVariant?.availableStock || 1)));
                                setActiveImage(0);
                                setAddError('');
                            }}
                        />

                        {product.description && (
                            <p className="mt-5 text-sm leading-relaxed text-cream/90 font-normal">
                                {product.description || product.shortDescription}
                            </p>
                        )}

                        {variant && (
                            <p className="mt-4 text-xs font-medium text-cream/75" aria-live="polite">
                                {outOfStock
                                    ? 'Out of stock — choose another option.'
                                    : `Selected: ${variantOptionLabel(variant)} · SKU ${variant.sku}`}
                            </p>
                        )}

                        {/* Action Stepper + Add to Cart Button */}
                        <div className="mt-7 flex gap-3">
                            <div className="glass-pill flex h-12 items-center rounded-2xl px-1 border-white/10">
                                <button
                                    className="grid size-10 place-items-center rounded-xl text-cream hover:bg-white/10 disabled:opacity-40"
                                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                    disabled={outOfStock}
                                    aria-label="Decrease quantity"
                                >
                                    <IconMinus size={14} />
                                </button>
                                <span className="w-8 text-center text-sm font-bold tabular-nums text-cream">
                                    {quantity}
                                </span>
                                <button
                                    className="grid size-10 place-items-center rounded-xl text-cream hover:bg-white/10 disabled:opacity-40"
                                    onClick={() => setQuantity(Math.min(variant?.availableStock || 1, quantity + 1))}
                                    disabled={outOfStock || quantity >= (variant?.availableStock || 0)}
                                    aria-label="Increase quantity"
                                >
                                    <IconPlus size={14} />
                                </button>
                            </div>

                            <button
                                disabled={outOfStock || adding}
                                onClick={add}
                                className="button-primary flex-1 rounded-2xl py-3 px-6 text-sm font-bold tracking-wide shadow-[0_8px_30px_rgba(212,175,55,0.25)] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {adding ? 'Adding to cart…' : outOfStock ? 'Out of stock' : 'Add to cart'}
                            </button>
                        </div>

                        {addError && (
                            <p className="mt-3 text-xs text-red-300" role="alert">
                                {addError}
                            </p>
                        )}

                        {/* Material & Details in Glass Rows */}
                        <dl className="mt-8 space-y-2 border-t border-stone-200/80 pt-6 text-xs sm:text-sm">
                            {product.material && (
                                <div className="flex justify-between rounded-xl p-3 border border-stone-200/80 bg-white/80">
                                    <dt className="text-cream/70 font-medium">Craft Material</dt>
                                    <dd className="font-semibold text-cream">{product.material}</dd>
                                </div>
                            )}
                            <div className="flex justify-between rounded-xl p-3 border border-stone-200/80 bg-white/80">
                                <dt className="text-cream/70 font-medium">Packaging Safety</dt>
                                <dd className="font-semibold text-cream">Multi-layer bubble & foam</dd>
                            </div>
                            <div className="flex justify-between rounded-xl p-3 border border-stone-200/80 bg-white/80">
                                <dt className="text-cream/70 font-medium">Direct Store Concierge</dt>
                                <dd>
                                    <a
                                        href="https://wa.me/916282000289"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-gold-300 hover:text-gold-200 font-semibold"
                                    >
                                        Ask on WhatsApp →
                                    </a>
                                </dd>
                            </div>
                        </dl>
                    </div>
                </section>
            </main>

            {/* Full-Screen Separate Big Lightbox Modal */}
            {isLightboxOpen && (
                <div
                    className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#fcfbf9]/98 p-4 sm:p-8 backdrop-blur-3xl animate-fadeIn"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Enlarged product image view"
                    onClick={() => setIsLightboxOpen(false)}
                >
                    {/* Top Control Bar */}
                    <div className="flex w-full max-w-6xl items-center justify-between z-10" onClick={(e) => e.stopPropagation()}>
                        <div className="text-left">
                            <p className="text-xs uppercase tracking-widest text-gold-600 font-bold">{product.name}</p>
                            <p className="text-xs text-cream/70 font-mono">Image {activeImage + 1} of {gallery.length}</p>
                        </div>
                        <button
                            onClick={() => setIsLightboxOpen(false)}
                            className="glass-pill grid size-12 place-items-center rounded-full text-cream hover:text-gold-700 hover:border-gold-500/60 transition shadow-md"
                            aria-label="Close full size view"
                        >
                            <IconX size={22} />
                        </button>
                    </div>

                    {/* Center Big Image Stage */}
                    <div className="relative flex flex-1 items-center justify-center w-full max-w-6xl my-4" onClick={(e) => e.stopPropagation()}>
                        {gallery.length > 1 && (
                            <button
                                onClick={() => setActiveImage((curr) => (curr - 1 + gallery.length) % gallery.length)}
                                className="glass-pill absolute left-2 sm:left-4 z-20 grid size-12 sm:size-14 place-items-center rounded-full text-gold-700 hover:text-gold-900 hover:border-gold-500 transition shadow-lg"
                                aria-label="Previous image"
                            >
                                <IconChevronLeft size={24} />
                            </button>
                        )}

                        {activeMedia.type === 'video' ? (
                            <video
                                controls
                                autoPlay
                                className="max-h-[75vh] max-w-[85vw] rounded-2xl object-contain shadow-2xl bg-black"
                                src={activeMedia.url}
                            />
                        ) : (
                            <img
                                src={activeMedia.url || fallbackImage}
                                alt={activeMedia.altText || product.name}
                                className="max-h-[78vh] max-w-[88vw] object-contain drop-shadow-[0_20px_45px_rgba(35,30,24,0.12)] rounded-2xl transition-transform duration-300"
                            />
                        )}

                        {gallery.length > 1 && (
                            <button
                                onClick={() => setActiveImage((curr) => (curr + 1) % gallery.length)}
                                className="glass-pill absolute right-2 sm:right-4 z-20 grid size-12 sm:size-14 place-items-center rounded-full text-gold-700 hover:text-gold-900 hover:border-gold-500 transition shadow-lg"
                                aria-label="Next image"
                            >
                                <IconChevronRight size={24} />
                            </button>
                        )}
                    </div>

                    {/* Bottom Thumbnail Strip */}
                    {gallery.length > 1 && (
                        <div className="flex gap-2.5 overflow-x-auto p-2 glass-pill rounded-2xl max-w-full z-10 shadow-md bg-white/90 border border-stone-200/80" onClick={(e) => e.stopPropagation()}>
                            {gallery.map((item, idx) => (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveImage(idx)}
                                    className={`size-14 sm:size-16 shrink-0 overflow-hidden rounded-xl border p-1 transition ${
                                        activeImage === idx
                                            ? 'border-gold-500 bg-gold-500/15 shadow-sm'
                                            : 'border-stone-200/70 bg-white opacity-70 hover:opacity-100'
                                    }`}
                                >
                                    {item.type === 'video' ? (
                                        <span className="grid h-full place-items-center rounded-lg bg-stone-100 text-gold-700">
                                            <IconPlay size={18} />
                                        </span>
                                    ) : (
                                        <img src={item.thumbnailUrl || fallbackImage} alt="" className="size-full object-contain" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <TrustBadges />
            <StoreFooter />
        </div>
    );
};

export default ProductDetailPage;
