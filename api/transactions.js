// api/transactions.js — Transaction coding (Supabase backend)
import { requireAuth } from './_auth.js';

const PROJECT = 'evfgrjslfrjwyopyzqzx';
const SB_BASE = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!requireAuth(req, res)) return;

  try {
    // ── GET ──────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { status, limit, resource } = req.query;

      // Resource: jobs list
      if (resource === 'jobs') {
        const rows = await sql(
          `SELECT id, name, status FROM jobs ORDER BY name`
        );
        return res.json({ jobs: rows });
      }

      // Resource: cost codes list
      if (resource === 'cost_codes') {
        const rows = await sql(
          `SELECT id, number, name, category FROM cost_codes ORDER BY CAST(number AS INTEGER)`
        );
        return res.json({ cost_codes: rows });
      }

      // List transactions
      const wheres = [];
      if (status && status !== 'all') {
        wheres.push(`t.status = ${esc(status)}`);
      }

      const whereClause = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';
      const lim = parseInt(limit) || 200;
      const limitClause = status === 'all' ? `LIMIT 500` : `LIMIT ${lim}`;

      const rows = await sql(`
        SELECT
          t.id, t.date, t.amount, t.description, t.merchant,
          t.account_name, t.account_id, t.category, t.status,
          t.job_id, t.cost_code_id, t.notes, t.plaid_transaction_id,
          t.created_at, t.updated_at,
          j.name  AS job_name,
          cc.name AS cost_code_name,
          cc.number AS cost_code_number
        FROM transactions t
        LEFT JOIN jobs j ON t.job_id = j.id
        LEFT JOIN cost_codes cc ON t.cost_code_id = cc.id
        ${whereClause}
        ORDER BY t.date DESC, t.created_at DESC
        ${limitClause}
      `);

      // Always return uncoded count for the badge
      const countRows = await sql(
        `SELECT COUNT(*) AS total FROM transactions WHERE status = 'uncoded'`
      );
      const uncodedCount = parseInt(countRows[0]?.total || 0);

      return res.json({
        transactions: rows,
        uncoded_count: uncodedCount,
        total: rows.length,
      });
    }

    // ── PATCH ─────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });

      const b = req.body || {};
      const allowed = ['job_id', 'cost_code_id', 'status', 'notes'];
      const updates = [];

      allowed.forEach(k => {
        if (b[k] !== undefined) {
          // Allow clearing FK fields with empty string → NULL
          if ((k === 'job_id' || k === 'cost_code_id') && (b[k] === '' || b[k] === null)) {
            updates.push(`${k} = NULL`);
          } else {
            updates.push(`${k} = ${esc(b[k])}`);
          }
        }
      });

      if (!updates.length) return res.status(400).json({ error: 'nothing to update' });
      updates.push(`updated_at = NOW()`);

      const rows = await sql(
        `UPDATE transactions SET ${updates.join(', ')} WHERE id = ${esc(id)} RETURNING *`
      );

      // Return updated uncoded count
      const countRows = await sql(
        `SELECT COUNT(*) AS total FROM transactions WHERE status = 'uncoded'`
      );
      const uncodedCount = parseInt(countRows[0]?.total || 0);

      return res.json({ ok: true, transaction: rows[0], uncoded_count: uncodedCount });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('transactions API error:', err);
    res.status(500).json({ error: err.message });
  }
}
