// GET /api/agents — Live agent status from Supabase
import { requireAuth } from './_auth.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  try {
    const r = await fetch(`${SB_URL}/rest/v1/agent_status?select=*&order=id`, {
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
      },
    });

    if (!r.ok) {
      return res.status(500).json({ error: 'Supabase fetch failed' });
    }

    const rows = await r.json();

    // Normalize DB column names to camelCase to match what the frontend expects
    const agents = rows.map(r => ({
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      role: r.role,
      channel: r.channel,
      capabilities: r.capabilities || [],
      model: r.model,
      status: r.status,
      gatewayUp: r.gateway_up,
      lastActiveMs: r.last_active_ms,
      lastActiveAgo: r.last_active_ago,
      updatedAt: r.updated_at,
    }));

    // Derive gatewayStatus from any agent's gateway_status field
    const gatewayStatus = rows[0]?.gateway_status ?? 'unknown';

    res.json({ agents, gatewayStatus, ts: Date.now() });
  } catch (err) {
    console.error('[agents] Request failed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
