// POST /api/agents/[id]/cron/run
// Body: { jobId: "..." }
// Triggers a gateway cron job via local gateway API.
import { requireAuth } from '../../../_auth.js';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://127.0.0.1:18900';

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  const { jobId } = req.body || {};

  if (!id)    return res.status(400).json({ error: 'Missing agent id' });
  if (!jobId) return res.status(400).json({ error: 'Missing jobId in body' });

  try {
    const r = await fetch(`${GATEWAY_URL}/api/cron/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jobId, agentId: id }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return res.status(502).json({ error: 'Gateway request failed', detail, status: r.status });
    }

    const data = await r.json().catch(() => ({}));
    return res.json({ ok: true, data, agentId: id, jobId });
  } catch (err) {
    console.error('[cron/run] Gateway request failed:', err.message);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
