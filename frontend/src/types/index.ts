export interface Product {
    id: string;
    name: string;
    description: string;
    price: number;
    imageUrl: string;
    category: string;
}

export interface CartItem {
    productId: string;
    quantity: number;
}

export interface Cart {
    items: CartItem[];
    totalAmount: number;
}

export interface User {
    id: string;
    name: string;
    email: string;
    password: string;
}

export interface Order {
    id: string;
    userId: string;
    items: CartItem[];
    totalAmount: number;
    orderDate: Date;
    status: string;
}