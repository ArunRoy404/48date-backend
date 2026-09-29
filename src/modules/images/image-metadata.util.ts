import { env } from '../../config/env.config.js';

/**
 * Builds the public URL for an image key — the one place that knows how a
 * stored key becomes a fetchable URL.
 *
 * R2: the public bucket base (r2.dev or a custom domain) + key.
 * Local fallback: the API's own /uploads mount.
 */
export function buildImageUrl(key: string): string {
  if (env.R2_PUBLIC_URL) {
    return `${env.R2_PUBLIC_URL.replace(/\/+$/, '')}/${key}`;
  }
  const port = env.PORT || 3000;
  return `http://localhost:${port}/uploads/${key}`;
}

/**
 * Inverse of buildImageUrl for matching stored rows: a URL the API itself
 * handed out maps back to its r2Key. Anything else (the seed's CDN URLs,
 * foreign hosts) comes back null — those images have no pipeline row.
 */
export function urlToStorageKey(url: string): string | null {
  if (
    env.R2_PUBLIC_URL &&
    url.startsWith(`${env.R2_PUBLIC_URL.replace(/\/+$/, '')}/`)
  ) {
    return url.slice(env.R2_PUBLIC_URL.replace(/\/+$/, '').length + 1);
  }
  const localPrefix = `http://localhost:${env.PORT || 3000}/uploads/`;
  if (url.startsWith(localPrefix)) {
    return `local/uploads/${url.slice(localPrefix.length)}`;
  }
  return null;
}
