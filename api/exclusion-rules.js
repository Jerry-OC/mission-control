// api/exclusion-rules.js — Exclusion rules CRUD + bulk-apply
import { requireAuth } from './_auth.js';

const PROJECT = 'evfgrjslfrjwyopyzqzx';
const SB_BASE = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function sql(query) {
  const res = await fetch(SB_BASE, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_MGMT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (data.error || data.message) throw new Error(data.error?.message || data.message);
  return Array.isArray(data) ? data : [];
}

// Apply all exclusion rules to uncoded transactions, return count affected
async function applyRules() {
  const rules = await sql(`SELECT pattern_type, pattern_value FROM exclusion_rules`);
  if (!rules.length) return 0;

  const conditions = rules.map(r => {
    if (r.pattern_type === 'merchant') {
      return `lower(coalesce(merchant, '')) = lower(${esc(r.pattern_value)})`;
    }
    if (r.pattern_type === 'description_contains') {
      return `lower(coalesce(description, '')) LIKE lower(${esc('%' + r.pattern_value + '%')})`;
    }
    if (r.pattern_type === 'account') {
      return `lower(coalesce(account_name, '')) = lower(${esc(r.pattern_value)})`;
    }
    return null;
  }).filter(Boolean);

  if (!conditions.length) return 0;

  const result = await sql(`
    UPDATE transactions
    SET status = 'excluded', updated_at = NOW()
    WHERE status = 'uncoded'
    AND (${conditions.join(' OR ')})
    RETURNING id
  `);
  return result.length;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    // GET — list all rules
    if (req.method === 'GET') {
      const rows = await sql(`SELECT * FROM exclusion_rules ORDER BY created_at DESC`);
      return res.json({ rules: rows });
    }

    // POST — create rule (and optionally bulk-apply)
    if (req.method === 'POST') {
      const { pattern_type, pattern_value, label, apply_now } = req.body || {};
      if (!pattern_type || !pattern_value) {
        return res.status(400).json({ error: 'pattern_type and pattern_value required' });
      }

      const rows = await sql(`
        INSERT INTO exclusion_rules (pattern_type, pattern_value, label)
        VALUES (${esc(pattern_type)}, ${esc(pattern_value)}, ${esc(label || null)})
        ON CONFLICT (pattern_type, lower(pattern_value)) DO UPDATE
          SET label = EXCLUDED.label, created_at = NOW()
        RETURNING *
      `);

      let applied = 0;
      if (apply_now !== false) {
        applied = await applyRules();
      }

      return res.json({ ok: true, rule: rows[0], applied });
    }

    // DELETE — remove a rule by id
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await sql(`DELETE FROM exclusion_rules WHERE id = ${esc(id)}`);
      return res.json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('exclusion-rules error:', err);
    res.status(500).json({ error: err.message });
  }
}
