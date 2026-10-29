'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import { Link, Redirect, useLocation } from '../lib/router';
import AccountShell from '../components/AccountShell';
import {
    IconArrowRight,
    IconBadgeCheck,
    IconCheckCircle,
    IconChevronRight,
    IconDownload,
    IconHeart,
    IconMapPin,
    IconPackage,
    IconShield,
    IconTrash,
    IconUser,
} from '../components/Icons';
import { useAuth } from '../contexts/AuthContext';
import { useWishlist } from '../contexts/WishlistContext';
import { useDialog } from '../hooks/useDialog';
import { api } from '../lib/api';
import { fallbackImage, rupees, shortDate, titleCase } from '../lib/commerce';
import { openTrustedUrlFrom } from '../lib/navigation';
import { Address, Order, Product, Profile } from '../types';

const panel = 'glass-card p-6 md:p-8 rounded-3xl';
const input = 'h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-xs text-cream placeholder-cream/30 backdrop-blur-xl outline-none transition focus:border-gold-400/50 focus:bg-white/[0.08] focus:ring-1 focus:ring-gold-400/30';

const OrdersView = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        api.orders()
            .then(setOrders)
            .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load orders.'))
            .finally(() => setLoading(false));
    }, []);

    const handleInvoiceDownload = async (orderId: string) => {
        try {
            await openTrustedUrlFrom(() => api.invoice(orderId).then((res) => res?.url));
        } catch {
            alert('Tax invoice is being generated. Please check back shortly.');
        }
    };

    return (
        <AccountShell title="Order History" intro="Every order, payment status, invoice, and return detail stored securely in your account.">
            {error && <p className="mb-4 rounded-2xl border border-red-500/30 bg-red-950/20 p-4 text-xs text-red-200 backdrop-blur-xl">{error}</p>}
            {loading ? (
                <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-28 animate-pulse rounded-3xl glass-card" />
                    ))}
                </div>
            ) : !orders.length ? (
                <div className={`${panel} py-16 text-center`}>
                    <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl border border-gold-400/25 bg-gold-400/10 text-gold-400 shadow-[0_0_20px_rgba(201,163,91,0.15)]">
                        <IconPackage size={26} />
                    </div>
                    <h3 className="font-display text-2xl font-bold text-cream">No Orders Placed Yet</h3>
                    <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-cream/55">Explore crockery and kitchenware from our Vengara store.</p>
                    <Link to="/" className="button-primary mt-6 inline-flex items-center gap-2">
                        Explore Collection <IconArrowRight size={15} />
                    </Link>
                </div>
            ) : (
                <div className="space-y-4">
                    {orders.map((order) => (
                        <article key={order.id} className={`${panel} grid gap-5 sm:grid-cols-[84px_1fr_auto] sm:items-center hover:border-gold-400/40 transition group`}>
                            <img
                                loading="lazy"
                                decoding="async"
                                src={order.itemsSnapshot?.[0]?.imageUrl || fallbackImage}
                                alt=""
                                className="aspect-square w-20 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 object-contain"
                                onError={(e) => { e.currentTarget.src = fallbackImage; }}
                            />
                            <div>
                                <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.18em]">
                                    <span className="glass-pill border-gold-400/30 bg-gold-400/10 px-2.5 py-0.5 font-bold text-gold-400">
                                        {titleCase(order.status)}
                                    </span>
                                    <span className="text-cream/40">• Placed {shortDate(order.createdAt)}</span>
                                </div>
                                <h3 className="mt-2 font-display text-xl font-bold text-cream">
                                    {order.itemsSnapshot?.[0]?.productName || 'Glockery Order'}
                                </h3>
                                <p className="mt-1 font-mono text-xs text-cream/50">
                                    Ref: {order.orderNumber} • <span className="font-sans font-semibold text-gold-300">{rupees(order.totalPaise)}</span>
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleInvoiceDownload(order.id)}
                                    className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-gold-300 transition hover:border-gold-400/50 hover:bg-gold-400/10 hover:text-gold-200"
                                    title="Download Invoice"
                                    aria-label="Download Invoice"
                                >
                                    <IconDownload size={18} />
                                </button>
                                <Link
                                    to={`/account/orders/${order.id}`}
                                    className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-gold-300 transition hover:border-gold-400/50 hover:bg-gold-400/10 hover:text-gold-200"
                                    aria-label={`View ${order.orderNumber}`}
                                >
                                    <IconChevronRight size={18} />
                                </Link>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </AccountShell>
    );
};

