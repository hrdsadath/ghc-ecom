import React, { useEffect, useState } from 'react';
import { useCart } from '../contexts/CartContext';
import { useDialog } from '../hooks/useDialog';
import { useWishlist } from '../contexts/WishlistContext';
import { Product } from '../types';
import { IconCheck, IconHeart, IconMinus, IconPlus, IconShieldCheck, IconX } from './Icons';
import ProductVariantSelector from './ProductVariantSelector';
import { primaryImageForVariant } from '../lib/product-options';

interface QuickViewModalProps {
    product: Product | null;
    onClose: () => void;
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

const QuickViewModal: React.FC<QuickViewModalProps> = ({ product, onClose }) => {
    const { addVariant } = useCart();
    const { isInWishlist, toggleWishlist } = useWishlist();
    const [selectedVariantId, setSelectedVariantId] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [adding, setAdding] = useState(false);
    const [added, setAdded] = useState(false);
    const [error, setError] = useState('');
    const dialogRef = useDialog<HTMLDivElement>(Boolean(product), onClose);

    useEffect(() => {
        if (!product) return;
        setSelectedVariantId(product.variants.find((variant) => variant.availableStock > 0)?.id || product.variants[0]?.id || '');
        setQuantity(1);
        setAdded(false);
        setError('');
    }, [product]);

    if (!product) return null;

    const variant = product.variants.find((item) => item.id === selectedVariantId) || product.variants[0];
    const outOfStock = !variant || variant.availableStock <= 0;
    const image = primaryImageForVariant(product, variant)?.mediumUrl;
    const isWishlisted = isInWishlist(product.id);

    const handleAddToCart = async () => {
        if (!variant || outOfStock) {
            setError('This product is currently out of stock.');
            return;
        }
        setAdding(true);
        setError('');
        try {
            await addVariant(variant, quantity);
            setAdded(true);
            setTimeout(() => setAdded(false), 2000);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'This item could not be added.');
        } finally {
            setAdding(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/80 p-3 backdrop-blur-md animate-fade-in sm:p-4">
            <div
                ref={dialogRef}
                tabIndex={-1}
                className="relative grid max-h-[calc(100svh-1.5rem)] w-full max-w-4xl overflow-y-auto rounded-sm border border-gold-500/30 bg-carbon shadow-2xl outline-none md:grid-cols-2 md:overflow-hidden"
                role="dialog"
                aria-modal="true"
                aria-labelledby="quick-view-title"
            >
                <button
                    onClick={onClose}
                    aria-label="Close quick view"
                    className="absolute top-4 right-4 z-10 p-2 text-cream/50 hover:text-cream bg-obsidian/60 rounded-full border border-gold-500/20"
                >
                    <IconX size={18} />
                </button>

                <div className="relative flex aspect-[16/10] items-center justify-center border-b border-gold-500/20 bg-obsidian p-5 sm:aspect-square sm:p-6 md:aspect-auto md:border-b-0 md:border-r">
                    {image ? (
                        <img src={image} alt={product.name} decoding="async" className="max-h-[380px] w-full object-contain" />
                    ) : (
                        <div className="text-gold-400 font-display text-4xl">GLOCKERY</div>
                    )}
                    <button
                        onClick={() => toggleWishlist(product.id)}
                        aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
                        className={`absolute top-4 left-4 p-2.5 rounded-full border ${isWishlisted ? 'border-gold-400 bg-gold-400 text-obsidian' : 'border-gold-500/30 bg-obsidian/60 text-cream/70 hover:text-gold-300'}`}
                    >
                        <IconHeart size={18} />
                    </button>
                </div>

                <div className="p-6 md:p-8 flex flex-col justify-between overflow-y-auto max-h-[80vh] md:max-h-none">
                    <div>
                        <p className="eyebrow mb-2">Product preview</p>
                        <h2 id="quick-view-title" className="font-display text-3xl text-cream leading-tight">
                            {product.name}
                        </h2>
                        <p className="mt-3 text-xs text-cream/60 leading-relaxed line-clamp-3">{product.description}</p>

                        <ProductVariantSelector
                            product={product}
                            selectedVariantId={variant?.id || ''}
                            onSelect={(variantId) => {
                                setSelectedVariantId(variantId);
                                const nextVariant = product.variants.find((item) => item.id === variantId);
                                setQuantity((current) => Math.min(current, Math.max(1, nextVariant?.availableStock || 1)));
                                setAdded(false);
                                setError('');
                            }}
                            compact
                        />

                        <div className="mt-6 flex items-baseline gap-3">
                            <span className="font-display text-3xl text-gold-300">{variant ? rupees(variant.pricePaise) : 'Unavailable'}</span>
                            {variant?.compareAtPricePaise && <span className="text-xs text-cream/40 line-through">{rupees(variant.compareAtPricePaise)}</span>}
                        </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-gold-500/15 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="flex border border-gold-500/30 rounded-sm">
                                <button
                                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                    aria-label="Decrease quantity"
                                    className="w-10 h-10 grid place-items-center text-cream/60 hover:text-cream"
                                >
                                    <IconMinus size={14} />
                                </button>
                                <span className="w-10 h-10 grid place-items-center text-sm font-bold text-cream">{quantity}</span>
                                <button
                                    onClick={() => setQuantity(quantity + 1)}
                                    disabled={outOfStock || quantity >= (variant?.availableStock || 0)}
                                    aria-label="Increase quantity"
                                    className="w-10 h-10 grid place-items-center text-cream/60 hover:text-cream"
                                >
                                    <IconPlus size={14} />
                                </button>
                            </div>
                            <button
                                disabled={outOfStock || adding}
                                onClick={handleAddToCart}
                                className="flex-1 h-10 bg-gold-400 text-obsidian text-xs font-bold uppercase tracking-widest hover:bg-gold-300 disabled:opacity-50 transition flex items-center justify-center gap-2 rounded-sm"
                            >
                                {adding ? (
                                    'Adding to cart…'
                                ) : added ? (
                                    <>
                                        <IconCheck size={16} /> Added to cart
                                    </>
                                ) : (
                                    outOfStock ? 'Out of Stock' : 'Add to cart'
                                )}
                            </button>
                        </div>

                        {error && (
                            <p className="text-xs text-red-200" role="alert">
                                {error}
                            </p>
                        )}

                        <div className="grid grid-cols-2 gap-2 text-[10px] text-cream/50 pt-2">
                            <span className="flex items-center gap-1.5">
                                <IconCheck size={14} className="text-gold-400" /> Carefully packed order
                            </span>
                            <span className="flex items-center gap-1.5">
                                <IconShieldCheck size={14} className="text-gold-400" /> 100% Authentic Guarantee
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QuickViewModal;
