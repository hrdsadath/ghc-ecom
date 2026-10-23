export const SEARCH_PAGE_SIZE = 24;

export const positivePage = (value: string | null | undefined) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
};

/** The listing request for a /search URL; the server page and the client view share it so prefetched data matches. */
export const searchRequestParams = (query: string, category: string, page: number) => {
    const params = new URLSearchParams({ page: String(page), limit: String(SEARCH_PAGE_SIZE) });
    if (query) params.set('q', query);
    if (category) params.set('category', category);
    return params;
};
