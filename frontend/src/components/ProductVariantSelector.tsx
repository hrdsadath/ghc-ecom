import React from "react";
import {
    primaryImageForVariant,
    productVariantDimensions,
    VariantDimension,
    variantColorHex,
    variantDimensionLabel,
    variantDimensionValue,
    variantOptionLabel,
} from "../lib/product-options";
import { Product, ProductVariant } from "../types";

interface ProductVariantSelectorProps {
    product: Product;
    selectedVariantId: string;
    onSelect: (variantId: string) => void;
    compact?: boolean;
}

const dimensionName: Record<VariantDimension, string> = {
    color: "Colour Palette",
    size: "Size & Dimensions",
    packQuantity: "Set Pack",
};

const matchingVariant = (product: Product, selected: ProductVariant, dimension: VariantDimension, value: string): ProductVariant | undefined => {
    const dimensions = productVariantDimensions(product);
    const candidates = product.variants.filter(
        (variant) =>
            variant.isActive &&
            variantDimensionValue(variant, dimension) === value &&
            dimensions.every((other) => other === dimension || variantDimensionValue(variant, other) === variantDimensionValue(selected, other)),
    );
    return candidates.find((variant) => variant.availableStock > 0) ?? candidates[0];
};

const ProductVariantSelector: React.FC<ProductVariantSelectorProps> = ({ product, selectedVariantId, onSelect, compact = false }) => {
    const selected = product.variants.find((variant) => variant.id === selectedVariantId) || product.variants[0];
    if (!selected) return null;
    const dimensions = productVariantDimensions(product);

    if (dimensions.length === 0) {
        if (product.variants.length === 1) return null;
        return (
            <fieldset className={compact ? "mt-5" : "mt-6"}>
                <legend className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-gold-400/90">Option</legend>
                <div className="flex flex-wrap gap-2.5">
                    {product.variants.map((variant) => {
                        const unavailable = !variant.isActive || variant.availableStock <= 0;
                        return (
                            <label key={variant.id} className={unavailable ? "cursor-not-allowed opacity-40" : "cursor-pointer"}>
                                <input
                                    className="peer sr-only"
                                    type="radio"
                                    name={`option-${product.id}`}
                                    checked={variant.id === selected.id}
                                    disabled={unavailable}
                                    onChange={() => onSelect(variant.id)}
                                />
                                <span className="glass-pill flex min-h-11 items-center rounded-xl px-4 text-xs sm:text-sm font-medium text-cream/70 transition-all hover:border-white/30 peer-checked:border-gold-400/80 peer-checked:bg-gold-400/20 peer-checked:text-gold-200 peer-checked:shadow-[0_0_15px_rgba(212,175,55,0.25)]">
                                    {variantOptionLabel(variant)}
                                    {unavailable ? " (Sold Out)" : ""}
                                </span>
                            </label>
                        );
                    })}
                </div>
            </fieldset>
        );
    }

    return (
        <div className={compact ? "mt-5 space-y-5" : "mt-6 space-y-6"}>
            {dimensions.map((dimension) => {
                const values = [
                    ...new Set(
                        product.variants.flatMap((variant) => {
                            const value = variantDimensionValue(variant, dimension);
                            return value === undefined ? [] : [value];
                        }),
                    ),
                ];
                const selectedValue = variantDimensionValue(selected, dimension);
                return (
                    <fieldset key={dimension}>
                        <legend className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-gold-400/90">
                            {dimensionName[dimension]}:{" "}
                            <span className="font-normal normal-case tracking-normal text-cream/90">
                                {selectedValue ? variantDimensionLabel(dimension, selectedValue) : "Choose"}
                            </span>
                        </legend>
                        <div className="flex flex-wrap gap-2.5">
                            {values.map((value) => {
                                const candidate = matchingVariant(product, selected, dimension, value);
                                const unavailable = !candidate || candidate.availableStock <= 0;
                                const image = dimension === "color" && candidate ? primaryImageForVariant(product, candidate) : undefined;
                                const colorHex = dimension === "color" && candidate ? variantColorHex(candidate) : undefined;
                                return (
                                    <label key={value} className={unavailable ? "cursor-not-allowed opacity-40" : "cursor-pointer"}>
                                        <input
                                            className="peer sr-only"
                                            type="radio"
                                            name={`${dimension}-${product.id}`}
                                            value={candidate?.id ?? value}
                                            checked={value === selectedValue}
                                            disabled={unavailable}
                                            onChange={() => candidate && onSelect(candidate.id)}
                                        />
                                        <span
                                            className={`glass-pill flex min-h-12 items-center gap-2.5 rounded-xl px-3.5 text-xs sm:text-sm font-medium text-cream/70 transition-all hover:border-white/30 peer-checked:border-gold-400/80 peer-checked:bg-gold-400/20 peer-checked:text-gold-200 peer-checked:shadow-[0_0_15px_rgba(212,175,55,0.25)] ${
                                                compact ? "" : "sm:px-4"
                                            }`}
                                        >
                                            {image ? (
                                                <img loading="lazy" decoding="async" src={image.thumbnailUrl} alt="" className="size-7 shrink-0 rounded-lg bg-obsidian/60 object-contain p-0.5 border border-white/10" />
                                            ) : colorHex ? (
                                                <span className="size-5 shrink-0 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: colorHex }} aria-hidden="true" />
                                            ) : null}
                                            <span>
                                                {variantDimensionLabel(dimension, value)}
                                                {unavailable ? " (Sold Out)" : ""}
                                            </span>
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </fieldset>
                );
            })}
        </div>
    );
};

export default ProductVariantSelector;
