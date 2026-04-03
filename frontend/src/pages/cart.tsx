import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';

const fallbackProductImage = `${process.env.PUBLIC_URL}/img/canister.jpeg`;

const CartPage: React.FC = () => {
    const cartContext = useCart();
    
    if (!cartContext) {
        throw new Error('CartPage must be used within CartProvider');
    }

    const { state, removeItem, clearCart } = cartContext;
    const [removingId, setRemovingId] = useState<string | null>(null);

    const totalPrice = state.items.reduce((total, item) => total + item.price, 0);
    const taxAmount = totalPrice * 0.1;
    const shippingCost = totalPrice > 50 ? 0 : 5;
    const finalTotal = totalPrice + taxAmount + shippingCost;

    const handleRemove = (id: string) => {
        setRemovingId(id);
        setTimeout(() => {
            removeItem(id);
            setRemovingId(null);
        }, 300);
    };

    if (state.items.length === 0) {
        return (
            <div>
                <header className="header">
                    <div className="header-content">
                        <div className="header-logo">🍽️ CrockeryShop</div>
                    </div>
                </header>
                <div className="cart-container">
                    <h1>Shopping Cart</h1>
                    <div className="empty-cart">
                        <div className="empty-icon">🛒</div>
                        <p>Your cart is empty</p>
                        <small>Add some delicious crockery to get started!</small>
                        <Link to="/" className="btn-continue-shopping">Continue Shopping</Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div>
            <header className="header">
                <div className="header-content">
                    <div className="header-logo">🍽️ CrockeryShop</div>
                    <Link to="/" className="back-to-home">← Back to Home</Link>
                </div>
            </header>

            <div className="cart-container">
                <h1>Shopping Cart 🛒</h1>
                <p className="cart-subtitle">{state.items.length} item{state.items.length !== 1 ? 's' : ''} in your cart</p>

                <div className="cart-content">
                    <div className="cart-items-section">
                        <div className="cart-items">
                            {state.items.map((item, index) => (
                                <div 
                                    key={item.id} 
                                    className={`cart-item ${removingId === item.id ? 'removing' : ''}`}
                                    style={{ animationDelay: `${index * 50}ms` }}
                                >
                                    <div className="item-image-wrapper">
                                        <img
                                            src={item.imageUrl}
                                            alt={item.name}
                                            onError={(event) => {
                                                event.currentTarget.onerror = null;
                                                event.currentTarget.src = fallbackProductImage;
                                            }}
                                        />
                                    </div>
                                    <div className="item-details">
                                        <h3>{item.name}</h3>
                                        <p className="item-desc">{item.description}</p>
                                        <div className="item-meta">
                                            <span className="item-price">${item.price.toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <button 
                                        className="btn-remove-item" 
                                        onClick={() => handleRemove(item.id)}
                                        title="Remove from cart"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="cart-sidebar">
                        <div className="order-summary">
                            <h2>Order Summary</h2>
                            
                            <div className="summary-row">
                                <span className="label">Subtotal</span>
                                <span className="value">${totalPrice.toFixed(2)}</span>
                            </div>

                            <div className="summary-row">
                                <span className="label">
                                    Shipping
                                    <small>{shippingCost === 0 ? '(Free!)' : ''}</small>
                                </span>
                                <span className="value">${shippingCost.toFixed(2)}</span>
                            </div>

                            <div className="summary-row">
                                <span className="label">Tax (10%)</span>
                                <span className="value">${taxAmount.toFixed(2)}</span>
                            </div>

                            <div className="summary-divider"></div>

                            <div className="summary-total">
                                <span>Total Amount</span>
                                <span className="total-price">${finalTotal.toFixed(2)}</span>
                            </div>

                            <button className="btn-checkout-primary">
                                Proceed to Checkout
                            </button>

                            <Link to="/" className="btn-continue-shopping-link">
                                Continue Shopping
                            </Link>

                            <button 
                                className="btn-clear-cart-link" 
                                onClick={() => {
                                    if (window.confirm('Are you sure you want to clear your cart?')) {
                                        clearCart();
                                    }
                                }}
                            >
                                Clear Cart
                            </button>
                        </div>

                        <div className="promo-card">
                            <h3>Got a promo code?</h3>
                            <div className="promo-input-group">
                                <input type="text" placeholder="Enter code" className="promo-input" />
                                <button className="btn-apply">Apply</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CartPage;
