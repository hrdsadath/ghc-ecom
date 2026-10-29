'use client';

import React, { useEffect, useState } from 'react';
import { Link, useParams } from '../lib/router';
import Header from '../components/Header';
import { IconHeart, IconMinus, IconPlay, IconPlus } from '../components/Icons';
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
    const [quantity, setQuantity] = useState(1);
    const [loading, setLoading] = useState(!hasInitialProduct);
    const [error, setError] = useState('');
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState('');
    const [unplayableVideoIds, setUnplayableVideoIds] = useState<string[]>([]);
    const [requestedVideoId, setRequestedVideoId] = useState<string | null>(null);

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
                setUnplayableVideoIds([]);
                setRequestedVideoId(null);
            })
            .catch((caught) => setError(caught instanceof Error ? caught.message : 'Product not found.'))
            .finally(() => setLoading(false));
    }, [initialProduct, initialSlug, productId]);

    if (loading) {
        return (
            <div className="min-h-screen bg-obsidian text-cream">
                <Header />
                <main className="mx-auto grid max-w-[1440px] gap-8 px-4 py-10 sm:px-8 lg:grid-cols-2 lg:px-12 lg:py-16">
                    <div className="glass-panel aspect-square animate-pulse rounded-3xl" />
                    <div className="glass-panel h-96 animate-pulse rounded-3xl" />
                </main>
            </div>
        );
    }

    if (!product || error) {
        return (
            <div className="flex min-h-screen flex-col bg-obsidian text-cream">
                <Header />
                <main className="grid flex-1 place-content-center px-6 text-center py-20">
                    <div className="glass-panel mx-auto max-w-md rounded-3xl p-10 text-center">
                        <h1 className="font-display text-3xl font-semibold">This product is unavailable</h1>
                        <p className="mt-3 text-sm text-cream/65">{error || 'The item may have been moved or removed.'}</p>
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
                        <div className="glass-panel relative aspect-square overflow-hidden rounded-3xl border border-white/10 p-4 sm:p-6 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
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
                                    onClick={() => setIsZoomed((current) => !current)}
                                    aria-label={isZoomed ? 'Zoom out selected product image' : 'Zoom in selected product image'}
                                    className="group relative block h-full w-full cursor-zoom-in overflow-hidden rounded-2xl text-left"
                                >
                                    <img
                                        src={activeMedia.url || fallbackImage}
                                        srcSet={activeMedia.mediumUrl ? `${activeMedia.mediumUrl} 800w, ${activeMedia.url} 1600w` : undefined}
                                        sizes="(min-width: 1024px) 55vw, 100vw"
                                        fetchPriority="high"
                                        decoding="async"
                                        alt={activeMedia.altText || product.name}
                                        className={`h-full w-full object-contain p-4 transition-transform duration-500 ease-out ${isZoomed ? 'scale-135 cursor-zoom-out' : 'scale-100 group-hover:scale-105'}`}
                                        onError={(event) => {
                                            event.currentTarget.removeAttribute('srcset');
                                            event.currentTarget.src = fallbackImage;
                                        }}
                                    />
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
                        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-400/80">
                            {product.category.name}
                        </span>

                        <div className="mt-2 flex items-start justify-between gap-4">
                            <h1 className="font-display text-3xl font-semibold leading-tight text-cream sm:text-4xl">
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
                            <strong className="font-display text-3xl font-semibold text-cream">
                                {variant ? rupees(variant.pricePaise) : 'Unavailable'}
                            </strong>
                            {variant?.compareAtPricePaise && variant.compareAtPricePaise > variant.pricePaise && (
                                <s className="text-sm tabular-nums text-cream/45">{rupees(variant.compareAtPricePaise)}</s>
                            )}
                            <span className="ml-auto text-[11px] text-cream/45">Taxes included</span>
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
                            <p className="mt-5 text-sm leading-relaxed text-cream/70">
                                {product.description || product.shortDescription}
                            </p>
                        )}

                        {variant && (
                            <p className="mt-4 text-xs text-cream/55" aria-live="polite">
                                {outOfStock
                                    ? 'Out of stock — please select another variant.'
                                    : `Selected: ${variantOptionLabel(variant)} · SKU ${variant.sku}`}
                            </p>
                        )}

                        {/* Action Stepper + Add to Cart Button */}
                        <div className="mt-7 flex gap-3">
                            <div className="glass-pill flex h-12 items-center rounded-2xl px-1 border-white/10">
                                <button
                                    className="grid size-10 place-items-center rounded-xl text-cream/70 hover:bg-white/10 hover:text-cream disabled:opacity-40"
                                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                    disabled={outOfStock}
                                    aria-label="Decrease quantity"
                                >
                                    <IconMinus size={14} />
                                </button>
                                <span className="w-8 text-center text-sm font-semibold tabular-nums text-cream">
                                    {quantity}
                                </span>
                                <button
                                    className="grid size-10 place-items-center rounded-xl text-cream/70 hover:bg-white/10 hover:text-cream disabled:opacity-40"
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
                                className="button-primary flex-1 rounded-2xl py-3 px-6 text-sm font-semibold shadow-[0_8px_30px_rgba(212,175,55,0.25)] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {adding ? 'Adding to bag…' : outOfStock ? 'Out of Stock' : 'Add to Bag'}
                            </button>
                        </div>

                        {addError && (
                            <p className="mt-3 text-xs text-red-300" role="alert">
                                {addError}
                            </p>
                        )}

                        {/* Material & Details in Glass Rows */}
                        <dl className="mt-8 space-y-2 border-t border-white/10 pt-6 text-xs sm:text-sm">
                            {product.material && (
                                <div className="glass-card flex justify-between rounded-xl p-3 border border-white/5">
                                    <dt className="text-cream/60">Craft Material</dt>
                                    <dd className="font-medium text-cream">{product.material}</dd>
                                </div>
                            )}
                            <div className="glass-card flex justify-between rounded-xl p-3 border border-white/5">
                                <dt className="text-cream/60">Packaging Safety</dt>
                                <dd className="font-medium text-cream">Multi-layer bubble & foam</dd>
                            </div>
                            <div className="glass-card flex justify-between rounded-xl p-3 border border-white/5">
                                <dt className="text-cream/60">Direct Store Concierge</dt>
                                <dd>
                                    <a
                                        href="https://wa.me/916282000289"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-gold-300 hover:text-gold-100 font-medium"
                                    >
                                        Ask on WhatsApp →
                                    </a>
                                </dd>
                            </div>
                        </dl>
                    </div>
                </section>
            </main>

            <TrustBadges />
            <StoreFooter />
        </div>
    );
};

export default ProductDetailPage;
