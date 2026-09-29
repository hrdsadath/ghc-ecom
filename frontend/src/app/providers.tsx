'use client';

import { Suspense } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import CartDrawer from '../components/CartDrawer';
import FloatingContactButtons from '../components/FloatingContactButtons';
import OfflineBanner from '../components/OfflineBanner';
import ScrollToTop from '../components/ScrollToTop';
import Toast from '../components/Toast';
import AuthFragmentCleaner from '../components/AuthFragmentCleaner';
import { AuthProvider } from '../contexts/AuthContext';
import { CartProvider } from '../contexts/CartContext';
import { ToastProvider } from '../contexts/ToastContext';
import { WishlistProvider } from '../contexts/WishlistContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <AuthFragmentCleaner />
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
            <ToastProvider>
              <OfflineBanner />
              {/* Reads search params; its own boundary keeps static pages server-rendered. */}
              <Suspense fallback={null}>
                <ScrollToTop />
              </Suspense>
              <FloatingContactButtons />
              {children}
              <CartDrawer />
              <Toast />
            </ToastProvider>
          </WishlistProvider>
        </CartProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
