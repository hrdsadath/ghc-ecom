import React from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { useCart } from '../contexts/CartContext';

const publicImage = (fileName: string) => `${process.env.PUBLIC_URL}/img/${fileName}`;

const canisterImg = publicImage('canister.jpeg');
const kettleImg = publicImage('borddil kettle.jpeg');
const cutleryImg = publicImage('cuttlery set gold.jpeg');
const nutsImg = publicImage('nuts try.jpeg');
const jugImg = publicImage('primium jug set.jpeg');
const cupImg = publicImage('wooden cup and sucer.jpeg');

const categories = [
    { id: 'cat1', name: 'Ceramics', imageUrl: nutsImg },
    { id: 'cat2', name: 'Dinnerware', imageUrl: canisterImg },
    { id: 'cat3', name: 'Cups', imageUrl: cupImg },
    { id: 'cat4', name: 'Serving', imageUrl: cutleryImg },
    { id: 'cat5', name: 'Trays', imageUrl: kettleImg },
    { id: 'cat6', name: 'Jugs', imageUrl: jugImg },
    { id: 'cat7', name: 'Plates', imageUrl: nutsImg },
    { id: 'cat8', name: 'Bowls', imageUrl: canisterImg },
    { id: 'cat9', name: 'Mugs', imageUrl: cupImg },
    { id: 'cat10', name: 'Sets', imageUrl: cutleryImg },
    { id: 'cat11', name: 'Storage', imageUrl: kettleImg },
    { id: 'cat12', name: 'Gifts', imageUrl: jugImg },
    { id: 'cat13', name: 'Decor', imageUrl: nutsImg },
    { id: 'cat14', name: 'Kitchen', imageUrl: canisterImg },
    { id: 'cat15', name: 'Accessories', imageUrl: cupImg },
    { id: 'cat16', name: 'Essentials', imageUrl: cutleryImg }
];

const HomePage: React.FC = () => {
    const cartContext = useCart();
    const cartCount = cartContext?.state.items.length || 0;

    // Sample products data
    const products = [
        {
            id: '1',
            name: 'Ceramic Bowl',
            description: 'Beautiful handcrafted ceramic bowl perfect for serving',
            mrp: 30.05,
            price: 24.99,
            imageUrl: nutsImg
        },
        {
            id: '2',
            name: 'Dinner Plate Set',
            description: 'Set of 4 elegant dinner plates',
            mrp: 59.99,
            price: 49.99,
            imageUrl: canisterImg
        },
        {
            id: '3',
            name: 'Tea Cup',
            description: 'Delicate porcelain tea cup with handle',
            mrp: 17.99,
            price: 12.99,
            imageUrl: cupImg
        },
        {
            id: '4',
            name: 'Serving Platter',
            description: 'Large serving platter for special occasions',
            mrp: 69.99,
            price: 59.99,
            imageUrl: cutleryImg
        },
        {
            id: '5',
            name: 'Soup Bowl',
            description: 'Deep soup bowl with beautiful glaze',
            mrp: 19.99,
            price: 15.99,
            imageUrl: kettleImg
        },
        {
            id: '6',
            name: 'Coffee Mug Set',
            description: 'Set of 2 cozy coffee mugs',
            mrp: 29.99,
            price: 22.99,
            imageUrl: jugImg
        }
    ];

    const filteredProducts = products;

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

            {/* Hero Section */}
            <section className="hero-section">
                <div className="hero-content">
                    <img src={canisterImg} alt="Glockery Home Center" className="hero-logo" />
                    <Link to="#products" className="hero-cta">Buy Now →</Link>
                </div>
                <div className="hero-image">
                    <img src={kettleImg} alt="Kitchen Canister Set" />
                </div>
            </section>

            <section className="category-section">
                <h2>Shop by Category</h2>
                <div className="category-grid">
                    {categories.map(category => (
                        <div key={category.id} className="category-card">
                            <img src={category.imageUrl} alt={category.name} />
                            <div className="category-label">{category.name}</div>
                        </div>
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
                        <div className="logo-placeholder">🏠</div>
                        <div className="logo-placeholder">👨‍👩‍👧‍👦</div>
                        <div className="logo-placeholder">🏡</div>
                        <div className="logo-placeholder">🍽️</div>
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
