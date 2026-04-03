import React from 'react';
import { useCart } from '../contexts/CartContext';

const fallbackProductImage = `${process.env.PUBLIC_URL}/img/canister.jpeg`;

interface ProductCardProps {
    product: {
        id: string;
        name: string;
        description: string;
        price: number;
        imageUrl: string;
    };
}

const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
    const cartContext = useCart();

    if (!cartContext) {
        throw new Error('ProductCard must be used within CartProvider');
    }

    const { addItem } = cartContext;

    const handleBuy = () => {
        try {
            // WhatsApp contact number (with country code, no + sign)
            const phoneNumber = '919207232303';
            
            // Create message with product details
            const message = `Hello, I am interested in purchasing:\n\nProduct: ${product.name}\nDescription: ${product.description}\nPrice: $${product.price.toFixed(2)}\n\nPlease provide more details and let me know how to proceed.`;
            
            // Encode the message for URL
            const encodedMessage = encodeURIComponent(message);
            
            // Create WhatsApp link - using the correct format
            const whatsappLink = `https://wa.me/${phoneNumber}/?text=${encodedMessage}`;
            
            // Open in new window
            window.open(whatsappLink, '_blank', 'noopener,noreferrer');
        } catch (error) {
            console.error('Error opening WhatsApp:', error);
            alert('Unable to open WhatsApp. Please try again.');
        }
    };

    const handleAddToCart = () => {
        addItem(product);
        alert(`✅ ${product.name} added to cart!`);
    };

    return (
        <div className="product-card">
            <div className="product-id">Product ID: {product.id}</div>
            <img
                src={product.imageUrl}
                alt={product.name}
                onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = fallbackProductImage;
                }}
            />
            <h3>{product.name}</h3>
            <p>{product.description}</p>
            <div className="product-price">${product.price.toFixed(2)}</div>
            <div className="product-actions">
                <button className="btn-buy" onClick={handleBuy}>Buy Now</button>
                <button className="btn-cart" onClick={handleAddToCart}>Add to Cart</button>
            </div>
        </div>
    );
};

export default ProductCard;
