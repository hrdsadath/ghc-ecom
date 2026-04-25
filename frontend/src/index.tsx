import React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import './styles/globals.css';
import HomePage from './pages';
import CartPage from './pages/cart';
import CategoryPage from './pages/category';
import ProductDetailPage from './pages/product';
import { CartProvider } from './contexts/CartContext';

ReactDOM.render(
  <React.StrictMode>
    <CartProvider>
      <Router>
        <Switch>
          <Route exact path="/" component={HomePage} />
          <Route path="/cart" component={CartPage} />
          <Route path="/category/:categoryId" component={CategoryPage} />
          <Route path="/product/:productId" component={ProductDetailPage} />
        </Switch>
      </Router>
    </CartProvider>
  </React.StrictMode>,
  document.getElementById('root')
);
