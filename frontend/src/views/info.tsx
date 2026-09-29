'use client';

import React, { useState } from 'react';
import { Link } from '../lib/router';
import Header from '../components/Header';
import StoreFooter from '../components/StoreFooter';
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
        { id: 'about', label: 'About', href: '/about' },
        { id: 'shipping', label: 'Orders & returns', href: '/shipping-returns' },
        { id: 'faq', label: 'FAQ', href: '/faq' },
        { id: 'contact', label: 'Contact', href: '/contact' },
        { id: 'privacy', label: 'Privacy', href: '/privacy' },
        { id: 'terms', label: 'Terms', href: '/terms' },
    ];

    return (
        <div className="flex min-h-screen flex-col bg-obsidian font-body text-cream">
            <Header />

            <main id="main-content" className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 sm:px-8 lg:py-16">
                <nav className="flex gap-6 overflow-x-auto border-b border-line" aria-label="Information pages">
                    {tabs.map((tab) => (
                        <Link key={tab.id} to={tab.href} className={`min-h-11 shrink-0 border-b py-3 text-sm ${kind === tab.id ? 'border-gold-400 text-cream' : 'border-transparent text-cream/60 hover:text-cream'}`}>
                            {tab.label}
                        </Link>
                    ))}
                </nav>

                <header className="py-12 sm:py-16">
                    <p className="text-sm text-cream/60">{page.eyebrow}</p>
                    <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-tight tracking-[-0.02em] sm:text-6xl">{page.title}</h1>
                    <p className="mt-5 max-w-2xl text-base leading-7 text-cream/70">{page.intro}</p>
                </header>

                {kind === 'faq' ? (
                    <section className="divide-y divide-line border-y border-line">
                        {page.sections.map((item, index) => (
                            <details key={item.title} className="group" open={index === 0}>
                                <summary className="flex min-h-16 cursor-pointer items-center justify-between py-4 text-base font-semibold text-cream marker:hidden">
                                    {item.title}<span className="ml-4 text-xl font-normal text-cream/50 group-open:rotate-45">+</span>
                                </summary>
                                <p className="max-w-2xl pb-6 text-sm leading-7 text-cream/70">{item.body}</p>
                            </details>
                        ))}
                    </section>
                ) : kind === 'contact' ? (
                    <div className="grid gap-12 lg:grid-cols-[1fr_0.7fr]">
                        <form onSubmit={handleContactSubmit} className="space-y-5">
                            <h2 className="font-display text-3xl font-semibold">Message us on WhatsApp</h2>
                            {contactSent && <p className="border border-line p-3 text-sm" role="status">Opening WhatsApp with your message.</p>}
                            <label className="block"><span className="mb-2 block text-sm">Name</span><input type="text" value={contactForm.name} onChange={(event) => setContactForm({ ...contactForm, name: event.target.value })} required className="field w-full text-sm" /></label>
                            <label className="block"><span className="mb-2 block text-sm">Phone number</span><input type="tel" value={contactForm.phone} onChange={(event) => setContactForm({ ...contactForm, phone: event.target.value })} autoComplete="tel" required className="field w-full text-sm" /></label>
                            <label className="block"><span className="mb-2 block text-sm">Order number <span className="text-cream/60">(optional)</span></span><input type="text" value={contactForm.orderRef} onChange={(event) => setContactForm({ ...contactForm, orderRef: event.target.value })} className="field w-full text-sm" /></label>
                            <label className="block"><span className="mb-2 block text-sm">Message</span><textarea rows={5} value={contactForm.message} onChange={(event) => setContactForm({ ...contactForm, message: event.target.value })} required className="field w-full text-sm" /></label>
                            <button type="submit" className="button-primary">Continue to WhatsApp</button>
                        </form>
                        <div className="divide-y divide-line border-y border-line">
                            {page.sections.map((section) => (
                                <section key={section.title} className="py-5">
                                    <h2 className="font-semibold text-cream">{section.title}</h2>
                                    <p className="mt-2 text-sm leading-6 text-cream/70">{section.body}</p>
                                </section>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="divide-y divide-line border-y border-line">
                        {page.sections.map((section) => (
                            <section key={section.title} className="py-7">
                                <h2 className="font-display text-2xl font-semibold text-cream">{section.title}</h2>
                                <p className="mt-3 max-w-2xl text-sm leading-7 text-cream/70">{section.body}</p>
                            </section>
                        ))}
                    </div>
                )}

                {kind !== 'contact' && <Link to="/contact" className="mt-10 inline-flex min-h-11 items-center text-sm font-semibold text-gold-300">Need help? Contact us</Link>}
            </main>

            <StoreFooter />
        </div>
    );
};

export default InfoPage;