const AddressesView = () => {
    const [addresses, setAddresses] = useState<Address[]>([]);
    const [open, setOpen] = useState(false);
    const [editingAddress, setEditingAddress] = useState<Address | null>(null);
    const [error, setError] = useState('');
    const addressDialogRef = useDialog<HTMLFormElement>(open, () => setOpen(false));

    const load = () =>
        api.addresses()
            .then(setAddresses)
            .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load addresses.'));

    useEffect(() => { void load(); }, []);

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError('');
        try {
            const addressInput = {
                label: String(form.get('label')),
                recipientName: String(form.get('recipientName')),
                phone: String(form.get('phone')),
                line1: String(form.get('line1')),
                line2: String(form.get('line2') || ''),
                city: String(form.get('city')),
                state: String(form.get('state')),
                postalCode: String(form.get('postalCode')),
                country: 'IN',
                isDefault: Boolean(form.get('isDefault')),
            };
            if (editingAddress) await api.updateAddress(editingAddress.id, addressInput);
            else await api.createAddress(addressInput);
            setOpen(false);
            setEditingAddress(null);
            await load();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Unable to save address.');
        }
    };

    return (
        <AccountShell title="Contact Addresses" intro="Saved contact details used for your account and order records.">
            {error && <p className="mb-5 rounded-2xl border border-red-500/30 bg-red-950/20 p-4 text-xs text-red-200 backdrop-blur-xl">{error}</p>}
            <div className="grid gap-5 md:grid-cols-2">
                {addresses.map((address) => (
                    <article className={`${panel} relative flex flex-col justify-between hover:border-gold-400/40 transition`} key={address.id}>
                        <div>
                            <div className="flex items-start justify-between">
                                <div className="grid size-10 place-items-center rounded-2xl border border-gold-400/30 bg-gold-400/10 text-gold-400 shadow-[0_0_15px_rgba(201,163,91,0.12)]">
                                    <IconMapPin size={18} />
                                </div>
                                <span className="glass-pill border-gold-400/30 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-gold-300">
                                    {address.isDefault ? 'Default Contact' : address.label}
                                </span>
                            </div>
                            <h3 className="mt-4 font-display text-xl font-bold text-cream">{address.recipientName}</h3>
                            <p className="mt-2 text-xs leading-relaxed text-cream/65">
                                {address.line1}
                                {address.line2 ? `, ${address.line2}` : ''}
                                <br />
                                {address.city}, {address.state} {address.postalCode}
                                <br />
                                <span className="mt-1 inline-block text-gold-300 font-medium">Phone: {address.phone}</span>
                            </p>
                        </div>
                        <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
                            <button onClick={() => { setEditingAddress(address); setOpen(true); }} className="text-xs font-semibold text-gold-300 hover:text-gold-200 transition">Edit Address</button>
                            <button
                                onClick={async () => {
                                    if (window.confirm('Remove this saved address?')) {
                                        try {
                                            await api.deleteAddress(address.id);
                                            await load();
                                        } catch (caught) {
                                            setError(caught instanceof Error ? caught.message : 'Unable to remove address.');
                                        }
                                    }
                                }}
                                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition"
                            >
                                <IconTrash size={14} /> Remove Address
                            </button>
                        </div>
                    </article>
                ))}
                <button
                    onClick={() => setOpen(true)}
                    className="flex min-h-[200px] flex-col items-center justify-center gap-2.5 rounded-3xl border border-dashed border-gold-400/30 bg-white/[0.02] p-6 text-xs font-bold uppercase tracking-[0.2em] text-gold-300 transition hover:border-gold-400/60 hover:bg-gold-400/[0.05]"
                >
                    <span className="grid size-12 place-items-center rounded-2xl border border-gold-400/30 bg-gold-400/10 text-xl font-bold text-gold-300 shadow-[0_0_15px_rgba(201,163,91,0.15)]">+</span>
                    Add New Contact Address
                </button>
            </div>

            {open && (
                <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-obsidian/80 p-5 backdrop-blur-2xl">
                    <form ref={addressDialogRef} tabIndex={-1} onSubmit={submit} className="my-8 w-full max-w-xl glass-panel-elevated p-8 md:p-10 rounded-3xl shadow-2xl outline-none" role="dialog" aria-modal="true" aria-labelledby="address-dialog-title">
                        <div className="flex justify-between border-b border-white/10 pb-4">
                            <h3 id="address-dialog-title" className="font-display text-2xl font-bold text-cream">{editingAddress ? 'Edit Saved Address' : 'Add Saved Address'}</h3>
                            <button type="button" onClick={() => { setOpen(false); setEditingAddress(null); }} className="rounded-full border border-white/10 px-3 py-1 text-xs text-cream/40 transition hover:border-white/20 hover:text-cream">Close</button>
                        </div>
                        <div className="mt-6 grid gap-4 sm:grid-cols-2">
                            {[
                                ['label', 'Address Tag (e.g. Home, Office)'],
                                ['recipientName', 'Recipient Full Name'],
                                ['phone', 'Phone Number'],
                                ['line1', 'Street Address'],
                                ['line2', 'Landmark / Apartment (Optional)'],
                                ['city', 'City'],
                                ['state', 'State'],
                                ['postalCode', 'PIN Code'],
                            ].map(([name, label]) => (
                                <label key={name} className={name === 'line1' || name === 'line2' ? 'sm:col-span-2' : ''}>
                                    <span className="mb-1.5 block text-xs text-cream/60">{label}</span>
                                    <input className={input} name={name} defaultValue={editingAddress?.[name as keyof Address] as string || ''} required={name !== 'line2'} pattern={name === 'postalCode' ? '[0-9]{6}' : undefined} />
                                </label>
                            ))}
                        </div>
                        <label className="mt-5 flex items-center gap-2.5 text-xs text-cream/70">
                            <input type="checkbox" name="isDefault" defaultChecked={editingAddress?.isDefault} className="size-4 rounded accent-gold-400" /> Make this my default contact address
                        </label>
                        <button className="button-primary mt-6 h-12 w-full">
                            {editingAddress ? 'Update Address' : 'Save Address'}
                        </button>
                    </form>
                </div>
            )}
        </AccountShell>
    );
};

