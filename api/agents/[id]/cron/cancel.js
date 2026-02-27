// POST /api/agents/[id]/cron/cancel
// Body: { jobId: "..." }
// Soft-disables a gateway cron job by setting enabled=false in gateway_cron_state.
import { requireAuth } from '../../../_auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  const { jobId } = req.body || {};

  if (!id)    return res.status(400).json({ error: 'Missing agent id' });
  if (!jobId) return res.status(400).json({ error: 'Missing jobId in body' });

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/gateway_cron_state?job_id=eq.${encodeURIComponent(jobId)}&agent_id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: {
          apikey:          SUPABASE_KEY,
          Authorization:   `Bearer ${SUPABASE_KEY}`,
          'Content-Type':  'application/json',
          Prefer:          'return=minimal',
        },
        body: JSON.stringify({ enabled: false }),
      }
    );

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return res.status(502).json({ error: 'Supabase update failed', detail });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[cancel] Supabase request failed:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
