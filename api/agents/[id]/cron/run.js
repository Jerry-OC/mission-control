// POST /api/agents/[id]/cron/run
// Body: { jobId: "..." }
// Triggers a gateway cron job. Currently returns a stub response;
// full gateway trigger can be wired later.
import { requireAuth } from '../../../_auth.js';

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  const { jobId } = req.body || {};

  if (!id)    return res.status(400).json({ error: 'Missing agent id' });
  if (!jobId) return res.status(400).json({ error: 'Missing jobId in body' });

  // TODO: wire to gateway local API (e.g. POST http://127.0.0.1:18900/api/cron/run)
  return res.json({ ok: true, message: 'Trigger not yet wired to gateway', agentId: id, jobId });
}
