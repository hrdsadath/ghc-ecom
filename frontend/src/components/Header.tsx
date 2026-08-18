import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from '../lib/router';
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
    const { signedIn } = useAuth();
    const { wishlistIds } = useWishlist();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const location = useLocation();

    useEffect(() => setMobileOpen(false), [location.pathname]);

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

            <header className="sticky top-0 z-40 border-b border-line bg-obsidian/95 supports-[backdrop-filter]:backdrop-blur-md">
                <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-2 px-3 sm:px-8 lg:h-[72px] lg:px-12">
                    <button
                        className="mr-1 grid size-11 min-w-11 place-items-center rounded-full text-cream hover:bg-cream/8 lg:hidden"
                        onClick={() => setMobileOpen((open) => !open)}
                        aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
                        aria-expanded={mobileOpen}
                        aria-controls="mobile-navigation"
                    >
                        {mobileOpen ? <IconClose size={21} /> : <IconMenu size={21} />}
                    </button>

                    <Link to="/" className="min-w-0 shrink-0 leading-none text-cream" aria-label="Glockery Home Centre, Vengara">
                        <span className="block text-base font-bold tracking-[0.18em] sm:text-lg">GLOCKERY</span>
                        <span className="mt-1 block text-[7px] font-semibold uppercase tracking-[0.2em] text-cream/60 sm:text-[8px]">Home Centre · Vengara</span>
                    </Link>

                    <nav className="ml-10 hidden items-center gap-8 lg:flex" aria-label="Primary navigation">
                        <NavLink exact to="/" className={navLink} activeClassName="text-gold-300">Shop</NavLink>
                        <NavLink to="/search" className={navLink} activeClassName="text-gold-300">All products</NavLink>
                        <NavLink to="/about" className={navLink} activeClassName="text-gold-300">About</NavLink>
                    </nav>

                    <div className="ml-auto flex min-w-0 items-center gap-1">
                        <button className="grid size-11 place-items-center text-cream/70 hover:text-cream" onClick={() => setSearchOpen(true)} aria-label="Search products">
                            <IconSearch size={19} />
                        </button>
                        <Link to="/wishlist" className="relative hidden min-w-11 place-items-center text-cream/70 hover:text-cream sm:grid" aria-label={`Wishlist with ${wishlistIds.length} items`}>
                            <IconHeart size={19} />
                            {wishlistIds.length > 0 && <span className="count-badge">{wishlistIds.length}</span>}
                        </Link>
                        <Link to={signedIn ? '/account' : '/auth'} className="relative hidden min-w-11 place-items-center text-cream/70 hover:text-cream sm:grid" aria-label={signedIn ? 'Account' : 'Sign in'}>
                            <IconUser size={19} />
                        </Link>
                        <button onClick={openCart} className="relative ml-1 flex h-11 min-w-11 items-center gap-2 rounded-full px-2 text-cream hover:text-gold-300" aria-label={`Bag with ${itemCount} items`}>
                            <IconShoppingBag size={19} />
                            <span className="hidden text-sm sm:inline">Cart</span>
                            {itemCount > 0 && <span className="count-badge">{itemCount > 99 ? '99+' : itemCount}</span>}
                        </button>
                        <a className="relative ml-1 hidden h-11 min-w-11 items-center justify-center rounded-full px-2 text-cream hover:text-gold-300 sm:flex max-[480px]:hidden" href="tel:+918138003232">📞</a>
                        <a
                            className="relative ml-1 hidden h-11 min-w-11 items-center justify-center rounded-full px-2 text-cream hover:text-gold-300 sm:flex max-[480px]:hidden"
                            href="https://www.instagram.com/glockery_home_centre/"
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Visit Instagram"
                        >
                            <img src="/img/blackLogo.png" alt="Instagram" className="h-6 w-6 object-contain" />
                        </a>
                  
                    </div>
                </div>

                {mobileOpen && (
                    <div className="border-t border-line bg-obsidian px-5 py-5 lg:hidden">
                        <div className="grid gap-1 sm:grid-cols-3">
                            <button
                                onClick={triggerSearch}
                                className="flex min-h-12 items-center justify-center rounded-xl border border-line text-sm text-cream/85 hover:border-gold-300 hover:text-gold-300"
                            >
                                <span className="mr-2 flex items-center gap-2"><IconSearch size={17} /> Search</span>
                            </button>
                            <Link
                                to="/wishlist"
                                onClick={closeMobileMenu}
                                className="relative flex min-h-12 items-center justify-center rounded-xl border border-line text-sm text-cream/85 hover:border-gold-300 hover:text-gold-300"
                            >
                                <span className="flex items-center gap-2"><IconHeart size={17} /> Wishlist</span>
                                {wishlistIds.length > 0 && <span className="count-badge">{wishlistIds.length}</span>}
                            </Link>
                            <button
                                onClick={() => {
                                    closeMobileMenu();
                                    openCart();
                                }}
                                className="relative flex min-h-12 items-center justify-center rounded-xl border border-line text-sm text-cream/85 hover:border-gold-300 hover:text-gold-300"
                            >
                                <span className="flex items-center gap-2"><IconShoppingBag size={17} /> Cart</span>
                                {itemCount > 0 && <span className="count-badge">{itemCount > 99 ? '99+' : itemCount}</span>}
                            </button>
                        </div>

                        <nav id="mobile-navigation" className="mt-4" aria-label="Mobile navigation">
                            <div className="flex flex-col">
                                <NavLink
                                    exact
                                    to="/"
                                    className="mb-1 flex min-h-12 items-center justify-between rounded-lg px-3 py-2 text-sm text-cream"
                                    activeClassName="text-gold-300"
                                    onClick={closeMobileMenu}
                                >
                                    <span className="flex items-center gap-2">
                                        <IconHome size={17} />
                                        Shop
                                    </span>
                                    <span className="text-xs text-cream/40">{location.pathname === '/' ? 'Home' : 'All items'}</span>
                                </NavLink>
                                <NavLink
                                    to="/search"
                                    className="mb-1 flex min-h-12 items-center gap-2 rounded-lg px-3 py-2 text-sm text-cream"
                                    activeClassName="text-gold-300"
                                    onClick={closeMobileMenu}
                                >
                                    <IconSearch size={17} />
                                    All products
                                </NavLink>
                                <NavLink
                                    to="/about"
                                    className="mb-1 flex min-h-12 items-center gap-2 rounded-lg px-3 py-2 text-sm text-cream"
                                    activeClassName="text-gold-300"
                                    onClick={closeMobileMenu}
                                >
                                    <IconUser size={17} />
                                    About
                                </NavLink>
                                <NavLink
                                    to={signedIn ? '/account' : '/auth'}
                                    className="mb-1 flex min-h-12 items-center gap-2 rounded-lg px-3 py-2 text-sm text-cream"
                                    activeClassName="text-gold-300"
                                    onClick={closeMobileMenu}
                                >
                                    <IconUser size={17} />
                                    {signedIn ? 'My account' : 'Sign in'}
                                </NavLink>
                            </div>
                        </nav>

                        <a href="tel:+918138003232" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line px-4 py-3 text-sm text-cream/80">
                            Call us: +91 81380 03232
                        </a>
                    </div>
                )}
            </header>

            <QuickSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
        </>
    );
};

export default Header;
