import React, { ReactNode, useEffect, useRef } from 'react';
import { NavLink, useLocation } from '../lib/router';
import { useAuth } from '../contexts/AuthContext';
import { useWishlist } from '../contexts/WishlistContext';
import { IconHeart, IconLogOut, IconMapPin, IconPackage, IconUser } from './Icons';
import Header from './Header';
import StoreFooter from './StoreFooter';

const AccountShell = ({ title, intro, children }: { title: string; intro: string; children: ReactNode }) => {
    const { session, signOut } = useAuth();
    const { wishlistIds } = useWishlist();
    const location = useLocation();
    const tabsRef = useRef<HTMLElement | null>(null);

    useEffect(() => { document.title = `${title} | Glockery Home Centre`; }, [title]);
    useEffect(() => { tabsRef.current?.scrollTo({ left: 0, behavior: 'auto' }); }, [location.pathname]);

    const links = [
        ['/account', 'Personal Profile', <IconUser size={18} key="user" />],
        ['/account/addresses', 'Saved Addresses', <IconMapPin size={18} key="pin" />],
        ['/account/orders', 'Order History', <IconPackage size={18} key="pkg" />],
        ['/account/wishlist', `Wishlist (${wishlistIds.length})`, <IconHeart size={18} key="heart" />],
    ];

    const userEmail = session?.user?.email || '';

    return (
        <div className="flex min-h-screen flex-col justify-between bg-obsidian font-body text-cream">
            <Header />
            <div className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
                <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
                    {/* Glass Sidebar */}
                    <aside className="glass-panel h-fit rounded-3xl p-5 border border-white/10 shadow-lg">
                        <div className="mb-4 pb-4 border-b border-white/10 px-3">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-400/80">Account</span>
                            <p className="text-xs text-cream/70 truncate mt-0.5">{userEmail}</p>
                        </div>

                        <nav ref={tabsRef} className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0" aria-label="Account navigation">
                            {links.map(([href, label, icon]) => (
                                <NavLink
                                    exact={href === '/account'}
                                    key={String(href)}
                                    to={String(href)}
                                    activeClassName="border-gold-400/80 bg-gold-400/20 text-gold-200 shadow-[0_0_15px_rgba(212,175,55,0.2)]"
                                    className="glass-pill flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3.5 text-xs font-medium text-cream/70 transition-all hover:text-white"
                                >
                                    {icon}<span>{label}</span>
                                </NavLink>
                            ))}
                        </nav>
                        <button
                            onClick={() => void signOut()}
                            className="mt-4 flex min-h-11 w-full items-center gap-3 rounded-xl border border-transparent px-3.5 text-xs text-red-300/80 hover:bg-red-500/10 hover:text-red-200 transition"
                        >
                            <IconLogOut size={16} /> Sign Out
                        </button>
                    </aside>

                    {/* Main Content Area */}
                    <main id="main-content" className="min-w-0">
                        <header className="glass-panel relative mb-8 overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-10">
                            <div className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-gold-400/10 blur-3xl" />
                            <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold-400/80">
                                My Account
                            </span>
                            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-cream sm:text-4xl">{title}</h1>
                            <p className="mt-2.5 max-w-2xl text-xs sm:text-sm leading-relaxed text-cream/65">{intro}</p>
                        </header>
                        {children}
                    </main>
                </div>
            </div>
            <StoreFooter />
        </div>
    );
};

export default AccountShell;
