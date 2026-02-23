// api/transactions/split.js — Split a transaction into multiple coded children
import { requireAuth } from '../_auth.js';

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!requireAuth(req, res)) return;

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { original_id, splits } = req.body || {};

  // ── Validate input ───────────────────────────────────────
  if (!original_id) {
    return res.status(400).json({ error: 'original_id required' });
  }
  if (!Array.isArray(splits) || splits.length < 2) {
    return res.status(400).json({ error: 'splits must be an array of at least 2 items' });
  }

  for (let i = 0; i < splits.length; i++) {
    const s = splits[i];
    if (!s.job_id)       return res.status(400).json({ error: `Split ${i + 1}: job_id required` });
    if (!s.cost_code_id) return res.status(400).json({ error: `Split ${i + 1}: cost_code_id required` });
    const amt = parseFloat(s.amount);
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ error: `Split ${i + 1}: amount must be a positive number` });
    }
  }

  try {
    // ── Fetch original transaction ───────────────────────────
    const origRows = await sql(`SELECT * FROM transactions WHERE id = ${esc(original_id)}`);
    if (!origRows.length) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const orig = origRows[0];
    const origAmount = parseFloat(orig.amount);

    // ── Validate split amounts sum to original ──────────────
    const splitTotal = splits.reduce((sum, s) => sum + parseFloat(s.amount), 0);
    if (Math.abs(splitTotal - origAmount) > 0.015) {
      return res.status(400).json({
        error: `Split amounts (${splitTotal.toFixed(2)}) must equal original amount (${origAmount.toFixed(2)})`,
      });
    }

    const n = splits.length;

    // ── Mark original as excluded ────────────────────────────
    await sql(`
      UPDATE transactions
      SET status = 'excluded',
          notes  = ${esc(`Split into ${n} parts`)},
          updated_at = NOW()
      WHERE id = ${esc(original_id)}
    `);

    // ── Insert child split records ───────────────────────────
    for (const s of splits) {
      const splitAmt   = parseFloat(s.amount).toFixed(2);
      const splitNotes = s.notes
        ? esc(s.notes)
        : esc(`Split from tx ${original_id}`);

      await sql(`
        INSERT INTO transactions (
          date, description, merchant, account_name, account_id,
          category, amount, status, job_id, cost_code_id, notes
        ) VALUES (
          ${esc(orig.date)},
          ${esc(orig.description)},
          ${esc(orig.merchant)},
          ${esc(orig.account_name)},
          ${esc(orig.account_id)},
          ${esc(orig.category)},
          ${esc(splitAmt)},
          'coded',
          ${esc(s.job_id)},
          ${esc(s.cost_code_id)},
          ${splitNotes}
        )
      `);
    }

    // ── Return updated uncoded count ─────────────────────────
    const countRows = await sql(
      `SELECT COUNT(*) AS total FROM transactions WHERE status = 'uncoded'`
    );
    const uncodedCount = parseInt(countRows[0]?.total || 0);

    return res.json({ ok: true, splits_created: n, uncoded_count: uncodedCount });

  } catch (err) {
    console.error('split API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
