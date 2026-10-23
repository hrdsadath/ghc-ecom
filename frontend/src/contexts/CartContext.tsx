import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, ApiError, getCartIdentity, getSession, saveCartIdentity } from '../lib/api';
import { isStaffSession } from './AuthContext';
import { variantOptionLabel } from '../lib/product-options';
import { Cart, ProductVariant } from '../types';

interface CartContextValue {
    cart: Cart | null;
    itemCount: number;
    loading: boolean;
    error: string;
    isCartOpen: boolean;
    toastMessage: string | null;
    addVariant: (variant: ProductVariant, quantity?: number) => Promise<void>;
    updateQuantity: (variantId: string, quantity: number) => Promise<void>;
    removeItem: (variantId: string) => Promise<void>;
    refreshCart: () => Promise<Cart | null>;
    resetCart: () => void;
    openCart: () => void;
    closeCart: () => void;
    toggleCart: () => void;
    clearToast: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const withUpdatedItems = (cart: Cart, items: Cart['items']): Cart => ({
    ...cart,
    items,
    subtotalPaise: items.reduce((total, item) => total + item.lineTotalPaise, 0),
});

export const CartProvider = ({ children }: { children: ReactNode }) => {
    const [cart, setCart] = useState<Cart | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isCartOpen, setCartOpen] = useState(false);
    const [toastMessage, setToast] = useState<string | null>(null);
    const pendingCartRequest = useRef<Promise<Cart> | null>(null);
    const cartRevision = useRef(0);

    const ensureCart = useCallback(async () => {
        if (pendingCartRequest.current) return pendingCartRequest.current;
        const task = (async () => {
            const identity = getCartIdentity();
            if (identity) {
                try {
                    const current = await api.getCart(identity.cartId);
                    return current;
                } catch (caught) {
                    if (!(caught instanceof ApiError) || ![401, 404].includes(caught.status)) throw caught;
                    saveCartIdentity(null);
                }
            }
            const created = await api.createCart();
            saveCartIdentity({ cartId: created.cart.id, guestToken: created.guestToken });
            return created.cart;
        })();
        pendingCartRequest.current = task;
        void task.then(
            () => {
                if (pendingCartRequest.current === task) pendingCartRequest.current = null;
            },
            () => {
                if (pendingCartRequest.current === task) pendingCartRequest.current = null;
            },
        );
        return task;
    }, []);

    const refreshCart = useCallback(async () => {
        const revisionAtStart = cartRevision.current;
        setLoading(true);
        setError('');
        try {
            const current = await ensureCart();
            // A slow background read must never overwrite a cart that changed
            // while the request was in flight.
            if (cartRevision.current === revisionAtStart) setCart(current);
            return current;
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Unable to load your bag.');
            return null;
        } finally {
            setLoading(false);
        }
    }, [ensureCart]);

    useEffect(() => {
        if (getCartIdentity()) void refreshCart();
        else {
            setLoading(false);
            // Create an empty guest cart after the first paint so the first
            // Add to cart action does not need two sequential API requests.
            // Staff and the admin workspace never shop, so they get no cart.
            const timer = window.setTimeout(() => {
                const path = window.location.pathname;
                if (path === '/admin' || path.startsWith('/admin/') || isStaffSession(getSession())) return;
                void refreshCart();
            }, 500);
            return () => window.clearTimeout(timer);
        }
    }, [refreshCart]);
    useEffect(() => {
        const reset = () => {
            setCart(null);
            if (getCartIdentity()) void refreshCart();
            else setLoading(false);
        };
        window.addEventListener('ghc:cart-reset', reset);
        return () => window.removeEventListener('ghc:cart-reset', reset);
    }, [refreshCart]);

    const mutate = async (task: (active: Cart) => Promise<Cart>) => {
        setLoading(true);
        setError('');
        try {
            const active = cart || await ensureCart();
            const next = await task(active);
            cartRevision.current += 1;
            setCart(next);
            return next;
        } catch (caught) {
            const message = caught instanceof Error ? caught.message : 'Unable to update your bag.';
            setError(message);
            setToast(message);
            throw caught;
        } finally {
            setLoading(false);
        }
    };

    const addVariant = async (variant: ProductVariant, quantity = 1) => {
        if (variant.availableStock <= 0) {
            const message = 'This product is currently out of stock.';
            setError(message);
            setToast(message);
            throw new Error(message);
        }
        const current = cart?.items.find((item) => item.variantId === variant.id)?.quantity || 0;
        setCartOpen(true);
        await mutate((active) => api.setCartItem(active.id, variant.id, Math.min(99, current + quantity)));
        setToast(`${variantOptionLabel(variant)} added to your cart`);
    };

    const updateQuantity = async (variantId: string, quantity: number) => {
        if (quantity <= 0) return removeItem(variantId);
        const previous = cart;
        if (previous) {
            cartRevision.current += 1;
            setCart(
                withUpdatedItems(
                    previous,
                    previous.items.map((item) =>
                        item.variantId === variantId
                            ? { ...item, quantity, lineTotalPaise: item.unitPricePaise * quantity }
                            : item,
                    ),
                ),
            );
        }
        try {
            await mutate((active) => api.setCartItem(active.id, variantId, quantity));
        } catch (caught) {
            if (previous) {
                cartRevision.current += 1;
                setCart(previous);
            }
            throw caught;
        }
    };

    const removeItem = async (variantId: string) => {
        const previous = cart;
        if (previous) {
            cartRevision.current += 1;
            setCart(withUpdatedItems(previous, previous.items.filter((item) => item.variantId !== variantId)));
        }
        try {
            await mutate((active) => api.removeCartItem(active.id, variantId));
        } catch (caught) {
            if (previous) {
                cartRevision.current += 1;
                setCart(previous);
            }
            throw caught;
        }
    };

    const resetCart = () => {
        saveCartIdentity(null);
        cartRevision.current += 1;
        setCart(null);
        setLoading(false);
    };

    return (
        <CartContext.Provider value={{
            cart,
            itemCount: cart?.items.reduce((sum, item) => sum + item.quantity, 0) || 0,
            loading,
            error,
            isCartOpen,
            toastMessage,
            addVariant,
            updateQuantity,
            removeItem,
            refreshCart,
            resetCart,
            openCart: () => setCartOpen(true),
            closeCart: () => setCartOpen(false),
            toggleCart: () => setCartOpen((value) => !value),
            clearToast: () => setToast(null),
        }}>
            {children}
        </CartContext.Provider>
    );
};

export const useCart = () => {
    const value = useContext(CartContext);
    if (!value) throw new Error('useCart must be used inside CartProvider');
    return value;
};
