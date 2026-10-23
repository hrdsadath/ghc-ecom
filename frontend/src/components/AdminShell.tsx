import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, NavLink } from '../lib/router';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../hooks/useDialog';
import { api } from '../lib/api';
import { ADMIN_SECTIONS, AdminSection, HealthTone, operationsHealth } from '../lib/admin-routes';
import { AppRole } from '../types';
import {
    IconArrowRight,
    IconClose,
    IconGrid,
    IconLogOut,
    IconMenu,
    IconPackage,
    IconRefresh,
    IconShield,
    IconShoppingBag,
    IconTag,
    IconUser,
} from './Icons';

interface AdminShellProps {
    title: string;
    description: string;
    action?: ReactNode;
    children: ReactNode;
}

type NavigationItem = {
    href: string;
    label: string;
    icon: ReactNode;
    roles: AppRole[];
    exact?: boolean;
    badge?: number | null;
};

const roleLabels: Record<AppRole, string> = {
    ADMIN: 'Administrator',
    CATALOGUE_MANAGER: 'Catalogue manager',
    WAREHOUSE_MANAGER: 'Warehouse manager',
    SUPPORT_AGENT: 'Support agent',
    CUSTOMER: 'Customer',
};

const sectionRoles = (section: AdminSection): AppRole[] =>
    [...(ADMIN_SECTIONS.find((entry) => entry.section === section)?.roles ?? ['ADMIN'])];

type Connection = { tone: HealthTone | 'checking'; label: string };

