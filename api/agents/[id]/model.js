// PATCH /api/agents/[id]/model
// Updates the model for a given agent in Supabase agent_status,
// and queues a pending_model_changes row for the runtime to pick up.

import { requireAuth } from '../../../_auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const ALLOWED_MODELS = [
  'anthropic/claude-sonnet-4-6',
  'anthropic/claude-haiku-4-5',
  'anthropic/claude-opus-4-5',
];

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null };
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing agent id' });

  const { model } = req.body || {};
  if (!model) return res.status(400).json({ error: 'Missing model in body' });
  if (!ALLOWED_MODELS.includes(model)) {
    return res.status(400).json({ error: `Invalid model. Allowed: ${ALLOWED_MODELS.join(', ')}` });
  }

  // 1. Update agent_status
  const update = await sbFetch(
    `/agent_status?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ model, updated_at: new Date().toISOString() }),
    }
  );

  if (!update.ok) {
    console.error('Supabase update failed:', update.body);
    return res.status(502).json({ error: 'Failed to update agent_status', detail: update.body });
  }

  // 2. Queue pending_model_changes (best-effort — table may not exist yet)
  try {
    await sbFetch('/pending_model_changes', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        agent_id: id,
        new_model: model,
        applied: false,
        created_at: new Date().toISOString(),
      }),
    });
  } catch (err) {
    // Non-fatal — table may not exist yet
    console.warn('pending_model_changes insert skipped:', err.message);
  }

  return res.status(200).json({ success: true, agent_id: id, model });
}
