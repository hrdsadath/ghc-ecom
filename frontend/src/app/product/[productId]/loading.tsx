'use client';

import React from 'react';
import Header from '../../../components/Header';
import { ProductDetailSkeleton } from '../../../components/Skeleton';
import StoreFooter from '../../../components/StoreFooter';

export default function ProductLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-obsidian font-body text-cream">
      <Header />
      <main className="flex-1" role="status" aria-label="Loading product details">
        <ProductDetailSkeleton />
      </main>
      <StoreFooter />
    </div>
  );
}
