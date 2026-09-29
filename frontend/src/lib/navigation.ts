export const openTrustedUrl = (value: string): boolean => {
    try {
        const url = new URL(value, window.location.origin);
        const localDevelopmentUrl =
            url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
        if (url.protocol !== 'https:' && !localDevelopmentUrl) return false;

        const opened = window.open(url.toString(), '_blank', 'noopener,noreferrer');
        if (opened) opened.opener = null;
        return Boolean(opened);
    } catch {
        return false;
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
