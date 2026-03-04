// /api/_auth.js — Shared auth & middleware helpers
// Files prefixed with _ are NOT treated as Vercel serverless routes.
// Import this from any route that needs auth or middleware.

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

/**
 * Sets up CORS headers and handles OPTIONS requests.
 * Standardized across all API routes.
 * @param {object} req - Incoming request
 * @param {object} res - Response object
 * @param {string|string[]} methods - Allowed HTTP methods (default: 'GET, POST, PATCH, DELETE, OPTIONS')
 * @returns {boolean} true if request should continue, false if OPTIONS was handled
 */
export function corsMiddleware(req, res, methods = 'GET, POST, PATCH, DELETE, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return false;
  }
  return true;
}
