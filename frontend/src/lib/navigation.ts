/** The URL as a string if it is HTTPS (or local-development HTTP), otherwise null. */
export const trustedUrl = (value: string): string | null => {
    try {
        const url = new URL(value, window.location.origin);
        const localDevelopmentUrl =
            url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
        if (url.protocol !== 'https:' && !localDevelopmentUrl) return null;
        return url.toString();
    } catch {
        return null;
    }
};

/**
 * Opens a trusted URL in a new tab. The result reflects validation only:
 * `window.open` with `noopener` always returns null, so it cannot report
 * whether a popup blocker stopped the tab.
 */
export const openTrustedUrl = (value: string): boolean => {
    const url = trustedUrl(value);
    if (!url) return false;
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
};

/**
 * For a URL that must be fetched first (signed invoice links): call this
 * directly from the click handler. A blank tab is opened synchronously, while
 * the click still counts as a user gesture, and is pointed at the URL once it
 * arrives — so popup blockers do not stop it after the `await`. The tab is
 * closed again if the URL cannot be fetched or is not trusted.
 */
export const openTrustedUrlFrom = async (resolveUrl: () => Promise<string | null | undefined>): Promise<void> => {
    const tab = window.open('', '_blank');
    if (tab) {
        try {
            tab.opener = null;
        } catch {
            // Some browsers make `opener` read-only; the tab is still ours to navigate.
        }
    }
    try {
        const value = await resolveUrl();
        const url = value ? trustedUrl(value) : null;
        if (!url) throw new Error('The download link was rejected.');
        if (tab && !tab.closed) {
            tab.location.replace(url);
        } else {
            // The blank tab was blocked or closed; try a plain new tab instead.
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    } catch (error) {
        tab?.close();
        throw error;
    }
};

export const safeInternalPath = (value: string | null, fallback: string): string => {
    if (
        !value ||
        !value.startsWith('/') ||
        value.startsWith('//') ||
        value.includes('\\') ||
        /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)
    ) {
        return fallback;
    }
    try {
        const base = new URL('https://internal.invalid');
        const resolved = new URL(value, base);
        if (resolved.origin !== base.origin || resolved.username || resolved.password) return fallback;
        return `${resolved.pathname}${resolved.search}${resolved.hash}`;
    } catch {
        return fallback;
    }
};
