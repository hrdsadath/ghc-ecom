import type { MetadataRoute } from 'next';
import { PRIVATE_PATHS, SITE_URL, absoluteUrl } from '../lib/site';

// Answer engines and AI assistants that cite sources. They are welcomed explicitly so
// the store can be quoted in AI answers; each needs its own group because a crawler
// that matches a named group ignores the `*` rules.
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'DuckAssistBot',
  'Meta-ExternalAgent',
  'MistralAI-User',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
      { userAgent: AI_CRAWLERS, allow: '/', disallow: PRIVATE_PATHS },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: SITE_URL,
  };
}