const WishlistView = () => {
    const { wishlistIds, toggleWishlist } = useWishlist();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        const loadWishlist = async () => {
            try {
                const saved = wishlistIds.length ? await api.productsByIds(wishlistIds) : [];
                if (!cancelled) setProducts(saved);
            } catch (caught) {
                if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load wishlist.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        setLoading(true);
        setError('');
        void loadWishlist();
        return () => { cancelled = true; };
    }, [wishlistIds]);

    return (
        <AccountShell title="Saved wishlist" intro="Pieces you have saved for another look.">
            {error ? (
                <p className="rounded-2xl border border-red-500/30 bg-red-950/20 p-4 text-xs text-red-200 backdrop-blur-xl" role="alert">{error} Please try again.</p>
            ) : loading ? (
                <p className="text-sm text-cream/40">Loading saved wishlist items…</p>
            ) : !products.length ? (
                <div className={`${panel} py-16 text-center`}>
                    <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl border border-gold-400/25 bg-gold-400/10 text-gold-400 shadow-[0_0_20px_rgba(201,163,91,0.15)]">
                        <IconHeart size={26} />
                    </div>
                    <h3 className="font-display text-2xl font-bold text-cream">Your Wishlist is Empty</h3>
                    <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-cream/50">Save pieces while browsing the collection to review them later.</p>
                    <Link to="/" className="button-primary mt-6 inline-flex items-center gap-2">
                        Explore Collection <IconArrowRight size={15} />
                    </Link>
                </div>
            ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {products.map((product) => (
                        <div key={product.id} className={`${panel} relative flex flex-col justify-between hover:border-gold-400/40 transition group`}>
                            <div>
                                <div className="aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                                    <img
                                        loading="lazy"
                                        decoding="async"
                                        src={product.images[0]?.thumbnailUrl || fallbackImage}
                                        alt=""
                                        className="size-full object-contain transition duration-500 group-hover:scale-105"
                                        onError={(e) => { e.currentTarget.src = fallbackImage; }}
                                    />
                                </div>
                                <h3 className="mt-3.5 font-display text-lg font-bold text-cream line-clamp-1">{product.name}</h3>
                                <p className="mt-1 text-sm font-bold text-gold-300">{product.variants[0] ? rupees(product.variants[0].pricePaise) : '—'}</p>
                            </div>
                            <div className="mt-5 flex gap-2 border-t border-white/10 pt-4">
                                <Link to={`/product/${product.slug}`} className="button-primary flex-1 py-2.5 text-center text-[10px] tracking-wider uppercase">
                                    View Piece
                                </Link>
                                <button onClick={() => toggleWishlist(product.id)} className="rounded-xl border border-red-500/25 bg-red-950/20 p-2.5 text-red-400 transition hover:bg-red-950/40" title="Remove">
                                    <IconTrash size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </AccountShell>
    );
};

const ProfileView = () => {
    const { session } = useAuth();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        api.profile()
            .then(setProfile)
            .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load profile.'));
    }, []);

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        try {
            setProfile(
                await api.updateProfile({
                    fullName: String(form.get('fullName')),
                    phone: String(form.get('phone') || '') || undefined,
                })
            );
            setSaved(true);
            setTimeout(() => setSaved(false), 5000);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Unable to update profile.');
        }
    };

    return (
        <AccountShell title="Profile settings" intro="Contact details used for orders and notifications.">
            <form onSubmit={submit} className="glass-panel max-w-2xl rounded-3xl p-8 md:p-10 space-y-6">
                {saved && (
                    <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-950/25 p-4 text-xs font-semibold text-emerald-300 backdrop-blur-xl">
                        <IconCheckCircle size={18} color="#10B981" /> Profile details saved successfully.
                    </div>
                )}
                {error && <p className="rounded-2xl border border-red-500/30 bg-red-950/25 p-4 text-xs text-red-200 backdrop-blur-xl">{error}</p>}

                <div className="space-y-5">
                    <label className="block">
                        <span className="mb-2 block text-xs font-semibold text-cream/70">Full Name</span>
                        <input name="fullName" className={input} defaultValue={profile?.fullName || ''} required />
                    </label>

                    <label className="block">
                        <span className="mb-2 block text-xs font-semibold text-cream/70">Email Address</span>
                        <input className={`${input} opacity-60 cursor-not-allowed`} value={session?.user?.email || profile?.email || ''} readOnly aria-describedby="account-email-help" />
                        <span id="account-email-help" className="mt-1.5 block text-[10px] text-cream/40">Your login email is managed by your authentication provider.</span>
                    </label>

                    <label className="block">
                        <span className="mb-2 block text-xs font-semibold text-cream/70">Mobile Phone Number</span>
                        <input name="phone" className={input} defaultValue={profile?.phone || ''} placeholder="+91 98765 43210" />
                    </label>
                </div>

                <div className="pt-4 border-t border-white/10">
                    <button className="button-primary h-12 px-8">
                        Save Changes
                    </button>
                </div>
            </form>
        </AccountShell>
    );
};

const AccountPage = () => {
    const { signedIn, isInitializing } = useAuth();
    const location = useLocation();
    if (isInitializing) return null;
    if (!signedIn) return <Redirect to={`/auth?next=${encodeURIComponent(location.pathname)}`} />;
    if (location.pathname.startsWith('/account/orders')) return <OrdersView />;
    if (location.pathname.startsWith('/account/addresses')) return <AddressesView />;
    if (location.pathname.startsWith('/account/wishlist')) return <WishlistView />;
    return <ProfileView />;
};

export default AccountPage;
