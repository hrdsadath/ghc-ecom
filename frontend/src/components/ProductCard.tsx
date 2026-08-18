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
        <article className="group min-w-0 overflow-hidden rounded-sm border border-line bg-carbon transition hover:border-gold-400/40">
            <div className="relative aspect-[4/5] overflow-hidden bg-panel">
                <Link to={`/product/${product.slug}`} className="relative block h-full" aria-label={`View ${product.name}`}>
                    <Image
                        src={image}
                        alt={product.images?.[0]?.altText || product.name}
                        fill
                        priority={priority}
                        sizes="(min-width: 1024px) 25vw, 50vw"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        onError={(event) => {
                            event.currentTarget.src = fallbackImage;
                        }}
                    />
                </Link>
                <button
                    onClick={() => toggleWishlist(product.id)}
                    className={`absolute right-3 top-3 grid size-11 place-items-center bg-obsidian/90 ${isWishlisted ? 'text-gold-300' : 'text-cream/70 hover:text-cream'}`}
                    aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
                    aria-pressed={isWishlisted}
                >
                    <span className="rounded-full border border-white/5 bg-obsidian/70 p-2">
                        <IconHeart size={18} />
                    </span>
                </button>
            </div>

            <div className="space-y-4 border-t border-line px-3 py-4">
                <p className="text-xs tracking-wide text-cream/55">{product.category?.name || 'Homeware'}</p>
                <h3 className="font-display text-2xl font-semibold leading-tight text-cream">
                    <Link to={`/product/${product.slug}`} className="hover:text-gold-200">
                        {product.name}
                    </Link>
                </h3>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold tabular-nums text-cream">{variant ? `${hasVariablePrices ? 'From ' : ''}${rupees(variant.pricePaise)}` : 'Unavailable'}</span>
                        {hasDiscount && <s className="text-xs tabular-nums text-cream/60">{rupees(variant!.compareAtPricePaise!)}</s>}
                    </div>
                    <div className="w-full sm:w-auto">
                        {product.variants.length > 1 ? (
                            <Link
                                to={`/product/${product.slug}`}
                                className="grid min-h-11 w-full min-w-0 place-items-center px-3 py-2 text-sm font-semibold text-gold-300 transition hover:text-gold-100 sm:w-auto sm:px-4"
                            >
                                {productHasColourOptions(product) ? 'Choose options' : 'Choose option'}
                            </Link>
                        ) : (
                            <button
                                disabled={outOfStock || adding}
                                onClick={add}
                                className="button-primary w-full min-w-0 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
                            >
                                {adding ? 'Adding to cart…' : outOfStock ? 'Out of stock' : 'Add to cart'}
                            </button>
                        )}
                    </div>
                </div>
                {error && (
                    <p className="mt-2 text-xs text-red-200" role="alert">
                        {error}
                    </p>
                )}
            </div>
        </article>
    );
};

export default ProductCard;
