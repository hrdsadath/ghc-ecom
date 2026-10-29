'use client';

import React, { useState } from 'react';
import { Link } from '../lib/router';
import Header from '../components/Header';
import StoreFooter from '../components/StoreFooter';
import TrustBadges from '../components/TrustBadges';
import { InfoPageKind, pageContent } from '../lib/info-content';

export const InfoPage = ({ kind = 'about' }: { kind?: InfoPageKind }) => {
    const page = pageContent[kind];
    const [contactForm, setContactForm] = useState({ name: '', phone: '', message: '', orderRef: '' });
    const [contactSent, setContactSent] = useState(false);

    const handleContactSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const subject = contactForm.orderRef ? `Order help: ${contactForm.orderRef}` : 'Product enquiry';
        const body = `${subject}\n\n${contactForm.message}\n\nName: ${contactForm.name}\nPhone: ${contactForm.phone}${contactForm.orderRef ? `\nOrder: ${contactForm.orderRef}` : ''}`;
        window.location.href = `https://wa.me/916282000289?text=${encodeURIComponent(body)}`;
        setContactSent(true);
        setTimeout(() => setContactSent(false), 6000);
    };

    const tabs: Array<{ id: InfoPageKind; label: string; href: string }> = [
        { id: 'about', label: 'Our Story', href: '/about' },
        { id: 'shipping', label: 'Shipping & Safe Transit', href: '/shipping-returns' },
        { id: 'faq', label: 'FAQ', href: '/faq' },
        { id: 'contact', label: 'Store & Concierge', href: '/contact' },
        { id: 'privacy', label: 'Privacy Policy', href: '/privacy' },
        { id: 'terms', label: 'Terms of Service', href: '/terms' },
    ];

    return (
        <div className="flex min-h-screen flex-col bg-obsidian font-body text-cream">
            <Header />

            <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-8 lg:py-14">
                {/* Frosted Navigation Pills */}
                <nav className="flex gap-2.5 overflow-x-auto pb-2" aria-label="Information pages">
                    {tabs.map((tab) => (
                        <Link
                            key={tab.id}
                            to={tab.href}
                            className={`shrink-0 rounded-full px-5 py-2 text-xs sm:text-sm font-medium transition-all ${
                                kind === tab.id
                                    ? 'border border-gold-400/80 bg-gold-400/20 text-gold-200 shadow-[0_0_15px_rgba(212,175,55,0.25)]'
                                    : 'glass-pill text-cream/70 hover:text-white'
                            }`}
                        >
                            {tab.label}
                        </Link>
                    ))}
                </nav>

                {/* Hero Header Pavilion */}
                <header className="glass-panel relative mt-6 overflow-hidden rounded-3xl border border-white/10 p-8 sm:p-12">
                    <div className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-gold-400/10 blur-3xl" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold-400/80">
                        {page.eyebrow}
                    </span>
                    <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-cream sm:text-5xl lg:text-6xl">
                        {page.title}
                    </h1>
                    <p className="mt-4 max-w-2xl text-sm sm:text-base leading-relaxed text-cream/75">
                        {page.intro}
                    </p>
                </header>

                {/* Content Section */}
                <div className="mt-10">
                    {kind === 'faq' ? (
                        <section className="space-y-4">
                            {page.sections.map((item, index) => (
                                <details key={item.title} className="glass-card group rounded-2xl p-5 border border-white/5 transition-all" open={index === 0}>
                                    <summary className="flex cursor-pointer items-center justify-between text-base font-semibold text-cream marker:hidden">
                                        {item.title}
                                        <span className="ml-4 text-xl font-normal text-gold-300 transition-transform group-open:rotate-45">+</span>
                                    </summary>
                                    <p className="mt-4 max-w-3xl text-xs sm:text-sm leading-relaxed text-cream/70 border-t border-white/5 pt-4">
                                        {item.body}
                                    </p>
                                </details>
                            ))}
                        </section>
                    ) : kind === 'contact' ? (
                        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
                            <form onSubmit={handleContactSubmit} className="glass-panel rounded-3xl p-6 sm:p-8 space-y-4">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
                                    Direct WhatsApp Support
                                </span>
                                <h2 className="font-display text-2xl sm:text-3xl font-semibold">Message Store Concierge</h2>
                                {contactSent && (
                                    <p className="glass-panel rounded-xl border-emerald-500/30 p-3 text-xs text-emerald-200" role="status">
                                        Opening WhatsApp with your formatted message…
                                    </p>
                                )}
                                <label className="block">
                                    <span className="mb-1.5 block text-xs text-cream/70 font-medium">Your Name</span>
                                    <input type="text" value={contactForm.name} onChange={(event) => setContactForm({ ...contactForm, name: event.target.value })} required className="field h-12 w-full rounded-xl text-sm border-white/10 bg-white/5" />
                                </label>
                                <label className="block">
                                    <span className="mb-1.5 block text-xs text-cream/70 font-medium">Contact Phone Number</span>
                                    <input type="tel" value={contactForm.phone} onChange={(event) => setContactForm({ ...contactForm, phone: event.target.value })} autoComplete="tel" required className="field h-12 w-full rounded-xl text-sm border-white/10 bg-white/5" />
                                </label>
                                <label className="block">
                                    <span className="mb-1.5 block text-xs text-cream/70 font-medium">Order Reference (Optional)</span>
                                    <input type="text" value={contactForm.orderRef} onChange={(event) => setContactForm({ ...contactForm, orderRef: event.target.value })} className="field h-12 w-full rounded-xl text-sm border-white/10 bg-white/5" placeholder="e.g. GHC-2026-..." />
                                </label>
                                <label className="block">
                                    <span className="mb-1.5 block text-xs text-cream/70 font-medium">Message or Product Query</span>
                                    <textarea rows={4} value={contactForm.message} onChange={(event) => setContactForm({ ...contactForm, message: event.target.value })} required className="field w-full rounded-xl p-3 text-sm border-white/10 bg-white/5" placeholder="Tell us what dinner set or kitchenware item you need..." />
                                </label>
                                <button type="submit" className="button-primary flex h-13 w-full items-center justify-center rounded-2xl text-sm font-semibold shadow-[0_8px_30px_rgba(212,175,55,0.25)]">
                                    Continue to WhatsApp
                                </button>
                            </form>

                            <div className="space-y-4">
                                {page.sections.map((section) => (
                                    <div key={section.title} className="glass-card rounded-2xl p-6 border border-white/5">
                                        <h3 className="font-display text-lg font-semibold text-cream">{section.title}</h3>
                                        <p className="mt-2 text-xs sm:text-sm leading-relaxed text-cream/70">{section.body}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {page.sections.map((section) => (
                                <section key={section.title} className="glass-card rounded-3xl p-6 sm:p-8 border border-white/5">
                                    <h2 className="font-display text-2xl font-semibold text-cream">{section.title}</h2>
                                    {section.table && (
                                        <div className="mt-4 max-w-full overflow-x-auto rounded-xl border border-white/5">
                                            <table className="w-full border-collapse text-left text-xs sm:text-sm">
                                                <thead>
                                                    <tr className="border-b border-white/10 bg-white/5 text-gold-300">
                                                        {section.table.headers.map((header) => <th key={header} scope="col" className="p-3 font-semibold">{header}</th>)}
                                                    </tr>
                                                </thead>
                                                <tbody className="text-cream/70 divide-y divide-white/5">
                                                    {section.table.rows.map((row) => (
                                                        <tr key={row.join('|')} className="hover:bg-white/[0.02]">
                                                            {row.map((cell) => <td key={cell} className="p-3">{cell}</td>)}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                    {section.body && <p className="mt-3 text-xs sm:text-sm leading-relaxed text-cream/70">{section.body}</p>}
                                    {section.list && (
                                        React.createElement(
                                            section.list.ordered ? 'ol' : 'ul',
                                            { className: `mt-3 space-y-2 pl-5 text-xs sm:text-sm leading-relaxed text-cream/70 ${section.list.ordered ? 'list-decimal' : 'list-disc'}` },
                                            section.list.items.map((item) => <li key={item}>{item}</li>),
                                        )
                                    )}
                                    {section.note && (
                                        <div className="mt-4 rounded-xl border-l-2 border-gold-400 bg-gold-400/5 p-4 text-xs sm:text-sm leading-relaxed text-cream/80">
                                            <span className="font-semibold text-gold-300">Important Note:</span> {section.note}
                                        </div>
                                    )}
                                </section>
                            ))}
                        </div>
                    )}
                </div>

                {kind !== 'contact' && (
                    <div className="mt-12 text-center">
                        <Link to="/contact" className="glass-pill inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-xs sm:text-sm font-semibold text-gold-300 hover:text-white transition">
                            Have Questions? Contact Store Concierge →
                        </Link>
                    </div>
                )}
            </main>

            <TrustBadges />
            <StoreFooter />
        </div>
    );
};

export default InfoPage;
