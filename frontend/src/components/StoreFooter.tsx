import React from 'react';
import { Link } from '../lib/router';

const StoreFooter = () => (
    <footer className="relative border-t border-gold-500/20 bg-[#f7f5ee]/95 backdrop-blur-2xl text-cream overflow-hidden">
        {/* Subtle Ambient Gold Glow */}
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 size-[600px] rounded-full bg-gold-400/10 blur-[120px]" />

        <div className="relative mx-auto flex max-w-[1440px] flex-col gap-12 px-6 py-14 sm:px-8 lg:flex-row lg:items-start lg:justify-between lg:px-12">
            <div className="max-w-sm">
                <Link to="/" className="inline-block">
                    <span className="font-display text-xl font-bold tracking-[0.2em] text-cream">
                        GLOCKERY
                    </span>
                    <span className="block text-[10px] font-semibold tracking-[0.3em] uppercase text-gold-600">
                        Home Centre • Vengara
                    </span>
                </Link>

                <p className="mt-4 text-sm leading-relaxed text-cream/75">
                    Curators of luxury bone china dinner sets, artisanal tea ware, and exquisite kitchen accents designed to elevate modern living.
                </p>

                <address className="mt-4 not-italic text-xs leading-relaxed text-cream/65">
                    Home Centre, near ICICI Bank<br />
                    Vengara, Malappuram, Kerala 676304
                </address>

                <div className="mt-5 flex flex-wrap gap-2 text-xs">
                    <a
                        className="glass-pill rounded-full px-3.5 py-1.5 text-cream/90 hover:text-gold-600 hover:border-gold-500/40 transition-colors shadow-sm"
                        href="tel:+918138003232"
                    >
                        📞 8138 003 232
                    </a>
                    <a
                        className="glass-pill rounded-full px-3.5 py-1.5 text-cream/90 hover:text-emerald-700 hover:border-emerald-500/40 transition-colors shadow-sm"
                        href="https://wa.me/916282000289"
                        target="_blank"
                        rel="noreferrer"
                    >
                        💬 6282 000 289
                    </a>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-x-12 gap-y-8 text-sm sm:grid-cols-3">
                <nav aria-label="Shop links">
                    <p className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
                        Collections
                    </p>
                    <ul className="space-y-2.5 text-xs sm:text-sm text-cream/75">
                        <li><Link className="transition hover:text-gold-600" to="/search">All Products</Link></li>
                        <li><Link className="transition hover:text-gold-600" to="/wishlist">Wishlist</Link></li>
                        <li><Link className="transition hover:text-gold-600" to="/account">My Account</Link></li>
                    </ul>
                </nav>
                <nav aria-label="Help links">
                    <p className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
                        Customer Care
                    </p>
                    <ul className="space-y-2.5 text-xs sm:text-sm text-cream/75">
                        <li><Link className="transition hover:text-gold-600" to="/order-lookup">Track Order</Link></li>
                        <li><Link className="transition hover:text-gold-600" to="/shipping-returns">Shipping & Returns</Link></li>
                        <li><Link className="transition hover:text-gold-600" to="/contact">Contact Us</Link></li>
                        <li><a className="transition hover:text-gold-600" href="https://www.instagram.com/glockery_home_centre/" target="_blank" rel="noreferrer">Instagram</a></li>
                    </ul>
                </nav>
                <nav aria-label="Company links">
                    <p className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
                        The Brand
                    </p>
                    <ul className="space-y-2.5 text-xs sm:text-sm text-cream/75">
                        <li><Link className="transition hover:text-gold-600" to="/about">Our Heritage</Link></li>
                        <li><Link className="transition hover:text-gold-600" to="/privacy">Privacy Policy</Link></li>
                        <li><Link className="transition hover:text-gold-600" to="/terms">Terms of Service</Link></li>
                    </ul>
                </nav>
            </div>
        </div>

        <div className="relative border-t border-stone-200/80 bg-stone-100/60 px-6 py-6 text-center text-xs text-cream/65 sm:flex sm:items-center sm:justify-between sm:px-12">
            <span>© {new Date().getFullYear()} Glockery Home Centre. All rights reserved.</span>
            <div className="mt-2 sm:mt-0 flex items-center justify-center gap-2">
                <span>Handcrafted with precision</span>
                <span aria-hidden="true" className="text-cream/30">•</span>
                <a href="https://faheemcp.tech" target="_blank" rel="noreferrer" className="text-gold-600 hover:text-gold-800 transition font-medium">
                    faheemcp.tech
                </a>
            </div>
        </div>
    </footer>
);

export default StoreFooter;
