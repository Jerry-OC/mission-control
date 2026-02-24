// api/coding-rules.js — Coding rules CRUD + bulk-apply / reversal
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

/**
 * Build a SQL WHERE condition for one coding rule pattern (transactions table).
 */
function patternCondition(pattern_type, pattern_value) {
  if (pattern_type === 'merchant') {
    return `lower(coalesce(merchant, '')) = lower(${esc(pattern_value)})`;
  }
  if (pattern_type === 'description_contains') {
    return `lower(coalesce(description, '')) LIKE lower(${esc('%' + pattern_value + '%')})`;
  }
  if (pattern_type === 'account') {
    return `lower(coalesce(account_name, '')) = lower(${esc(pattern_value)})`;
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req, res)) return;

  try {
    // ── GET ──────────────────────────────────────────────────
    if (req.method === 'GET') {
      const rows = await sql(`
        SELECT
          cr.id,
          cr.pattern_type,
          cr.pattern_value,
          cr.job_id,
          cr.cost_code_id,
          cr.label,
          cr.match_count,
          cr.created_at,
          j.name  AS job_name,
          cc.name AS cost_code_name,
          cc.number AS cost_code_number
        FROM coding_rules cr
        LEFT JOIN jobs j      ON cr.job_id       = j.id
        LEFT JOIN cost_codes cc ON cr.cost_code_id = cc.id
        ORDER BY cr.created_at DESC
      `);
      return res.json({ rules: rows });
    }

    // ── POST ─────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { pattern_type, pattern_value, job_id, cost_code_id, label, apply_now } = req.body || {};

      if (!pattern_type || !pattern_value) {
        return res.status(400).json({ error: 'pattern_type and pattern_value required' });
      }

      // Upsert the rule
      const rows = await sql(`
        INSERT INTO coding_rules (pattern_type, pattern_value, job_id, cost_code_id, label)
        VALUES (
          ${esc(pattern_type)},
          ${esc(pattern_value)},
          ${job_id ? esc(job_id) : 'NULL'},
          ${cost_code_id ? esc(cost_code_id) : 'NULL'},
          ${esc(label || null)}
        )
        ON CONFLICT (pattern_type, lower(pattern_value)) DO UPDATE
          SET job_id       = EXCLUDED.job_id,
              cost_code_id = EXCLUDED.cost_code_id,
              label        = EXCLUDED.label,
              created_at   = NOW()
        RETURNING *
      `);

      const rule = rows[0];

      let applied = 0;
      if (apply_now) {
        const cond = patternCondition(pattern_type, pattern_value);
        if (cond) {
          const updates = [];
          updates.push(`status = 'coded'`);
          updates.push(`updated_at = NOW()`);
          if (job_id)       updates.push(`job_id = ${esc(job_id)}`);
          if (cost_code_id) updates.push(`cost_code_id = ${esc(cost_code_id)}`);

          const affected = await sql(`
            UPDATE transactions
            SET ${updates.join(', ')}
            WHERE status = 'uncoded'
              AND (${cond})
            RETURNING id
          `);
          applied = affected.length;

          // Increment match_count
          if (applied > 0) {
            await sql(`
              UPDATE coding_rules
              SET match_count = match_count + ${applied}
              WHERE id = ${esc(rule.id)}
            `);
          }
        }
      }

      return res.json({ ok: true, rule, applied });
    }

    // ── DELETE ────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });

      // Fetch the rule first so we know what to reverse
      const rules = await sql(`SELECT * FROM coding_rules WHERE id = ${esc(id)}`);
      if (!rules.length) return res.status(404).json({ error: 'Rule not found' });
      const rule = rules[0];

      // Reverse: coded transactions that match the rule pattern AND same job+cost_code
      const cond = patternCondition(rule.pattern_type, rule.pattern_value);
      let reversed = 0;
      if (cond) {
        const jobMatch       = rule.job_id       ? `job_id = ${esc(rule.job_id)}`       : `job_id IS NULL`;
        const costCodeMatch  = rule.cost_code_id ? `cost_code_id = ${esc(rule.cost_code_id)}` : `cost_code_id IS NULL`;

        const affected = await sql(`
          UPDATE transactions
          SET status       = 'uncoded',
              job_id       = NULL,
              cost_code_id = NULL,
              updated_at   = NOW()
          WHERE status = 'coded'
            AND (${cond})
            AND ${jobMatch}
            AND ${costCodeMatch}
          RETURNING id
        `);
        reversed = affected.length;
      }

      // Delete the rule
      await sql(`DELETE FROM coding_rules WHERE id = ${esc(id)}`);

      return res.json({ ok: true, reversed });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('coding-rules error:', err);
    res.status(500).json({ error: err.message });
  }
}
