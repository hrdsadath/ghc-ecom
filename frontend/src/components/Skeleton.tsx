import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = 'h-4 w-full' }) => (
    <div className={`animate-pulse rounded-lg bg-stone-200/70 ${className}`} />
);

export const ProductCardSkeleton: React.FC = () => (
    <div className="glass-card group flex flex-col justify-between overflow-hidden rounded-2xl border-[1.5px] border-[#c99738]/40 p-3 sm:p-4 bg-white/90 shadow-[0_4px_18px_rgba(201,151,56,0.1)]">
        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-stone-50 p-4 border border-stone-200/60 flex items-center justify-center">
            <div className="size-3/4 rounded-xl bg-stone-200/60 animate-pulse" />
        </div>
        <div className="mt-3 flex-1 flex flex-col justify-between">
            <div>
                <Skeleton className="h-3 w-16 rounded-full bg-gold-500/20" />
                <Skeleton className="mt-2.5 h-4 w-full rounded bg-stone-200/80" />
                <Skeleton className="mt-1.5 h-4 w-2/3 rounded bg-stone-200/80" />
            </div>
            <div className="mt-4 flex items-center justify-between pt-2 border-t border-stone-200/70">
                <Skeleton className="h-5 w-20 rounded bg-stone-200/80" />
                <Skeleton className="h-4 w-14 rounded-full bg-gold-500/20" />
            </div>
        </div>
    </div>
);

export const TableRowSkeleton: React.FC<{ cols?: number }> = ({ cols = 5 }) => (
    <tr>
        {Array.from({ length: cols }).map((_, i) => (
            <td key={i} className="p-4">
                <Skeleton className="h-4 w-full bg-stone-200/70" />
            </td>
        ))}
    </tr>
);

export const ProductDetailSkeleton: React.FC = () => (
    <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-8 sm:px-8 lg:grid-cols-2 lg:px-12 lg:py-12 animate-pulse">
        {/* Media Stage Skeleton */}
        <div className="space-y-4">
            <div className="glass-panel aspect-square w-full rounded-3xl border border-stone-200/80 bg-white/90 p-8 flex items-center justify-center shadow-sm">
                <div className="size-4/5 rounded-2xl bg-stone-200/60" />
            </div>
            <div className="flex gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="size-16 sm:size-20 rounded-xl border border-stone-200/70 bg-stone-100/80" />
                ))}
            </div>
        </div>

        {/* Purchase Panel Skeleton */}
        <div className="glass-panel rounded-3xl p-6 sm:p-8 space-y-6 border border-stone-200/80 bg-white/90 shadow-sm">
            <div className="h-4 w-28 rounded-full bg-gold-500/20" />
            <div className="space-y-2">
                <div className="h-8 w-3/4 rounded-xl bg-stone-200/70" />
                <div className="h-8 w-1/2 rounded-xl bg-stone-200/60" />
            </div>
            <div className="h-9 w-44 rounded-xl bg-stone-200/60" />
            <div className="space-y-3 pt-4 border-t border-stone-200/70">
                <div className="h-4 w-32 rounded-full bg-stone-200/60" />
                <div className="flex gap-2">
                    <div className="h-10 w-24 rounded-full bg-stone-200/60" />
                    <div className="h-10 w-24 rounded-full bg-stone-200/60" />
                </div>
            </div>
            <div className="space-y-2 pt-4">
                <div className="h-4 w-full rounded bg-stone-200/50" />
                <div className="h-4 w-5/6 rounded bg-stone-200/50" />
            </div>
            <div className="h-12 w-full rounded-2xl bg-gold-500/20" />
        </div>
    </div>
);

export const HomePageSkeleton: React.FC = () => (
    <div className="mx-auto max-w-[1440px] px-4 pt-4 sm:px-8 sm:pt-8 lg:px-12 space-y-12">
        {/* Hero Banner Skeleton */}
        <div className="glass-panel relative grid overflow-hidden rounded-3xl border border-stone-200/80 p-6 sm:p-10 lg:grid-cols-12 lg:items-center lg:gap-12 lg:p-14 bg-white/90">
            <div className="lg:col-span-7 space-y-6">
                <Skeleton className="h-6 w-44 rounded-full bg-gold-500/20" />
                <div className="space-y-3">
                    <Skeleton className="h-12 w-3/4 sm:h-16 rounded-2xl bg-stone-200/80" />
                    <Skeleton className="h-12 w-1/2 sm:h-16 rounded-2xl bg-stone-200/70" />
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-4 w-full rounded bg-stone-200/70" />
                    <Skeleton className="h-4 w-4/5 rounded bg-stone-200/70" />
                </div>
                <div className="flex gap-4 pt-2">
                    <Skeleton className="h-12 w-44 rounded-2xl bg-gold-500/20" />
                    <Skeleton className="h-12 w-48 rounded-2xl bg-stone-200/70" />
                </div>
            </div>
            <div className="relative mt-8 lg:mt-0 lg:col-span-5 aspect-[4/3] rounded-2xl border border-stone-200/70 bg-stone-100 overflow-hidden sm:aspect-[16/11]" />
        </div>

        {/* Categories Strip Skeleton */}
        <div className="space-y-4">
            <Skeleton className="h-4 w-32 rounded-full bg-gold-500/20" />
            <div className="flex gap-3 overflow-x-auto pb-2">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-28 shrink-0 rounded-full bg-stone-200/70" />
                ))}
            </div>
        </div>

        {/* Product Grid Skeleton */}
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4 lg:gap-8 pb-16">
            {Array.from({ length: 8 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
            ))}
        </div>
    </div>
);