const AdminShell: React.FC<AdminShellProps> = ({ title, description, action, children }) => {
    const { session, signOut } = useAuth();
    const user = session?.user;
    const roles = session?.roles || [];
    const hasRole = (...allowed: AppRole[]) => allowed.some((role) => roles.includes(role));
    const [mobileOpen, setMobileOpen] = useState(false);
    const [lowStockCount, setLowStockCount] = useState<number | null>(null);
    const isAdmin = hasRole('ADMIN');
    // System health is an admin-only signal; other roles see no status rather than an unchecked claim.
    const [connection, setConnection] = useState<Connection | null>(isAdmin ? { tone: 'checking', label: 'Checking systems' } : null);
    const mobileNavRef = useDialog<HTMLDivElement>(mobileOpen, () => setMobileOpen(false));

    useEffect(() => {
        document.title = `${title} | Glockery Admin`;
    }, [title]);

    useEffect(() => {
        if (!isAdmin) {
            setConnection(null);
            return;
        }
        let active = true;
        // api.operations() is shared and cached for 30 s, so moving between sections does not re-query.
        api.operations()
            .then((snapshot) => {
                if (!active) return;
                setConnection(operationsHealth(snapshot));
                if (typeof snapshot?.lowStockSkus === 'number' && snapshot.lowStockSkus >= 0) setLowStockCount(snapshot.lowStockSkus);
            })
            .catch(() => {
                if (active) setConnection({ tone: 'critical', label: 'Health check unavailable' });
            });
        return () => {
            active = false;
        };
    }, [isAdmin]);

    const navGroups = useMemo(() => {
        const workspace: NavigationItem[] = [
            { href: '/admin', label: 'Overview', icon: <IconGrid size={18} />, exact: true, roles: sectionRoles('overview') },
            { href: '/admin/orders', label: 'Orders', icon: <IconShoppingBag size={18} />, roles: sectionRoles('orders') },
        ];
        const commerce: NavigationItem[] = [
            { href: '/admin/catalogue', label: 'Catalogue', icon: <IconPackage size={18} />, roles: sectionRoles('catalogue') },
            { href: '/admin/inventory', label: 'Inventory', icon: <IconRefresh size={18} />, badge: lowStockCount, roles: sectionRoles('inventory') },
            { href: '/admin/promotions', label: 'Promotions', icon: <IconTag size={18} />, roles: sectionRoles('promotions') },
        ];
        const control: NavigationItem[] = [
            { href: '/admin/users', label: 'Team & roles', icon: <IconUser size={18} />, roles: sectionRoles('users') },
            { href: '/admin/audit-logs', label: 'Activity log', icon: <IconShield size={18} />, roles: sectionRoles('audit-logs') },
            { href: '/admin/operations', label: 'System health', icon: <IconGrid size={18} />, roles: sectionRoles('operations') },
        ];
        const permitted = (items: NavigationItem[]) => items.filter((item) => hasRole(...item.roles));
        return [
            { label: 'Workspace', items: permitted(workspace) },
            { label: 'Commerce', items: permitted(commerce) },
            { label: 'Control', items: permitted(control) },
        ].filter((group) => group.items.length);
    }, [lowStockCount, roles.join('|')]);

    const primaryRole = roles.find((role) => role !== 'CUSTOMER');
    const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Team member';
    const initials = userName.slice(0, 2).toUpperCase();
    const connectionDot = !connection
        ? ''
        : connection.tone === 'ok'
            ? 'bg-emerald-500'
            : connection.tone === 'checking'
                ? 'animate-pulse bg-amber-400'
                : connection.tone === 'warning'
                    ? 'bg-amber-500'
                    : 'bg-red-500';

    const sidebar = (
        <aside className="admin-nav flex h-full flex-col px-4 pb-4 pt-5 text-white">
            <div className="flex h-14 items-center justify-between px-2">
                <Link to="/admin" className="group flex items-center gap-3" aria-label="Glockery admin overview">
                    <span className="grid size-10 place-items-center rounded-xl bg-[#f0b44d] text-base font-extrabold text-[#1d211f] shadow-[0_8px_24px_rgba(240,180,77,0.18)] transition-transform group-hover:-rotate-3">G</span>
                    <span>
                        <span className="block text-sm font-extrabold tracking-[0.14em] text-white">GLOCKERY</span>
                        <small className="block text-[10px] font-medium tracking-wide text-white/45">Operations desk</small>
                    </span>
                </Link>
                <button onClick={() => setMobileOpen(false)} className="grid size-11 place-items-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white lg:hidden" aria-label="Close navigation">
                    <IconClose size={20} />
                </button>
            </div>

            <nav className="mt-7 space-y-6" aria-label="Admin navigation">
                {navGroups.map((group) => (
                    <section key={group.label} aria-labelledby={`admin-nav-${group.label.toLowerCase()}`}>
                        <h2 id={`admin-nav-${group.label.toLowerCase()}`} className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">{group.label}</h2>
                        <div className="space-y-1">
                            {group.items.map((item) => (
                                <NavLink
                                    key={item.href}
                                    exact={item.exact}
                                    to={item.href}
                                    onClick={() => setMobileOpen(false)}
                                    activeClassName="admin-nav-active"
                                    className="admin-nav-link flex min-h-11 items-center justify-between rounded-xl px-3 text-sm font-medium text-white/58"
                                >
                                    <span className="flex items-center gap-3"><span className="admin-nav-icon">{item.icon}</span>{item.label}</span>
                                    {typeof item.badge === 'number' && item.badge > 0 && (
                                        <span className="min-w-6 rounded-md bg-[#f0b44d] px-1.5 py-0.5 text-center text-[10px] font-bold tabular-nums text-[#1d211f]">{item.badge}</span>
                                    )}
                                </NavLink>
                            ))}
                        </div>
                    </section>
                ))}
            </nav>

            <div className="mt-auto pt-6">
                <div className="rounded-2xl border border-white/8 bg-white/[0.045] p-3">
                    <div className="flex items-center gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-xs font-bold text-[#f6cf86]">{initials}</span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-white">{userName}</p>
                            <p className="truncate text-[10px] text-white/40">{primaryRole ? roleLabels[primaryRole] : 'Staff account'}</p>
                        </div>
                        <button onClick={() => void signOut()} className="grid size-9 place-items-center rounded-lg text-white/45 hover:bg-red-400/10 hover:text-red-200" aria-label="Sign out" title="Sign out">
                            <IconLogOut size={17} />
                        </button>
                    </div>
                </div>
            </div>
        </aside>
    );

    return (
        <div className="admin-workspace min-h-screen bg-[#f5f3ed] font-body text-[#242722]">
            <a href="#admin-main" className="admin-skip-link">Skip to admin content</a>
            <div className="admin-desktop-nav hidden bg-[#1d211f] lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block lg:w-[264px]">{sidebar}</div>

            {mobileOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <button className="absolute inset-0 bg-[#111512]/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" />
                    <div ref={mobileNavRef} tabIndex={-1} className="absolute inset-y-0 left-0 w-[min(86vw,320px)] bg-[#1d211f] outline-none animate-admin-drawer" role="dialog" aria-modal="true" aria-label="Admin navigation">{sidebar}</div>
                </div>
            )}

            <div className="admin-workspace-main min-w-0 lg:ml-[264px]">
                <header className="sticky top-0 z-30 flex min-h-[64px] items-center justify-between gap-2 border-b border-[#dedbd2] bg-[#f9f8f4]/90 px-3 py-2 backdrop-blur-xl sm:h-[68px] sm:px-7 sm:py-0 lg:px-10">
                    <div className="flex min-w-0 items-center gap-3">
                        <button onClick={() => setMobileOpen(true)} className="grid size-11 shrink-0 place-items-center rounded-xl text-[#343934] hover:bg-[#e9e6de] lg:hidden" aria-label="Open navigation">
                            <IconMenu size={21} />
                        </button>
                        {connection && (
                            <Link to="/admin/operations" className="hidden min-h-11 items-center gap-2 rounded-lg px-1 hover:text-[#222622] sm:flex" title="Open system health">
                                <span className={`size-2 rounded-full ${connectionDot}`} aria-hidden="true" />
                                <span className="text-xs font-medium text-[#696e67]" role="status">{connection.label}</span>
                            </Link>
                        )}
                        <span className="truncate text-sm font-semibold text-[#343934] sm:hidden">{title}</span>
                    </div>
                    <Link to="/" className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-[#636860] hover:bg-[#e9e6de] hover:text-[#222622]">
                        <span className="hidden sm:inline">Open storefront</span><span className="sm:hidden">Store</span><IconArrowRight size={15} />
                    </Link>
                </header>

                <main id="admin-main" className="admin-content mx-auto w-full max-w-[1540px] px-3 pb-10 pt-5 min-[380px]:px-4 sm:px-7 sm:pt-7 lg:px-10 lg:pb-16 lg:pt-10">
                    <header className="mb-6 flex flex-col gap-4 sm:mb-8 md:flex-row md:items-end md:justify-between md:gap-5">
                        <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#9b671d]">Workspace <span className="mx-1.5 text-[#b9b6ad]">/</span> {title}</p>
                            <h1 className="mt-2 text-[1.75rem] font-bold leading-tight tracking-[-0.035em] text-[#20241f] sm:text-[2.5rem]">{title}</h1>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#696e67]">{description}</p>
                        </div>
                        {action && <div className="admin-page-actions w-full shrink-0 md:w-auto">{action}</div>}
                    </header>
                    {children}
                </main>
            </div>
        </div>
    );
};

export default AdminShell;
