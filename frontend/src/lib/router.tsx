'use client';

import NextLink from 'next/link';
import {
    useParams as useNextParams,
    usePathname,
    useRouter,
    useSearchParams,
} from 'next/navigation';
import React, { ComponentProps, useEffect, useMemo, useState } from 'react';

type LinkProps = Omit<ComponentProps<typeof NextLink>, 'href'> & {
    to: string;
};

export const Link = ({ to, ...props }: LinkProps) => <NextLink href={to} {...props} />;

type NavLinkProps = LinkProps & {
    activeClassName?: string;
    exact?: boolean;
};

export const NavLink = ({
    activeClassName = '',
    className = '',
    exact = false,
    to,
    ...props
}: NavLinkProps) => {
    const pathname = usePathname() || '/';
    const active = exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
    const resolvedClassName = [className, active ? activeClassName : ''].filter(Boolean).join(' ');

    return <NextLink href={to} className={resolvedClassName} {...props} />;
};

export const useHistory = () => {
    const router = useRouter();
    return useMemo(() => ({
        push: (href: string) => router.push(href),
        replace: (href: string) => router.replace(href),
        goBack: () => router.back(),
    }), [router]);
};

// Path-only hook: unlike useLocation it does not read search params, so static pages keep
// their server-rendered HTML instead of bailing out to client-side rendering.
export const usePath = () => usePathname() || '/';

export const useLocation = () => {
    const pathname = usePathname() || '/';
    const searchParams = useSearchParams();
    const [hash, setHash] = useState('');
    const query = searchParams?.toString() || '';

    useEffect(() => {
        const syncHash = () => setHash(window.location.hash);
        syncHash();
        window.addEventListener('hashchange', syncHash);
        return () => window.removeEventListener('hashchange', syncHash);
    }, [pathname, query]);

    return {
        pathname,
        search: query ? `?${query}` : '',
        hash,
    };
};

export const useParams = <T extends Record<string, string | undefined>>() =>
    useNextParams() as T;

export const Redirect = ({ to }: { to: string }) => {
    const router = useRouter();

    useEffect(() => {
        router.replace(to);
    }, [router, to]);

    return null;
};
