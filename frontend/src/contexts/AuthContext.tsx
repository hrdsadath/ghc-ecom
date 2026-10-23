import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, getSession, getSessionCheckError } from '../lib/api';
import { AppRole, Session } from '../types';

export const STAFF_ROLES: AppRole[] = ['ADMIN', 'CATALOGUE_MANAGER', 'WAREHOUSE_MANAGER', 'SUPPORT_AGENT'];

export const isStaffSession = (session: Session | null) =>
    Boolean(session?.roles.some((role) => STAFF_ROLES.includes(role)));

interface AuthContextValue {
    session: Session | null;
    signedIn: boolean;
    /** Staff accounts sign in to the admin workspace only; the storefront never treats them as customers. */
    isStaff: boolean;
    isInitializing: boolean;
    /** Set when the backend could not be reached to check the session: the user may still be signed in. */
    sessionError: string | null;
    retrySession: () => Promise<void>;
    sync: () => void;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [session, setSession] = useState(getSession);
    const [sessionError, setSessionError] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    const sync = useCallback(() => {
        setSession(getSession());
        setSessionError(getSessionCheckError()?.message ?? null);
    }, []);

    const retrySession = useCallback(async () => {
        await api.initializeSession();
        sync();
    }, [sync]);

    useEffect(() => {
        let active = true;
        // A 403 "Insufficient permissions" means a role changed while the workspace was open.
        const recheck = () => void api.initializeSession();
        window.addEventListener('ghc:session', sync);
        window.addEventListener('ghc:permissions-changed', recheck);
        void api.initializeSession().finally(() => {
            if (active) {
                sync();
                setReady(true);
            }
        });
        return () => {
            active = false;
            window.removeEventListener('ghc:session', sync);
            window.removeEventListener('ghc:permissions-changed', recheck);
        };
    }, [sync]);

    return (
        <AuthContext.Provider value={{
            session,
            signedIn: Boolean(session),
            isStaff: isStaffSession(session),
            isInitializing: !ready,
            sessionError,
            retrySession,
            sync,
            signOut: async () => { await api.logout(); sync(); },
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const value = useContext(AuthContext);
    if (!value) throw new Error('useAuth must be used inside AuthProvider');
    return value;
};
