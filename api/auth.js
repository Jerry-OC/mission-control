export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ ok: false, error: 'Invalid JSON' });
  }

  const { code } = body;
  if (!code) return res.status(400).json({ ok: false, error: 'Code required' });

  const allowed = (process.env.ALLOWED_USERS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(code)) {
    return res.status(401).json({ ok: false, error: 'Access denied' });
  }

  // Token = base64(code:SECRET) — lightweight, stateless
  const secret = process.env.SESSION_SECRET || 'dev-secret';
  const token = Buffer.from(`${code}:${secret}`).toString('base64');
  return res.json({ ok: true, token });
}
