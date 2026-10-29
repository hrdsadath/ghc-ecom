'use client';

import React from 'react';
import Header from '../../../components/Header';
import { CategoryPageSkeleton } from '../../../components/Skeleton';
import StoreFooter from '../../../components/StoreFooter';
import TrustBadges from '../../../components/TrustBadges';

export default function CategoryLoading() {
  return (
    <div className="flex min-h-screen flex-col justify-between bg-obsidian font-body text-cream">
      <Header />
      <main className="flex-1" role="status" aria-label="Loading category">
        <CategoryPageSkeleton />
      </main>
      <TrustBadges />
      <StoreFooter />
    </div>
  );
}
