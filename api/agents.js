// GET /api/agents — Live agent status from Supabase
import { requireAuth } from './_auth.js';
import { sbFetch } from './_sb.js';

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  try {
    const rows = await sbFetch('/agent_status?select=*&order=id');

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
