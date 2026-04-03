import React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import './styles/globals.css';
import HomePage from './pages';
import CartPage from './pages/cart';
import { CartProvider } from './contexts/CartContext';

ReactDOM.render(
  <React.StrictMode>
    <CartProvider>
      <Router>
        <Switch>
          <Route exact path="/" component={HomePage} />
          <Route path="/cart" component={CartPage} />
        </Switch>
      </Router>
    </CartProvider>
  </React.StrictMode>,
  document.getElementById('root')
);
