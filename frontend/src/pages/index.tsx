import React from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { useCart } from '../contexts/CartContext';
import { categories, products, canisterImg, kettleImg, cutleryImg, nutsImg, jugImg, cupImg, denner123, logo } from '../data/products';

const HomePage: React.FC = () => {
    const cartContext = useCart();
    const cartCount = cartContext?.state.items.length || 0;

    const filteredProducts = products;

    return (
        <div>
            {/* Header */}
            <header className="header">
                <div className="header-content">
                    {/* <div className="header-logo">Glockry Home Center</div> */}
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

            {/* Hero Section */}
            <section className="hero-section">
                <div className="hero-content">
                    <span className="hero-eyebrow">Premium Crockery Destination</span>
                    <h1 className="hero-title">Glockry Home Center</h1>
                    <p className="hero-subtitle">
                        Luxury crockery curated for homes that value elegance. Discover timeless dining pieces,
                        fine textures, and premium designs crafted to elevate every table.
                    </p>
                    <div className="hero-actions">
                        <a href="#products" className="hero-cta">Explore Collection</a>
                        <Link to="/category/sets" className="hero-cta-secondary">View Signature Sets</Link>
                    </div>
                    <div className="hero-points">
                        <div className="hero-point">Premium finish crockery</div>
                        <div className="hero-point">Elegant handcrafted feel</div>
                        <div className="hero-point">Trusted by 10k+ families</div>
                    </div>
                </div>

                <div className="hero-visual">
                    <div className="hero-glow" aria-hidden="true"></div>
                    <div className="hero-frame">
                        <img src={logo} alt="Glockry Home Center logo" className="hero-logo" />
                        <img src={kettleImg} alt="Premium kettle collection" className="hero-main-image" />
                    </div>
                    <div className="hero-highlight-card">
                        <span className="hero-highlight-badge">Luxury Pick</span>
                        <img src={denner123} alt="Signature dinner collection" />
                        <p>Signature Dinner Collection</p>
                    </div>
                    <div className="hero-floating-thumb">
                        <img src={cutleryImg} alt="Gold cutlery set" />
                    </div>
                </div>
            </section>

            <section className="category-section">
                <h2>Shop by Category</h2>
                <div className="category-grid">
                    {categories.map(category => (
                        <Link key={category.id} to={`/category/${category.id}`} className="category-card-link">
                            <div className="category-card">
                                <img src={category.imageUrl} alt={category.name} />
                                <div className="category-label">{category.name}</div>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>

            {/* Features Section */}
            <section className="features-section">
                <div className="feature-item">
                    <span>HIGH QUALITY</span>
                </div>
                <div className="feature-item">
                    <span>FREE SHIPPING</span>
                </div>
                <div className="feature-item">
                    <span>EASY RETURNS</span>
                </div>
            </section>

            {/* Featured Products */}
            <section className="featured-products">
                <div className="product-card-large">
                    <Link to="#products">
                        <img src={canisterImg} alt="Round Canister Set" />
                        <h3>Round Canister Set</h3>
                    </Link>
                </div>
                <div className="product-card-large top-selling">
                    <div className="badge">TOP SELLING</div>
                    <Link to="#products">
                        <img src={kettleImg} alt="Square Canister Set" />
                        <h3>Square Canister Set</h3>
                    </Link>
                </div>
            </section>

            {/* About Section */}
            <section className="about-section">
                <div className="about-item">
                    <img src={nutsImg} alt="Modern design" />
                    <div className="about-content">
                        <h2>Modern design</h2>
                        <p><strong>Designed with purpose, crafted for modern living</strong></p>
                    </div>
                </div>
                <div className="about-item">
                    <img src={cutleryImg} alt="Quality Materials" />
                    <div className="about-content">
                        <h2>Quality Materials</h2>
                        <p>Made with strong ceramic and natural bamboo for long-lasting use.</p>
                    </div>
                </div>
                <div className="about-item">
                    <img src={jugImg} alt="Made for Your Home" />
                    <div className="about-content">
                        <h2>Made for Your Home</h2>
                        <p>Beautiful and practical essentials for everyday living.</p>
                    </div>
                </div>
            </section>

            {/* Banner Section */}
            <section className="banner-section">
                <h2>Pure. Simple. Premium.</h2>
                <div className="banner-images">
                    <img src={canisterImg} alt="Why Glockery" />
                    <img src={kettleImg} alt="Why Glockery" />
                    <img src={cupImg} alt="Why Glockery" />
                </div>
            </section>

            {/* Testimonials Section */}
            <section className="testimonials-section">
                <h2>Trusted By 10k+ Family</h2>
                <div className="testimonials-content">
                    <div className="testimonial-logos">
                        <div className="logo-placeholder">Home</div>
                        <div className="logo-placeholder">Family</div>
                        <div className="logo-placeholder">Style</div>
                        <div className="logo-placeholder">Kitchen</div>
                    </div>
                    <div className="testimonial-text">
                        <img src={nutsImg} alt="Trusted by customers" />
                        <h2>Trusted By 10k+ Family</h2>
                        <p>Quality products loved by households</p>
                    </div>
                </div>
            </section>

            {/* All Products Section */}
            <section id="products" className="products-section">
                <h2>Our Premium Crockery Collection</h2>
                <div className="products-grid">
                    {filteredProducts.map(product => (
                        <ProductCard key={product.id} product={product} />
                    ))}
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

export default HomePage;
