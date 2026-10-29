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
        <article className="glass-card group relative flex flex-col justify-between overflow-hidden rounded-2xl p-3 sm:p-4 border-[1.5px] border-[#c99738] shadow-[0_4px_18px_rgba(201,151,56,0.14)] transition-all duration-300 hover:-translate-y-1.5 hover:border-stone-900 hover:shadow-[0_22px_45px_-8px_rgba(26,24,21,0.2)]">
            {/* Image Stage: Square, Centered, Luxury Display Pedestal */}
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-[#c99738]/25 bg-white transition-colors duration-300 group-hover:border-stone-300">
                {/* Radial Gold Ambient Spotlight */}
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(212,175,55,0.1)_0%,transparent_72%)] transition-opacity duration-500 group-hover:opacity-100" />
                
                <Link to={`/product/${product.slug}`} className="relative block h-full w-full p-2 sm:p-2.5" aria-label={`View ${product.name}`}>
                    <Image
                        src={image}
                        alt={product.images?.[0]?.altText || product.name}
                        fill
                        priority={priority}
                        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                        className="h-full w-full object-contain transition-transform duration-500 ease-out group-hover:scale-105"
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
                            ? 'border-gold-500/70 bg-gold-500/20 text-gold-600 shadow-sm'
                            : 'text-cream/70 hover:border-gold-500/50 hover:text-gold-600'
                    }`}
                    aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
                    aria-pressed={isWishlisted}
                >
                    <IconHeart size={16} />
                </button>

                {/* Floating Status Badges */}
                <div className="absolute left-3 top-3 flex flex-col gap-1.5 z-10 pointer-events-none">
                    {hasDiscount && (
                        <span className="glass-pill rounded-full border-gold-500/40 bg-gold-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-700 backdrop-blur-md shadow-sm">
                            Sale
                        </span>
                    )}
                    {outOfStock && (
                        <span className="rounded-full border border-stone-300 bg-stone-900/85 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-white backdrop-blur-md shadow-sm">
                            Sold Out
                        </span>
                    )}
                </div>
            </div>

            {/* Product Meta & Actions */}
            <div className="flex flex-col flex-1 justify-between gap-3 pt-3.5 sm:pt-4">
                <div>
                    <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em] text-gold-600">
                        {product.category?.name || 'Artisanal Collection'}
                    </p>
                    <h3 className="mt-1 font-display text-base sm:text-lg font-semibold leading-snug tracking-tight text-cream transition-colors group-hover:text-gold-700 min-h-[2.8rem]">
                        <Link to={`/product/${product.slug}`} className="line-clamp-2">
                            {product.name}
                        </Link>
                    </h3>
                </div>

                <div className="space-y-3 pt-1">
                    <div className="flex items-baseline gap-2">
                        <span className="text-base sm:text-lg font-bold tabular-nums text-cream">
                            {variant ? `${hasVariablePrices ? 'From ' : ''}${rupees(variant.pricePaise)}` : 'Unavailable'}
                        </span>
                        {hasDiscount && (
                            <s className="text-xs font-medium tabular-nums text-cream/55">
                                {rupees(variant!.compareAtPricePaise!)}
                            </s>
                        )}
                    </div>

                    <div>
                        {product.variants.length > 1 ? (
                            <Link
                                to={`/product/${product.slug}`}
                                className="glass-pill flex min-h-10 w-full items-center justify-center rounded-xl px-3 py-2 text-center text-xs sm:text-sm font-semibold tracking-wide text-gold-700 transition-all hover:border-gold-500/60 hover:bg-gold-500/15 hover:text-gold-900"
                            >
                                {productHasColourOptions(product) ? 'Choose Options' : 'View Details'}
                            </Link>
                        ) : (
                            <button
                                disabled={outOfStock || adding}
                                onClick={add}
                                className="button-primary flex min-h-10 w-full items-center justify-center rounded-xl text-xs sm:text-sm font-semibold tracking-wide disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {adding ? 'Adding…' : outOfStock ? 'Out of Stock' : 'Add to Cart'}
                            </button>
                        )}
                    </div>
                </div>

                {error && (
                    <p className="mt-1 text-[11px] text-red-300" role="alert">
                        {error}
                    </p>
                )}
            </div>
        </article>
    );
};

export default ProductCard;
