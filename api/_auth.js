// /api/_auth.js — Shared auth validation helper
// Files prefixed with _ are NOT treated as Vercel serverless routes.
// Import this from any route that needs auth.

/**
 * Validates the Bearer token in an incoming request's Authorization header.
 * Token format: base64(code:SESSION_SECRET) — as issued by /api/auth
 *
 * @param {object} req - Vercel/Node IncomingMessage with headers
 * @returns {boolean} true if valid, false otherwise
 */
export function validateAuth(req) {
  const header = (req.headers?.authorization || '').trim();
  if (!header.startsWith('Bearer ')) return false;

  const token = header.slice(7).trim();
  if (!token) return false;

  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    // Split on first colon only — code never contains colons, but secret might
    const idx = decoded.indexOf(':');
    if (idx === -1) return false;
    const code   = decoded.slice(0, idx);
    const secret = decoded.slice(idx + 1);

    const expectedSecret = process.env.SESSION_SECRET || 'dev-secret';
    const allowed = (process.env.ALLOWED_USERS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    return allowed.includes(code) && secret === expectedSecret;
  } catch {
    return false;
  }
}

/**
 * Sends a 401 response and returns false.
 * Usage: if (!requireAuth(req, res)) return;
 */
export function requireAuth(req, res) {
  if (validateAuth(req)) return true;
  res.status(401).json({ error: 'Unauthorized' });
  return false;
}
