import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { products } from '../data/products';

const ProductDetailPage: React.FC = () => {
    const { productId } = useParams<{ productId: string }>();
    const cartContext = useCart();
    const cartCount = cartContext?.state.items.length || 0;

    const product = products.find(p => p.id === productId);

    if (!product) {
        return (
            <div>
                <header className="header">
                    <div className="header-content">
                        <div className="header-logo">🍽️ Glockery Home Center</div>
                        <nav className="header-nav">
                            <Link to="/" className="nav-link">Home</Link>
                            <Link to="/cart" className="cart-link">
                                🛒 Cart {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
                            </Link>
                        </nav>
                    </div>
                </header>
                <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                    <h2>Product not found</h2>
                    <Link to="/" className="btn-continue-shopping">Back to Home</Link>
                </div>
            </div>
        );
    }

    const { addItem } = cartContext!;

    const handleBuy = () => {
        const phoneNumber = '919207232303';
        const message = `Hello, I am interested in purchasing:\n\nProduct: ${product.name}\nDescription: ${product.description}\n${typeof product.mrp === 'number' ? `MRP: $${product.mrp.toFixed(2)}\n` : ''}GHP: $${product.price.toFixed(2)}\n\nPlease provide more details and let me know how to proceed.`;
        const encodedMessage = encodeURIComponent(message);
        const whatsappLink = `https://wa.me/${phoneNumber}/?text=${encodedMessage}`;
        window.open(whatsappLink, '_blank', 'noopener,noreferrer');
    };

    const handleAddToCart = () => {
        addItem(product);
        alert(`✅ ${product.name} added to cart!`);
    };

    return (
        <div>
            {/* Header */}
            <header className="header">
                <div className="header-content">
                    <div className="header-logo">🍽️ Glockery Home Center</div>
                    <nav className="header-nav">
                        <Link to="/" className="nav-link">Home</Link>
                        <a href="#products" className="nav-link">Products</a>
                        <Link to="/cart" className="cart-link">
                            🛒 Cart {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
                        </Link>
                        <a href="#contact" className="nav-link">Contact</a>
                    </nav>
                </div>
            </header>

            {/* Product Detail Section */}
            <section className="product-detail-section">
                <div className="product-detail-container">
                    <div className="product-detail-image">
                        <img src={product.imageUrl} alt={product.name} />
                    </div>
                    <div className="product-detail-info">
                        <h1>{product.name}</h1>
                        <p className="product-category">Category: {product.category}</p>
                        <p className="product-description">{product.description}</p>
                        
                        {/* Product Details */}
                        {product.details && (
                            <div className="product-specifications">
                                <h3>Product Specifications</h3>
                                <div className="specs-grid">
                                    <div className="spec-item">
                                        <span className="spec-label">Material:</span>
                                        <span className="spec-value">{product.details.material}</span>
                                    </div>
                                    
                                    <div className="spec-item">
                                        <span className="spec-label">Dimensions:</span>
                                        <span className="spec-value">
                                            {typeof product.details.dimensions === 'object' 
                                                ? Object.entries(product.details.dimensions).map(([key, value]) => `${key}: ${value}`).join(', ')
                                                : product.details.dimensions
                                            }
                                        </span>
                                    </div>
                                    
                                    <div className="spec-item">
                                        <span className="spec-label">Volume:</span>
                                        <span className="spec-value">{product.details.volume}</span>
                                    </div>
                                    
                                    <div className="spec-item">
                                        <span className="spec-label">Available Colors:</span>
                                        <span className="spec-value">{product.details.colors.join(', ')}</span>
                                    </div>
                                    
                                    <div className="spec-item">
                                        <span className="spec-label">Stock Quantity:</span>
                                        <span className="spec-value">{product.details.stock} units</span>
                                    </div>
                                    
                                    <div className="spec-item">
                                        <span className="spec-label">Weight:</span>
                                        <span className="spec-value">{product.details.weight}</span>
                                    </div>
                                    
                                    <div className="spec-item care-instructions">
                                        <span className="spec-label">Care Instructions:</span>
                                        <span className="spec-value">{product.details.care}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        <div className="product-price-detail">
                            {typeof product.mrp === 'number' && (
                                <span className="product-price-mrp">MRP: ${product.mrp.toFixed(2)}</span>
                            )}
                            <span className="product-price-ghp">GHP: ${product.price.toFixed(2)}</span>
                        </div>
                        <div className="product-actions-detail">
                            <button className="btn-buy" onClick={handleBuy}>Buy Now</button>
                            <button className="btn-cart" onClick={handleAddToCart}>Add to Cart</button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="footer">
                <div className="footer-content">
                    <div className="email-signup">
                        <h2>Join our email list</h2>
                        <p>Get exclusive deals and early access to new products.</p>
                        <form className="signup-form">
                            <input type="email" placeholder="Email address" />
                            <button type="submit">Sign up</button>
                        </form>
                    </div>
                    <a href="https://wa.me/919207232303" className="whatsapp-link" target="_blank" rel="noopener noreferrer">
                        <img src="https://img.icons8.com/color/48/000000/whatsapp.png" alt="Chat on WhatsApp" />
                        Chat on WhatsApp
                    </a>
                </div>
            </footer>
        </div>
    );
};

export default ProductDetailPage;