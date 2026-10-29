import React, { useEffect, useState } from 'react';
import { Link, NavLink, usePath } from '../lib/router';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { useWishlist } from '../contexts/WishlistContext';
import {
    IconClose,
    IconHome,
    IconHeart,
    IconMenu,
    IconSearch,
    IconShoppingBag,
    IconUser,
} from './Icons';
import QuickSearchModal from './QuickSearchModal';

const navLink = 'text-sm text-cream/70 hover:text-cream';

const Header = () => {
    const { itemCount, openCart } = useCart();
    const { signedIn, isStaff } = useAuth();
    const accountPath = isStaff ? '/admin' : signedIn ? '/account' : '/auth';
    const accountLabel = isStaff ? 'Admin workspace' : signedIn ? 'My account' : 'Sign in';
    const { wishlistIds } = useWishlist();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const pathname = usePath();

    useEffect(() => setMobileOpen(false), [pathname]);

    const closeMobileMenu = () => setMobileOpen(false);
    const triggerSearch = () => {
        setMobileOpen(false);
        setSearchOpen(true);
    };

    return (
        <>
            <a href="#main-content" className="fixed left-3 top-3 z-50 -translate-y-24 bg-cream px-4 py-2 text-sm font-semibold text-obsidian focus:translate-y-0">
                Skip to content
            </a>

            <aside aria-label="Store announcement" className="relative z-50 border-b border-gold-500/15 bg-[#f6f3eb]/95 py-2 px-4 text-center backdrop-blur-md">
                <div className="mx-auto flex max-w-[1440px] items-center justify-center gap-3 text-xs tracking-wider text-gold-700">
                    <span className="inline-block size-1.5 rounded-full bg-gold-600 animate-pulse" />
                    <span className="font-medium">Luxury Crockery & Dinnerware Collections · Direct Store in Vengara, Malappuram · Express Shipping</span>
                    <span className="hidden sm:inline text-gold-600/40">|</span>
                    <a href="tel:+918138003232" className="hidden sm:inline font-semibold text-gold-700 hover:text-gold-900 transition-colors">Concierge: +91 81380 03232</a>
                </div>
            </aside>

            <header className="sticky top-0 z-40 border-b border-white/10 bg-obsidian/75 backdrop-blur-xl supports-[backdrop-filter]:bg-obsidian/60 transition-all duration-300">
                <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-8 lg:h-[76px] lg:px-12">
                    <div className="flex items-center gap-3">
                        <button
                            className="grid size-10 min-w-10 place-items-center rounded-full border border-white/10 bg-white/5 text-cream transition hover:border-gold-400/40 hover:bg-white/10 lg:hidden"
                            onClick={() => setMobileOpen((open) => !open)}
                            aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
                            aria-expanded={mobileOpen}
                            aria-controls="mobile-navigation"
                        >
                            {mobileOpen ? <IconClose size={20} /> : <IconMenu size={20} />}
                        </button>

                        <Link to="/" className="group min-w-0 shrink-0 leading-none" aria-label="Glockery Home Centre, Vengara">
                            <span className="block font-display text-xl font-bold tracking-[0.22em] text-cream transition group-hover:text-gold-200 sm:text-2xl">
                                GLOCKERY
                            </span>
                            <span className="mt-1 block text-[7px] font-semibold uppercase tracking-[0.26em] text-gold-400/80 sm:text-[8px]">
                                Home Centre · Vengara
                            </span>
                        </Link>
                    </div>

                    <nav className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] p-1.5 backdrop-blur-md lg:flex" aria-label="Primary navigation">
                        <NavLink exact to="/" className="rounded-full px-5 py-2 text-sm font-medium text-cream/75 transition hover:text-cream hover:bg-white/5" activeClassName="!bg-gold-500/15 !text-gold-700 border border-gold-400/40 shadow-sm">Shop</NavLink>
                        <NavLink to="/search" className="rounded-full px-5 py-2 text-sm font-medium text-cream/75 transition hover:text-cream hover:bg-white/5" activeClassName="!bg-gold-500/15 !text-gold-700 border border-gold-400/40 shadow-sm">All Products</NavLink>
                        <NavLink to="/about" className="rounded-full px-5 py-2 text-sm font-medium text-cream/75 transition hover:text-cream hover:bg-white/5" activeClassName="!bg-gold-500/15 !text-gold-700 border border-gold-400/40 shadow-sm">About Us</NavLink>
                    </nav>

                    <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                        <button 
                            className="grid size-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-cream/80 transition hover:border-gold-400/40 hover:bg-white/10 hover:text-cream"
                            onClick={() => setSearchOpen(true)} 
                            aria-label="Search products"
                        >
                            <IconSearch size={18} />
                        </button>
                        <Link 
                            to="/wishlist" 
                            className="relative hidden size-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-cream/80 transition hover:border-gold-400/40 hover:bg-white/10 hover:text-cream sm:grid" 
                            aria-label={`Wishlist with ${wishlistIds.length} items`}
                        >
                            <IconHeart size={18} />
                            {wishlistIds.length > 0 && <span className="count-badge">{wishlistIds.length}</span>}
                        </Link>
                        <Link 
                            to={accountPath} 
                            className="relative hidden size-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-cream/80 transition hover:border-gold-400/40 hover:bg-white/10 hover:text-cream sm:grid" 
                            aria-label={accountLabel}
                        >
                            <IconUser size={18} />
                        </Link>
                        <button 
                            onClick={openCart} 
                            className="relative flex h-10 items-center gap-2 rounded-full border border-gold-400/40 bg-gold-500/10 px-3.5 text-cream transition hover:border-gold-500/60 hover:bg-gold-500/20 shadow-sm" 
                            aria-label={`Bag with ${itemCount} items`}
                        >
                            <IconShoppingBag size={18} className="text-gold-700" />
                            <span className="hidden text-xs font-semibold uppercase tracking-wider text-cream/90 sm:inline">Cart</span>
                            {itemCount > 0 && <span className="count-badge">{itemCount > 99 ? '99+' : itemCount}</span>}
                        </button>
                        <a
                            className="relative hidden size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-cream/80 transition hover:border-gold-400/40 hover:bg-white/10 hover:text-cream sm:flex max-[480px]:hidden"
                            href="https://www.instagram.com/glockery_home_centre/"
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Visit Instagram"
                        >
                            <img src="/img/blackLogo.png" alt="Instagram" className="h-5 w-5 object-contain" />
                        </a>
                    </div>
                </div>

                {mobileOpen && (
                    <div className="border-t border-white/10 bg-obsidian/95 px-5 py-6 backdrop-blur-2xl lg:hidden">
                        <div className="grid gap-2 sm:grid-cols-3">
                            <button
                                onClick={triggerSearch}
                                className="flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-medium text-cream/90 transition hover:border-gold-400/40 hover:bg-white/10"
                            >
                                <span className="flex items-center gap-2"><IconSearch size={18} className="text-gold-300" /> Search</span>
                            </button>
                            <Link
                                to="/wishlist"
                                onClick={closeMobileMenu}
                                className="relative flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-medium text-cream/90 transition hover:border-gold-400/40 hover:bg-white/10"
                            >
                                <span className="flex items-center gap-2"><IconHeart size={18} className="text-gold-300" /> Wishlist</span>
                                {wishlistIds.length > 0 && <span className="count-badge">{wishlistIds.length}</span>}
                            </Link>
                            <button
                                onClick={() => {
                                    closeMobileMenu();
                                    openCart();
                                }}
                                className="relative flex min-h-12 items-center justify-center rounded-2xl border border-gold-400/30 bg-gold-500/10 text-sm font-semibold text-gold-200 transition hover:bg-gold-500/20"
                            >
                                <span className="flex items-center gap-2"><IconShoppingBag size={18} /> Cart</span>
                                {itemCount > 0 && <span className="count-badge">{itemCount > 99 ? '99+' : itemCount}</span>}
                            </button>
                        </div>

                        <nav id="mobile-navigation" className="mt-5" aria-label="Mobile navigation">
                            <div className="flex flex-col gap-1">
                                <NavLink
                                    exact
                                    to="/"
                                    className="flex min-h-12 items-center justify-between rounded-xl px-4 py-2 text-sm font-medium text-cream transition hover:bg-white/5"
                                    activeClassName="!bg-gold-500/15 !text-gold-200 border border-gold-400/30"
                                    onClick={closeMobileMenu}
                                >
                                    <span className="flex items-center gap-3">
                                        <IconHome size={18} />
                                        Shop Home
                                    </span>
                                    <span className="text-xs text-gold-400/70">Explore</span>
                                </NavLink>
                                <NavLink
                                    to="/search"
                                    className="flex min-h-12 items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium text-cream transition hover:bg-white/5"
                                    activeClassName="!bg-gold-500/15 !text-gold-200 border border-gold-400/30"
                                    onClick={closeMobileMenu}
                                >
                                    <IconSearch size={18} />
                                    All Collections
                                </NavLink>
                                <NavLink
                                    to="/about"
                                    className="flex min-h-12 items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium text-cream transition hover:bg-white/5"
                                    activeClassName="!bg-gold-500/15 !text-gold-200 border border-gold-400/30"
                                    onClick={closeMobileMenu}
                                >
                                    <IconUser size={18} />
                                    About Glockery
                                </NavLink>
                                <NavLink
                                    to={accountPath}
                                    className="flex min-h-12 items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium text-cream transition hover:bg-white/5"
                                    activeClassName="!bg-gold-500/15 !text-gold-200 border border-gold-400/30"
                                    onClick={closeMobileMenu}
                                >
                                    <IconUser size={18} />
                                    {accountLabel}
                                </NavLink>
                            </div>
                        </nav>

                        <a href="tel:+918138003232" className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] py-3.5 text-xs font-semibold tracking-wider uppercase text-gold-300">
                            Call Direct: +91 81380 03232
                        </a>
                    </div>
                )}
            </header>

            <QuickSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
        </>
    );
};

export default Header;
