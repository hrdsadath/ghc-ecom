'use client';

import React from 'react';
import Header from '../../components/Header';
import { AccountPageSkeleton } from '../../components/Skeleton';
import StoreFooter from '../../components/StoreFooter';

export default function AccountLoading() {
  return (
    <div className="flex min-h-screen flex-col justify-between bg-obsidian font-body text-cream">
      <Header />
      <main className="flex-1" role="status" aria-label="Loading account">
        <AccountPageSkeleton />
      </main>
      <StoreFooter />
    </div>
  );
}
