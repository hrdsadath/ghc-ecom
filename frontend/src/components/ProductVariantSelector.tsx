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
    color: "Colour",
    size: "Size",
    packQuantity: "Pack",
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
                <legend className="mb-3 text-sm font-semibold text-cream">Option</legend>
                <div className="flex flex-wrap gap-2">
                    {product.variants.map((variant) => {
                        const unavailable = !variant.isActive || variant.availableStock <= 0;
                        return (
                            <label key={variant.id} className={unavailable ? "cursor-not-allowed opacity-45" : "cursor-pointer"}>
                                <input
                                    className="peer sr-only"
                                    type="radio"
                                    name={`option-${product.id}`}
                                    checked={variant.id === selected.id}
                                    disabled={unavailable}
                                    onChange={() => onSelect(variant.id)}
                                />
                                <span className="flex min-h-11 items-center border px-4 text-sm text-cream/70 peer-checked:border-gold-400 peer-checked:bg-gold-400/10 peer-checked:text-cream peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold-300">
                                    {variantOptionLabel(variant)}
                                    {unavailable ? " — Out of stock" : ""}
                                </span>
                            </label>
                        );
                    })}
                </div>
            </fieldset>
        );
    }

    return (
        <div className={compact ? "mt-5 space-y-5" : "mt-6 space-y-5"}>
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
                        <legend className="mb-3 text-sm font-semibold text-cream">
                            {dimensionName[dimension]}:{" "}
                            <span className="font-normal text-cream/70">{selectedValue ? variantDimensionLabel(dimension, selectedValue) : "Choose"}</span>
                        </legend>
                        <div className="flex flex-wrap gap-2">
                            {values.map((value) => {
                                const candidate = matchingVariant(product, selected, dimension, value);
                                const unavailable = !candidate || candidate.availableStock <= 0;
                                const image = dimension === "color" && candidate ? primaryImageForVariant(product, candidate) : undefined;
                                const colorHex = dimension === "color" && candidate ? variantColorHex(candidate) : undefined;
                                return (
                                    <label key={value} className={unavailable ? "cursor-not-allowed opacity-45" : "cursor-pointer"}>
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
                                            className={`flex min-h-12 items-center gap-2 border px-3 text-sm text-cream/70 transition-colors hover:border-cream/40 hover:text-cream peer-checked:border-gold-400 peer-checked:bg-gold-400/10 peer-checked:text-cream peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold-300 ${compact ? "" : "sm:px-4"}`}
                                        >
                                            {image ? (
                                                <img loading="lazy" decoding="async" src={image.thumbnailUrl} alt="" className="size-8 shrink-0 bg-panel object-contain" />
                                            ) : colorHex ? (
                                                <span className="size-6 shrink-0 rounded-full border border-cream/25" style={{ backgroundColor: colorHex }} aria-hidden="true" />
                                            ) : null}
                                            <span>
                                                {variantDimensionLabel(dimension, value)}
                                                {unavailable ? " — Out of stock" : ""}
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
