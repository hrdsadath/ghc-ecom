import fallbackImageUrl from '../img/canister.webp';

const staticImageUrl = (image: string | { src: string }): string =>
    typeof image === 'string' ? image : image.src;

// Built once: constructing an Intl formatter per call is slow and every price on a page calls it.
const rupeeFormat = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
});
const shortDateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export const rupees = (paise: number) => rupeeFormat.format(paise / 100);

export const shortDate = (value: string) => shortDateFormat.format(new Date(value));

export const titleCase = (value: string) =>
    value.toLowerCase().replace(/(^|_|\s)(\w)/g, (_match, space, letter) => `${space ? ' ' : ''}${letter.toUpperCase()}`);

export const slugify = (value: string) =>
    value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'item';

export const fallbackImage = staticImageUrl(fallbackImageUrl);
