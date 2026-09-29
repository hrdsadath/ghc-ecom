import React from 'react';
import { usePath } from '../lib/router';
import { IconMessageCircle, IconPhone } from './Icons';

const FloatingContactButtons = () => {
    const pathname = usePath();
    if (pathname === '/admin' || pathname.startsWith('/admin/')) return null;

    return (
      <div className="fixed bottom-5 right-4 z-40 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6" aria-label="Contact Glockery Home Centre">
        <a
            className="group flex min-h-12 items-center gap-2 rounded-full bg-[#25D366] px-4 text-sm font-semibold text-[#062b15] shadow-[0_8px_28px_rgba(37,211,102,0.3)] hover:bg-[#42e27d] hover:shadow-[0_10px_32px_rgba(37,211,102,0.4)]"
            href="https://wa.me/916282000289?text=Hi%20Glockery%20Home%20Centre%2C%20I%20need%20help."
            target="_blank"
            rel="noreferrer"
            aria-label="Chat with Glockery Home Centre on WhatsApp"
        >
            <IconMessageCircle size={21} color="currentColor" aria-hidden="true" />
            <span>WhatsApp</span>
        </a>
        <a
            className="group flex min-h-12 items-center gap-2 rounded-full bg-gold-400 px-4 text-sm font-semibold text-obsidian shadow-[0_8px_28px_rgba(201,163,91,0.3)] hover:bg-gold-300 hover:shadow-[0_10px_32px_rgba(201,163,91,0.4)]"
            href="tel:+918138003232"
            aria-label="Call Glockery Home Centre"
        >
            <IconPhone size={20} color="currentColor" aria-hidden="true" />
            <span>Call us</span>
        </a>
      </div>
    );
};

export default FloatingContactButtons;
