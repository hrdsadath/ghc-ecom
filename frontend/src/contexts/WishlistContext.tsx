import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';

const WISHLIST_KEY = 'ghc_wishlist';

interface WishlistContextValue {
    wishlistIds: string[];
    toggleWishlist: (productId: string) => void;
    isInWishlist: (productId: string) => boolean;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

export const WishlistProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Start empty like the server render and read storage after hydration; reading it during
    // the first render made the header badge differ from the HTML (React error #418).
    const [wishlistIds, setWishlistIds] = useState<string[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(WISHLIST_KEY);
            if (raw) setWishlistIds(JSON.parse(raw) as string[]);
        } catch {
            // Ignore storage errors
        }
        setLoaded(true);
    }, []);

    useEffect(() => {
        if (!loaded) return; // Do not overwrite the stored list with the initial empty state.
        try {
            localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlistIds));
        } catch {
            // Ignore storage errors
        }
    }, [wishlistIds, loaded]);

    const toggleWishlist = (productId: string) => {
        setWishlistIds((prev) =>
            prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
        );
    };

    const isInWishlist = (productId: string) => wishlistIds.includes(productId);

    return (
        <WishlistContext.Provider value={{ wishlistIds, toggleWishlist, isInWishlist }}>
            {children}
        </WishlistContext.Provider>
    );
};

export const useWishlist = () => {
    const context = useContext(WishlistContext);
    if (!context) {
        return { wishlistIds: [], toggleWishlist: () => {}, isInWishlist: () => false };
    }
    return context;
};
