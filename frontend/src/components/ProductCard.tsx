import React, { useState } from 'react';
import Image from 'next/image';
import { Link } from '../lib/router';
import { useCart } from '../contexts/CartContext';
import { useWishlist } from '../contexts/WishlistContext';
import { fallbackImage, rupees } from '../lib/commerce';
import { lowestPricedVariant, primaryImageForVariant, productHasColourOptions, variantPricesDiffer } from '../lib/product-options';
import { Product } from '../types';
import { IconHeart } from './Icons';

const ProductCard = ({ product, priority = false }: { product: Product; priority?: boolean }) => {
    const { addVariant } = useCart();
    const { isInWishlist, toggleWishlist } = useWishlist();
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState('');

    const variant = lowestPricedVariant(product) ?? product.variants?.[0];
    const hasVariablePrices = variantPricesDiffer(product);
    const outOfStock = !variant || variant.availableStock <= 0;
    const image = primaryImageForVariant(product, variant)?.mediumUrl || fallbackImage;
    const isWishlisted = isInWishlist(product.id);
    const hasDiscount = Boolean(variant?.compareAtPricePaise && variant.compareAtPricePaise > variant.pricePaise);

    const add = async () => {
        if (!variant || outOfStock) {
            setError('This product is currently out of stock.');
            return;
        }
        setAdding(true);
        setError('');
        try {
            await addVariant(variant);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Could not add this item.');
        } finally {
            setAdding(false);
        }
    };

    return (
        <article className="glass-card group relative flex flex-col justify-between overflow-hidden rounded-2xl p-3 sm:p-4 transition-all duration-300 hover:-translate-y-1 hover:border-gold-400/40 hover:shadow-[0_20px_40px_-15px_rgba(212,175,55,0.18)]">
            {/* Image Stage with Soft Ambient Radial Lighting */}
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl border border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.09)_0%,transparent_70%)] transition-opacity duration-500 group-hover:opacity-100" />
                
                <Link to={`/product/${product.slug}`} className="relative block h-full w-full" aria-label={`View ${product.name}`}>
                    <Image
                        src={image}
                        alt={product.images?.[0]?.altText || product.name}
                        fill
                        priority={priority}
                        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                        className="h-full w-full object-contain p-4 transition-transform duration-500 ease-out group-hover:scale-105"
                        onError={(event) => {
                            event.currentTarget.src = fallbackImage;
                        }}
                    />
                </Link>

                {/* Floating Frosted Wishlist Pill */}
                <button
                    onClick={() => toggleWishlist(product.id)}
                    className={`glass-pill absolute right-3 top-3 grid size-9 sm:size-10 place-items-center rounded-full transition-all duration-200 hover:scale-110 active:scale-95 z-10 ${
                        isWishlisted
                            ? 'border-gold-400/60 bg-gold-400/20 text-gold-300 shadow-[0_0_14px_rgba(212,175,55,0.45)]'
                            : 'text-cream/70 hover:border-white/20 hover:text-cream'
                    }`}
                    aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
                    aria-pressed={isWishlisted}
                >
                    <IconHeart size={16} />
                </button>

                {/* Floating Status Badges */}
                <div className="absolute left-3 top-3 flex flex-col gap-1.5 z-10 pointer-events-none">
                    {hasDiscount && (
                        <span className="glass-pill rounded-full border-gold-400/40 bg-gold-400/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-300 backdrop-blur-md">
                            Sale
                        </span>
                    )}
                    {outOfStock && (
                        <span className="rounded-full border border-white/10 bg-obsidian/80 px-2.5 py-0.5 text-[10px] font-medium tracking-wide text-cream/70 backdrop-blur-md">
                            Sold Out
                        </span>
                    )}
                </div>
            </div>

            {/* Product Meta & Actions */}
            <div className="flex flex-col flex-1 justify-between gap-3 pt-3.5 sm:pt-4">
                <div>
                    <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-400/80">
                        {product.category?.name || 'Artisanal Collection'}
                    </p>
                    <h3 className="mt-1 font-display text-base sm:text-lg font-medium leading-snug tracking-tight text-cream/95 transition-colors group-hover:text-gold-200">
                        <Link to={`/product/${product.slug}`} className="line-clamp-1">
                            {product.name}
                        </Link>
                    </h3>
                </div>

                <div className="space-y-3 pt-1">
                    <div className="flex items-baseline gap-2">
                        <span className="text-base sm:text-lg font-semibold tabular-nums text-cream">
                            {variant ? `${hasVariablePrices ? 'From ' : ''}${rupees(variant.pricePaise)}` : 'Unavailable'}
                        </span>
                        {hasDiscount && (
                            <s className="text-xs tabular-nums text-cream/40">
                                {rupees(variant!.compareAtPricePaise!)}
                            </s>
                        )}
                    </div>

                    <div>
                        {product.variants.length > 1 ? (
                            <Link
                                to={`/product/${product.slug}`}
                                className="glass-pill flex min-h-10 w-full items-center justify-center rounded-xl px-3 py-2 text-center text-xs sm:text-sm font-medium tracking-wide text-gold-300 transition-all hover:border-gold-400/50 hover:bg-gold-400/20 hover:text-white"
                            >
                                {productHasColourOptions(product) ? 'Choose Options' : 'View Details'}
                            </Link>
                        ) : (
                            <button
                                disabled={outOfStock || adding}
                                onClick={add}
                                className="button-primary flex min-h-10 w-full items-center justify-center rounded-xl text-xs sm:text-sm font-medium tracking-wide disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {adding ? 'Adding…' : outOfStock ? 'Out of Stock' : 'Add to Cart'}
                            </button>
                        )}
                    </div>
                </div>

                {error && (
                    <p className="mt-1 text-[11px] text-red-300/90" role="alert">
                        {error}
                    </p>
                )}
            </div>
        </article>
    );
};

export default ProductCard;
