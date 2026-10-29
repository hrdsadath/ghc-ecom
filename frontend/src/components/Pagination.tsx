import React from 'react';
import { IconChevronLeft, IconChevronRight } from './Icons';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({ currentPage, totalPages, onPageChange }) => {
    if (totalPages <= 1) return null;

    return (
        <div className="flex items-center justify-center py-10">
            <div className="glass-panel inline-flex items-center gap-3 rounded-full border border-white/10 px-3 py-1.5 shadow-lg">
                <button
                    disabled={currentPage <= 1}
                    onClick={() => onPageChange(currentPage - 1)}
                    className="glass-pill grid size-9 place-items-center rounded-full text-cream/70 transition-all hover:border-gold-400/50 hover:text-gold-200 disabled:pointer-events-none disabled:opacity-30"
                    aria-label="Previous Page"
                >
                    <IconChevronLeft size={16} />
                </button>

                <span className="px-3 text-xs tracking-wide text-cream/70">
                    Page <strong className="font-semibold text-gold-300">{currentPage}</strong> of{' '}
                    <strong className="font-semibold text-cream">{totalPages}</strong>
                </span>

                <button
                    disabled={currentPage >= totalPages}
                    onClick={() => onPageChange(currentPage + 1)}
                    className="glass-pill grid size-9 place-items-center rounded-full text-cream/70 transition-all hover:border-gold-400/50 hover:text-gold-200 disabled:pointer-events-none disabled:opacity-30"
                    aria-label="Next Page"
                >
                    <IconChevronRight size={16} />
                </button>
            </div>
        </div>
    );
};

export default Pagination;
