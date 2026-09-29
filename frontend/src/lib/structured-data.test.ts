import { describe, expect, it } from "vitest";
import { Product } from "../types";
import { metaDescription } from "./site";
import { breadcrumbSchema, faqSchema, productSchema } from "./structured-data";

const product: Product = {
    id: "product-id",
    categoryId: "category-id",
    name: "Porcelain Tea Set",
    slug: "porcelain-tea-set",
    status: "PUBLISHED",
    description: "Green and gold tea set with tray.",
    material: "Ceramic",
    category: { id: "category-id", name: "Tea Set", slug: "tea-set", isPublished: true, sortOrder: 0 },
    variants: [
        { id: "v1", sku: "TEA-GREEN", pricePaise: 890_000, isActive: true, availableStock: 0 },
        { id: "v2", sku: "TEA-PURPLE", pricePaise: 890_000, isActive: true, availableStock: 2 },
    ],
    images: [
        { id: "i1", thumbnailUrl: "t.webp", mediumUrl: "m.webp", largeUrl: "https://cdn.example/l.webp", altText: "Tea set", sortOrder: 0 },
    ],
    videos: [],
};

describe("productSchema", () => {
    it("emits a single Offer in rupees that is in stock when any variant has stock", () => {
        const schema = productSchema(product);
        expect(schema.offers).toMatchObject({
            "@type": "Offer",
            priceCurrency: "INR",
            price: "8900.00",
            availability: "https://schema.org/InStock",
            itemCondition: "https://schema.org/NewCondition",
        });
        expect(schema).toMatchObject({ category: "Tea Set", material: "Ceramic", image: ["https://cdn.example/l.webp"] });
    });

    it("emits an AggregateOffer price range and marks sold-out products OutOfStock", () => {
        const schema = productSchema({
            ...product,
            variants: [
                { id: "v1", sku: "A", pricePaise: 50_000, isActive: true, availableStock: 0 },
                { id: "v2", sku: "B", pricePaise: 120_000, isActive: true, availableStock: 0 },
            ],
        });
        expect(schema.offers).toMatchObject({
            "@type": "AggregateOffer",
            lowPrice: "500.00",
            highPrice: "1200.00",
            offerCount: 2,
            availability: "https://schema.org/OutOfStock",
        });
    });
});

describe("breadcrumbSchema and faqSchema", () => {
    it("numbers breadcrumb items from 1 with absolute URLs", () => {
        const schema = breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Tea Set", path: "/category/tea-set" }]);
        const items = schema.itemListElement as Array<Record<string, unknown>>;
        expect(items.map((item) => item.position)).toEqual([1, 2]);
        expect(String(items[1].item)).toMatch(/^https?:\/\/.+\/category\/tea-set$/);
    });

    it("maps FAQ sections to Question and Answer pairs", () => {
        expect(faqSchema([{ title: "Where?", body: "Vengara." }]).mainEntity).toEqual([
            { "@type": "Question", name: "Where?", acceptedAnswer: { "@type": "Answer", text: "Vengara." } },
        ]);
    });
});

describe("metaDescription", () => {
    it("uses the fallback for empty text and collapses whitespace", () => {
        expect(metaDescription(null, "Fallback  copy")).toBe("Fallback copy");
    });

    it("trims long copy on a word boundary with an ellipsis", () => {
        const result = metaDescription("word ".repeat(60), "", 40);
        expect(result.length).toBeLessThanOrEqual(40);
        expect(result.endsWith("word…")).toBe(true);
    });
});
