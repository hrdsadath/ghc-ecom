import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';

interface CartItem {
    id: string;
    name: string;
    description: string;
    price: number;
    imageUrl: string;
    quantity?: number;
}

interface CartState {
    items: CartItem[];
    totalAmount: number;
}

interface CartContextType {
    state: CartState;
    addItem: (item: CartItem) => void;
    removeItem: (id: string) => void;
    clearCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export { CartContext };

const initialState: CartState = {
    items: [],
    totalAmount: 0,
};

interface CartAction {
    type: 'ADD_ITEM' | 'REMOVE_ITEM' | 'CLEAR_CART';
    payload?: CartItem | { id: string };
}

const cartReducer = (state: CartState, action: CartAction): CartState => {
    switch (action.type) {
        case 'ADD_ITEM':
            const updatedItems = [...state.items, action.payload as CartItem];
            const updatedTotalAmount = updatedItems.reduce((total: number, item: CartItem) => total + item.price, 0);
            return {
                ...state,
                items: updatedItems,
                totalAmount: updatedTotalAmount,
            };
        case 'REMOVE_ITEM':
            const filteredItems = state.items.filter((item: CartItem) => item.id !== (action.payload as { id: string }).id);
            const newTotalAmount = filteredItems.reduce((total: number, item: CartItem) => total + item.price, 0);
            return {
                ...state,
                items: filteredItems,
                totalAmount: newTotalAmount,
            };
        case 'CLEAR_CART':
            return initialState;
        default:
            return state;
    }
};

export const CartProvider = ({ children }: { children: ReactNode }) => {
    const [state, dispatch] = useReducer(cartReducer, initialState, (initial) => {
        // Initialize from localStorage
        try {
            const savedCart = localStorage.getItem('cart');
            if (savedCart) {
                const parsedCart = JSON.parse(savedCart);
                return {
                    items: parsedCart,
                    totalAmount: parsedCart.reduce((total: number, item: CartItem) => total + item.price, 0),
                };
            }
        } catch (error) {
            console.error('Error loading cart from localStorage:', error);
        }
        return initial;
    });

    // Save to localStorage whenever state changes
    useEffect(() => {
        localStorage.setItem('cart', JSON.stringify(state.items));
    }, [state.items]);

    const addItem = (item: CartItem) => {
        dispatch({ type: 'ADD_ITEM', payload: item });
    };

    const removeItem = (id: string) => {
        dispatch({ type: 'REMOVE_ITEM', payload: { id } });
    };

    const clearCart = () => {
        dispatch({ type: 'CLEAR_CART' });
    };

    return (
        <CartContext.Provider value={{ state, addItem, removeItem, clearCart }}>
            {children}
        </CartContext.Provider>
    );
};

export const useCart = () => {
    return useContext(CartContext);
};