export const CategoryPageSkeleton: React.FC = () => (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-8">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-12 rounded bg-stone-200/70" />
            <span className="text-stone-300">/</span>
            <Skeleton className="h-4 w-28 rounded bg-stone-200/70" />
        </div>
        {/* Header Pavilion Skeleton */}
        <div className="glass-panel rounded-3xl border border-stone-200/80 p-6 sm:p-10 space-y-3 bg-white/90">
            <Skeleton className="h-3 w-32 rounded-full bg-gold-500/20" />
            <Skeleton className="h-10 w-64 sm:h-12 rounded-xl bg-stone-200/80" />
            <Skeleton className="h-4 w-40 rounded bg-stone-200/70" />
        </div>
        {/* Product Grid */}
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4 lg:gap-8 pb-16">
            {Array.from({ length: 8 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
            ))}
        </div>
    </div>
);

export const SearchPageSkeleton: React.FC = () => (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-8">
        {/* Search Header Pavilion */}
        <div className="glass-panel rounded-3xl border border-stone-200/80 p-6 sm:p-10 space-y-4 bg-white/90">
            <Skeleton className="h-3 w-32 rounded-full bg-gold-500/20" />
            <Skeleton className="h-10 w-72 rounded-xl bg-stone-200/80" />
            <Skeleton className="h-12 w-full max-w-2xl rounded-2xl bg-stone-100" />
        </div>
        {/* Results grid */}
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4 lg:gap-8 pb-16">
            {Array.from({ length: 8 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
            ))}
        </div>
    </div>
);

export const CartPageSkeleton: React.FC = () => (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-8">
        <div className="glass-panel rounded-3xl border border-stone-200/80 p-6 sm:p-10 space-y-3 bg-white/90">
            <Skeleton className="h-3 w-28 rounded-full bg-gold-500/20" />
            <Skeleton className="h-10 w-52 rounded-xl bg-stone-200/80" />
            <Skeleton className="h-4 w-36 rounded bg-stone-200/70" />
        </div>
        <div className="grid gap-8 lg:grid-cols-12 pb-16">
            <div className="space-y-4 lg:col-span-8">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="glass-card flex items-center justify-between gap-6 rounded-2xl p-5 border border-stone-200/80 bg-white/90">
                        <div className="flex items-center gap-4">
                            <Skeleton className="size-20 rounded-xl bg-stone-200/70" />
                            <div className="space-y-2">
                                <Skeleton className="h-5 w-44 rounded bg-stone-200/80" />
                                <Skeleton className="h-3 w-24 rounded bg-stone-200/60" />
                            </div>
                        </div>
                        <div className="flex items-center gap-6">
                            <Skeleton className="h-9 w-24 rounded-full bg-stone-200/70" />
                            <Skeleton className="h-6 w-16 rounded bg-stone-200/80" />
                        </div>
                    </div>
                ))}
            </div>
            <div className="lg:col-span-4">
                <div className="glass-panel rounded-3xl p-6 sm:p-8 space-y-6 border border-stone-200/80 bg-white/90">
                    <Skeleton className="h-6 w-36 rounded-xl bg-stone-200/80" />
                    <div className="space-y-3 pt-4 border-t border-stone-200/70">
                        <div className="flex justify-between"><Skeleton className="h-4 w-20 rounded bg-stone-200/70" /><Skeleton className="h-4 w-16 rounded bg-stone-200/70" /></div>
                        <div className="flex justify-between"><Skeleton className="h-4 w-24 rounded bg-stone-200/70" /><Skeleton className="h-4 w-12 rounded bg-stone-200/70" /></div>
                        <div className="flex justify-between pt-4 border-t border-stone-200/70"><Skeleton className="h-6 w-16 rounded bg-stone-200/80" /><Skeleton className="h-6 w-24 rounded bg-stone-200/80" /></div>
                    </div>
                    <Skeleton className="h-12 w-full rounded-2xl bg-gold-500/20" />
                </div>
            </div>
        </div>
    </div>
);

export const AccountPageSkeleton: React.FC = () => (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-8 lg:px-12 lg:py-12 space-y-8">
        <div className="glass-panel rounded-3xl border border-stone-200/80 p-6 sm:p-10 space-y-3 bg-white/90">
            <Skeleton className="h-3 w-28 rounded-full bg-gold-500/20" />
            <Skeleton className="h-10 w-64 rounded-xl bg-stone-200/80" />
            <Skeleton className="h-4 w-48 rounded bg-stone-200/70" />
        </div>
        <div className="flex gap-3 border-b border-stone-200/80 pb-4">
            <Skeleton className="h-10 w-28 rounded-full bg-gold-500/20" />
            <Skeleton className="h-10 w-28 rounded-full bg-stone-200/70" />
            <Skeleton className="h-10 w-28 rounded-full bg-stone-200/70" />
        </div>
        <div className="space-y-4 pb-16">
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="glass-card rounded-2xl p-6 border border-stone-200/80 space-y-4 bg-white/90">
                    <div className="flex justify-between">
                        <Skeleton className="h-5 w-32 rounded bg-stone-200/80" />
                        <Skeleton className="h-5 w-24 rounded bg-stone-200/80" />
                    </div>
                    <Skeleton className="h-16 w-full rounded-xl bg-stone-200/70" />
                </div>
            ))}
        </div>
    </div>
);
