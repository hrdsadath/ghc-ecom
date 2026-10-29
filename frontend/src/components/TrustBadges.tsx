import React from 'react';
import { IconAward, IconCheckCircle, IconShieldCheck } from './Icons';

const TrustBadges = () => (
    <section className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8 lg:px-12" aria-label="Shopping assurances">
        <div className="grid gap-4 sm:grid-cols-3 sm:gap-6">
            {[
                {
                    icon: <IconAward size={22} className="text-gold-300" />,
                    title: 'Artisanal & Kitchenware',
                    copy: 'Fine bone china, porcelain dinner sets, canisters & decorative servers.',
                },
                {
                    icon: <IconCheckCircle size={22} className="text-gold-300" />,
                    title: 'Safe Transit Packaging',
                    copy: 'Multi-layer bubble wrap & shock-absorbent cushioning for zero breakage.',
                },
                {
                    icon: <IconShieldCheck size={22} className="text-gold-300" />,
                    title: 'Verified Secure Checkout',
                    copy: '100% encrypted, direct payment gateway backed by HDFC Bank.',
                },
            ].map(({ icon, title, copy }, index) => (
                <article
                    key={index}
                    className="glass-card group relative flex items-start gap-4 rounded-2xl p-5 sm:p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold-400/40 hover:shadow-[0_12px_30px_rgba(212,175,55,0.12)]"
                >
                    <div className="glass-pill grid size-12 shrink-0 place-items-center rounded-xl border-gold-400/30 bg-gold-400/10 shadow-[0_0_15px_rgba(212,175,55,0.15)] group-hover:scale-105 group-hover:border-gold-400/60 transition-transform">
                        {icon}
                    </div>
                    <div>
                        <h3 className="font-display text-sm font-semibold tracking-wide text-cream/95">
                            {title}
                        </h3>
                        <p className="mt-1.5 text-xs leading-relaxed text-cream/60">
                            {copy}
                        </p>
                    </div>
                </article>
            ))}
        </div>
    </section>
);

export default TrustBadges;
