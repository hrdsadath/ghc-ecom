/**
 * Seller details printed on invoices. Defaults match the storefront constants
 * (frontend/src/lib/site.ts STORE); each can be overridden with an env var.
 */
export interface StoreDetails {
  name: string;
  addressLines: string[];
  phone: string;
  email?: string;
}

const emailAddress = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  // EMAIL_FROM may be "Name <address>".
  const match = /<([^>]+)>/.exec(value);
  const address = (match?.[1] ?? value).trim();
  return address.includes('@') ? address : undefined;
};

export const storeDetails = (env: NodeJS.ProcessEnv = process.env): StoreDetails => ({
  name: env.STORE_NAME?.trim() || 'Glockery Home Centre',
  addressLines: env.STORE_ADDRESS?.trim()
    ? env.STORE_ADDRESS.split('|')
        .map((line) => line.trim())
        .filter(Boolean)
    : ['Home Centre, Near ICICI Bank', 'Vengara, Malappuram, Kerala 676304', 'India'],
  phone: env.STORE_PHONE?.trim() || '+91 8138003232',
  email: emailAddress(env.STORE_EMAIL?.trim()) ?? emailAddress(env.EMAIL_FROM),
});
