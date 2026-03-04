// /api/_sb.js — Shared Supabase REST API utilities
// Files prefixed with _ are NOT treated as Vercel serverless routes.
// Import this from routes that need Supabase access.

export const SB_URL = (process.env.SUPABASE_URL || '').trim();
export const SB_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();

/**
 * Helper to construct Supabase REST API headers
 * @param {object} extra - Additional headers to merge in
 * @returns {object} Headers object ready for fetch
 */
export function sbHeaders(extra = {}) {
  return {
    'apikey':        SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
    'Content-Type':  'application/json',
    ...extra,
  };
}

/**
 * Fetch from Supabase REST API with automatic error handling and JSON parsing
 * @param {string} path - API path (e.g., '/orders' or '/line_items?order_id=eq.xxx')
 * @param {object} options - Fetch options (method, body, headers, etc.)
 * @returns {Promise} Parsed JSON data
 * @throws {Error} If response is not OK
 */
export async function sbFetch(path, options = {}) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    ...options,
    headers: { ...sbHeaders(), ...(options.headers || {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || data?.error || `Supabase ${res.status}`);
  return data;
}
