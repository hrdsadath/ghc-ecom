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
import { openTrustedUrl } from '../lib/navigation';
import { Address, Order, Product, Profile } from '../types';

const panel = 'border border-gold-500/20 bg-carbon p-6 rounded-sm shadow-md';
const input = 'h-11 w-full border border-gold-500/25 bg-obsidian px-4 text-xs text-cream outline-none focus:border-gold-400 rounded-sm transition';

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
            const res = await api.invoice(orderId);
            if (res?.url && !openTrustedUrl(res.url)) throw new Error('Invoice URL was rejected');
        } catch {
            alert('Tax invoice is being generated. Please check back shortly.');
        }
    };

    return (
        <AccountShell title="Order History" intro="Every order, payment status, tax invoice, and return detail stored securely in your account.">
            {error && <p className="border border-red-500/30 p-4 text-xs text-red-200 rounded-sm mb-4">{error}</p>}
            {loading ? (
                <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-28 animate-pulse rounded-sm bg-carbon border border-gold-500/15" />
                    ))}
                </div>
            ) : !orders.length ? (
                <div className={`${panel} py-16 text-center`}>
                    <div className="mx-auto grid size-14 place-items-center rounded-full border border-gold-500/20 bg-obsidian text-gold-400 mb-4">
                        <IconPackage size={24} />
                    </div>
                    <h3 className="font-display text-2xl font-bold text-cream">No Orders Placed Yet</h3>
                    <p className="mx-auto mt-2 max-w-sm text-xs text-cream/60">Explore crockery and kitchenware from our Vengara store.</p>
                    <Link to="/" className="mt-6 inline-flex items-center gap-2 rounded-sm bg-gold-400 px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-obsidian shadow-md hover:bg-gold-300 transition">
                        Explore Collection <IconArrowRight size={15} />
                    </Link>
                </div>
            ) : (
                <div className="space-y-4">
                    {orders.map((order) => (
                        <article key={order.id} className={`${panel} grid gap-5 sm:grid-cols-[84px_1fr_auto] sm:items-center hover:border-gold-400/40 transition`}>
                            <img
                                loading="lazy"
                                decoding="async"
                                src={order.itemsSnapshot?.[0]?.imageUrl || fallbackImage}
                                alt=""
                                className="aspect-square w-20 object-contain rounded-sm border border-gold-500/20 bg-obsidian"
                                onError={(e) => { e.currentTarget.src = fallbackImage; }}
                            />
                            <div>
                                <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.18em]">
                                    <span className="font-bold text-gold-400 bg-gold-400/10 px-2 py-0.5 rounded-sm border border-gold-400/30">
                                        {titleCase(order.status)}
                                    </span>
                                    <span className="text-cream/40">• Placed {shortDate(order.createdAt)}</span>
                                </div>
                                <h3 className="mt-2 font-display text-xl font-bold text-cream">
                                    {order.itemsSnapshot?.[0]?.productName || 'Glockery Order'}
                                </h3>
                                <p className="mt-1 text-xs text-cream/50 font-mono">
                                    Ref: {order.orderNumber} • <span className="text-gold-300 font-sans font-semibold">{rupees(order.totalPaise)}</span>
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleInvoiceDownload(order.id)}
                                    className="p-2.5 text-gold-300 border border-gold-500/25 rounded-sm hover:border-gold-400 hover:bg-gold-400 hover:text-obsidian transition bg-obsidian"
                                    title="Download Tax Invoice"
                                    aria-label="Download Invoice"
                                >
                                    <IconDownload size={18} />
                                </button>
                                <Link
                                    to={`/account/orders/${order.id}`}
                                    className="grid size-10 place-items-center border border-gold-500/25 text-gold-300 hover:border-gold-400 hover:bg-gold-400 hover:text-obsidian transition rounded-sm bg-obsidian"
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
            {error && <p className="mb-5 border border-red-500/30 p-4 text-xs text-red-200 rounded-sm">{error}</p>}
            <div className="grid gap-4 md:grid-cols-2">
                {addresses.map((address) => (
                    <article className={`${panel} relative flex flex-col justify-between`} key={address.id}>
                        <div>
                            <div className="flex items-start justify-between">
                                <div className="grid size-9 place-items-center rounded-full border border-gold-400/40 bg-obsidian text-gold-400">
                                    <IconMapPin size={18} />
                                </div>
                                <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-gold-300 border border-gold-500/30 px-2 py-0.5 rounded-sm">
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
                                <span className="text-gold-300">Phone: {address.phone}</span>
                            </p>
                        </div>
                        <div className="mt-6 pt-3 border-t border-gold-500/15 flex items-center justify-between">
                            <button onClick={() => { setEditingAddress(address); setOpen(true); }} className="text-xs text-gold-300">Edit Address</button>
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
                    className="min-h-[200px] flex flex-col items-center justify-center gap-2 border border-dashed border-gold-500/40 bg-carbon/50 p-6 text-xs font-bold uppercase tracking-[0.2em] text-gold-300 hover:bg-gold-400/10 hover:border-gold-400 transition rounded-sm"
                >
                    <span className="text-2xl text-gold-400">+</span>
                    Add New Contact Address
                </button>
            </div>

            {open && (
                <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/85 p-5 backdrop-blur-md">
                    <form ref={addressDialogRef} tabIndex={-1} onSubmit={submit} className="my-8 w-full max-w-xl border border-gold-500/30 bg-carbon p-8 rounded-sm shadow-2xl outline-none" role="dialog" aria-modal="true" aria-labelledby="address-dialog-title">
                        <div className="flex justify-between border-b border-gold-500/20 pb-4">
                            <h3 id="address-dialog-title" className="font-display text-2xl text-cream font-bold">{editingAddress ? 'Edit Saved Address' : 'Add Saved Address'}</h3>
                            <button type="button" onClick={() => { setOpen(false); setEditingAddress(null); }} className="text-xs text-cream/40 hover:text-gold-300">Close</button>
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
                        <label className="mt-5 flex items-center gap-2 text-xs text-cream/60">
                            <input type="checkbox" name="isDefault" defaultChecked={editingAddress?.isDefault} className="accent-gold-400 size-4" /> Make this my default contact address
                        </label>
                        <button className="mt-6 h-12 w-full bg-gold-400 text-xs font-bold uppercase tracking-[0.2em] text-obsidian hover:bg-gold-300 rounded-sm transition">
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
                <p className="border border-red-500/30 p-4 text-xs text-red-200" role="alert">{error} Please try again.</p>
            ) : loading ? (
                <p className="text-sm text-cream/40">Loading saved wishlist items…</p>
            ) : !products.length ? (
                <div className={`${panel} py-16 text-center`}>
                    <div className="mx-auto grid size-14 place-items-center rounded-full border border-gold-500/20 bg-obsidian text-gold-400 mb-4">
                        <IconHeart size={24} />
                    </div>
                    <h3 className="font-display text-2xl font-bold text-cream">Your Wishlist is Empty</h3>
                    <p className="mt-2 text-xs text-cream/50 max-w-sm mx-auto">Save pieces while browsing the collection to review them later.</p>
                    <Link to="/" className="mt-6 inline-flex items-center gap-2 rounded-sm bg-gold-400 px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-obsidian shadow-md hover:bg-gold-300 transition">
                        Explore Collection <IconArrowRight size={15} />
                    </Link>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {products.map((product) => (
                        <div key={product.id} className={`${panel} relative flex flex-col justify-between`}>
                            <div>
                                <img
                                    loading="lazy"
                                    decoding="async"
                                    src={product.images[0]?.thumbnailUrl || fallbackImage}
                                    alt=""
                                    className="aspect-square w-full object-contain rounded-sm border border-gold-500/20 bg-obsidian"
                                    onError={(e) => { e.currentTarget.src = fallbackImage; }}
                                />
                                <h3 className="mt-3 font-display text-lg font-bold text-cream line-clamp-1">{product.name}</h3>
                                <p className="mt-1 font-bold text-gold-300 text-sm">{product.variants[0] ? rupees(product.variants[0].pricePaise) : '—'}</p>
                            </div>
                            <div className="mt-4 flex gap-2 pt-3 border-t border-gold-500/15">
                                <Link to={`/product/${product.slug}`} className="flex-1 bg-gold-400 text-obsidian font-bold text-[10px] uppercase tracking-wider py-2.5 text-center rounded-sm hover:bg-gold-300 transition">
                                    View Piece
                                </Link>
                                <button onClick={() => toggleWishlist(product.id)} className="p-2.5 text-red-400 border border-red-500/20 rounded-sm hover:bg-red-950/30 transition">
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
            <form onSubmit={submit} className={`${panel} max-w-2xl space-y-5`}>
                {saved && (
                    <div className="flex items-center gap-2 rounded-sm border border-emerald-500/30 bg-emerald-950/20 p-4 text-xs font-semibold text-emerald-300">
                        <IconCheckCircle size={18} color="#10B981" /> Profile details saved successfully.
                    </div>
                )}
                {error && <p className="text-xs text-red-200 border border-red-500/30 bg-red-950/20 p-4 rounded-sm">{error}</p>}

                <div className="space-y-4">
                    <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-cream/70">Full Name</span>
                        <input name="fullName" className={input} defaultValue={profile?.fullName || ''} required />
                    </label>

                    <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-cream/70">Email Address</span>
                        <input className={`${input} opacity-70 cursor-not-allowed`} value={session?.user?.email || profile?.email || ''} readOnly aria-describedby="account-email-help" />
                        <span id="account-email-help" className="mt-1.5 block text-[10px] text-cream/40">Your login email is managed by your authentication provider.</span>
                    </label>

                    <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-cream/70">Mobile Phone Number</span>
                        <input name="phone" className={input} defaultValue={profile?.phone || ''} placeholder="+91 98765 43210" />
                    </label>
                </div>

                <div className="pt-4 border-t border-gold-500/15">
                    <button className="h-12 bg-gold-400 px-8 text-xs font-bold uppercase tracking-[0.2em] text-obsidian rounded-sm hover:bg-gold-300 transition shadow-md">
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
