import React from 'react';
import { Link } from '../lib/router';

const StoreFooter = () => (
    <footer className="border-t border-line bg-carbon text-cream">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-10 px-6 py-12 sm:px-8 lg:flex-row lg:items-start lg:justify-between lg:px-12">
            <div className="max-w-sm">
                <Link to="/" className="text-base font-bold tracking-[0.18em]">GLOCKERY HOME CENTRE</Link>
                <p className="mt-4 text-sm leading-6 text-cream/65">Premium crockery and kitchenware from Vengara, Malappuram.</p>
                <address className="mt-4 not-italic text-sm leading-6 text-cream/65">
                    Home Centre, near ICICI Bank<br />
                    Vengara, Malappuram, Kerala 676304
                </address>
                <div className="mt-4 flex flex-col gap-1 text-sm">
                    <a className="text-gold-300 hover:text-gold-100" href="tel:+918138003232">📞: 8138 003 232</a>
                    <a className="text-gold-300 hover:text-gold-100" href="https://wa.me/916282000289" target="_blank" rel="noreferrer">💬:6282 000 289</a>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-x-12 gap-y-8 text-sm sm:grid-cols-3">
                <nav aria-label="Shop links">
                    <p className="mb-3 font-semibold text-cream">Shop</p>
                    <ul className="space-y-2 text-cream/65">
                        <li><Link className="hover:text-cream" to="/search">All products</Link></li>
                        <li><Link className="hover:text-cream" to="/wishlist">Wishlist</Link></li>
                        <li><Link className="hover:text-cream" to="/account">Account</Link></li>
                    </ul>
                </nav>
                <nav aria-label="Help links">
                    <p className="mb-3 font-semibold text-cream">Help</p>
                    <ul className="space-y-2 text-cream/65">
                        <li><Link className="hover:text-cream" to="/order-lookup">Find an order</Link></li>
                        <li><Link className="hover:text-cream" to="/shipping-returns">Shipping policy</Link></li>
                        <li><Link className="hover:text-cream" to="/contact">Contact</Link></li>
                        <li><a className="hover:text-cream" href="https://www.instagram.com/glockery_home_centre/" target="_blank" rel="noreferrer">Instagram</a></li>
                    </ul>
                </nav>
                <nav aria-label="Company links">
                    <p className="mb-3 font-semibold text-cream">Company</p>
                    <ul className="space-y-2 text-cream/65">
                        <li><Link className="hover:text-cream" to="/about">About</Link></li>
                        <li><Link className="hover:text-cream" to="/privacy">Privacy</Link></li>
                        <li><Link className="hover:text-cream" to="/terms">Terms</Link></li>
                    </ul>
                </nav>
            </div>
        </div>
        <div className="flex flex-col items-center gap-2 border-t border-line px-6 py-5 text-center text-xs text-cream/60 sm:flex-row sm:justify-center sm:gap-3">
            <span>© {new Date().getFullYear()} Glockery Home Centre</span>
            <span aria-hidden="true" className="hidden text-cream/30 sm:inline">•</span>
            <a href="https://faheemcp.tech" target="_blank" rel="noreferrer" className="text-gold-300 hover:text-gold-100">
                Developed by faheemcp.tech
            </a>
        </div>
    </footer>
);

export default StoreFooter;
