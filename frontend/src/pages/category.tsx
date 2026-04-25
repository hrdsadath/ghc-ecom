import React from 'react';
import { useParams, Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { useCart } from '../contexts/CartContext';
import { products } from '../data/products';

const CategoryPage: React.FC = () => {
    const { categoryId } = useParams<{ categoryId: string }>();
    const cartContext = useCart();
    const cartCount = cartContext?.state.items.length || 0;

    // const categoryName = categoryId ? categoryId.charAt(0).toUpperCase() + categoryId.slice(1) : '';
    // const filteredProducts = products.filter(product => product.category.toLowerCase() === categoryId?.toLowerCase());

    return (
        <div>
            {/* Header */}
            <header className="header">
                <div className="header-content">
                    <div className="header-logo">Glockery Home Center</div>
                    <nav className="header-nav">
                        <Link to="/" className="nav-link">Home</Link>
                        <a href="#products" className="nav-link">Products</a>
                        <Link to="/cart" className="cart-link">
                            Cart {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
                        </Link>
                        <a href="#contact" className="nav-link">Contact</a>
                    </nav>
                </div>
            </header>

            {/* Category Products Section */}
            {/* <section className="products-section">
                <h2>{categoryName} Collection</h2>
                <div className="products-grid">
                    {filteredProducts.map(product => (
                        <ProductCard key={product.id} product={product} />
                    ))}
                </div>
                {filteredProducts.length === 0 && (
                    <p>No products found in this category.</p>
                )}
            </section> */}

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

export default CategoryPage;
