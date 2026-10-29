import React, { useEffect, useRef, useState } from 'react';
import { useHistory } from '../lib/router';
import { useDialog } from '../hooks/useDialog';
import { IconArrowRight, IconSearch, IconX } from './Icons';
import { api } from '../lib/api';
import { Product } from '../types';

interface QuickSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const QuickSearchModal: React.FC<QuickSearchModalProps> = ({ isOpen, onClose }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const history = useHistory();
    const inputRef = useRef<HTMLInputElement>(null);
    const dialogRef = useDialog<HTMLDivElement>(isOpen, onClose, {
        initialFocusRef: inputRef,
        focusInitial: typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia('(min-width: 640px)').matches
            : true,
    });

    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            setError('');
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        setLoading(true);
        setError('');
        const timer = setTimeout(() => {
            api.products(new URLSearchParams({ q: query.trim(), limit: '5' }), controller.signal)
                .then((res) => setResults(res.items))
                .catch((caught) => {
                    if (controller.signal.aborted) return;
                    setResults([]);
                    setError(caught instanceof Error ? caught.message : 'Search is unavailable.');
                })
                .finally(() => {
                    if (!controller.signal.aborted) setLoading(false);
                });
        }, 200);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [query]);

    if (!isOpen) return null;

    const handleSelect = (slug: string) => {
        onClose();
        history.push(`/product/${slug}`);
    };

    const handleFullSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            onClose();
            history.push(`/search?q=${encodeURIComponent(query)}`);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-stone-900/40 px-3 pt-3 backdrop-blur-md animate-fade-in sm:px-4 sm:pt-20">
            <div ref={dialogRef} tabIndex={-1} className="max-h-[calc(100svh-1.5rem)] w-full max-w-2xl overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-2xl outline-none sm:max-h-[calc(100svh-6rem)]" role="dialog" aria-modal="true" aria-label="Search collection">
                <form onSubmit={handleFullSearch} className="flex items-center border-b border-stone-200/80 px-4 py-3 bg-stone-50/70">
                    <IconSearch className="text-gold-600 mr-3 shrink-0" size={20} />
                    <input
                        ref={inputRef}
                        type="text"
                        name="search"
                        aria-label="Search products"
                        autoComplete="off"
                        maxLength={100}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search dinner sets, tea sets, canisters..."
                        className="w-full bg-transparent text-cream placeholder-cream/40 outline-none text-base font-body"
                    />
                    {query && (
                        <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="p-1 text-cream/40 hover:text-cream">
                            <IconX size={16} />
                        </button>
                    )}
                    <button type="button" onClick={onClose} aria-label="Close search" className="ml-2 grid size-10 shrink-0 place-items-center rounded-xl border border-stone-200 text-xs uppercase tracking-widest text-cream/60 hover:border-gold-500 hover:text-gold-700 sm:ml-3 sm:h-auto sm:w-auto sm:px-2.5 sm:py-1">
                        <span className="hidden sm:inline">ESC</span><span className="sm:hidden"><IconX size={18} /></span>
                    </button>
                </form>

                <div className="max-h-96 overflow-y-auto p-4">
                    {loading ? (
                        <div className="py-8 text-center text-cream/50 text-xs uppercase tracking-widest animate-pulse">
                            Searching collection...
                        </div>
                    ) : error ? (
                        <div className="py-8 text-center" role="alert">
                            <p className="text-sm text-red-600">Search could not be loaded.</p>
                            <p className="mt-1 text-xs text-cream/60">{error} Try again in a moment.</p>
                        </div>
                    ) : query.trim() && results.length === 0 ? (
                        <div className="py-8 text-center">
                            <p className="text-sm text-cream/70">No pieces match &quot;{query}&quot;.</p>
                            <p className="text-xs text-gold-600 mt-1">Try searching for &quot;gold&quot;, &quot;cutlery&quot;, or &quot;jug&quot;</p>
                        </div>
                    ) : results.length > 0 ? (
                        <div className="space-y-2">
                            <p className="text-[10px] uppercase tracking-[0.25em] text-gold-600 mb-3 px-2 font-bold">Quick Matches</p>
                            {results.map((product) => {
                                const variant = product.variants?.[0];
                                return (
                                    <button
                                        type="button"
                                        key={product.id}
                                        onClick={() => handleSelect(product.slug)}
                                        className="group flex w-full items-center justify-between rounded-xl border border-stone-200/70 bg-stone-50/50 p-3 text-left transition hover:border-gold-500/50 hover:bg-stone-100"
                                    >
                                        <div className="flex items-center gap-3">
                                            {product.images?.[0]?.thumbnailUrl ? (
                                                <img src={product.images[0].thumbnailUrl} loading="lazy" decoding="async" alt={product.name} className="w-12 h-12 shrink-0 object-contain bg-white border border-stone-200/80 rounded-lg p-1" />
                                            ) : (
                                                <div className="w-12 h-12 bg-white border border-stone-200/80 rounded-lg grid place-items-center text-xs text-gold-600 font-display">G</div>
                                            )}
                                            <div>
                                                <h4 className="text-sm text-cream font-medium group-hover:text-gold-700 transition">{product.name}</h4>
                                                <p className="text-xs text-cream/50 line-clamp-1">{product.shortDescription}</p>
                                            </div>
                                        </div>
                                        {variant && (
                                            <span className="text-xs font-bold text-gold-700 shrink-0 ml-4 tabular-nums">
                                                ₹{(variant.pricePaise / 100).toLocaleString('en-IN')}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                            <button
                                type="submit"
                                className="w-full mt-3 py-2.5 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-gold-700 border border-gold-500/30 rounded-xl hover:border-gold-500 hover:bg-gold-500/10 transition"
                            >
                                View all results for &quot;{query}&quot; <IconArrowRight size={14} />
                            </button>
                        </div>
                    ) : (
                        <div className="py-6 px-2">
                            <p className="text-[10px] uppercase tracking-[0.25em] text-gold-600 mb-3 font-bold">Popular Searches</p>
                            <div className="flex flex-wrap gap-2">
                                {['Gold Cutlery', 'Tea Set', 'Borosilicate Kettle', 'Ceramic Canister', 'Serving Tray'].map((term) => (
                                    <button
                                        type="button"
                                        key={term}
                                        onClick={() => setQuery(term)}
                                        className="px-3.5 py-1.5 text-xs text-cream/75 border border-stone-200/80 bg-stone-50 hover:border-gold-500/60 hover:text-gold-700 transition rounded-xl shadow-xs"
                                    >
                                        {term}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default QuickSearchModal;
