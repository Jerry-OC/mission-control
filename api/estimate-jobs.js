// /api/estimate-jobs — Supabase jobs with estimating totals
// GET /api/estimate-jobs → all jobs (from job_estimating_summary view)

import { requireAuth } from './_auth.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

function sbHeaders() {
  return {
    'apikey':        SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
    'Content-Type':  'application/json',
  };
}

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    ...options,
    headers: { ...sbHeaders(), ...(options.headers || {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || data?.error || `Supabase ${res.status}`);
  return data;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    try {
      // Get all Supabase jobs with their estimating summaries
      const jobs = await sbFetch('/job_estimating_summary?select=*&order=name.asc');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({
        jobs: (jobs || []).map(j => ({
          id:                   j.id,
          name:                 j.name,
          status:               j.status,
          totalEstimatedCost:   Number(j.total_estimated_cost  ?? 0),
          totalEstimatedPrice:  Number(j.total_estimated_price ?? 0),
          contractCost:         Number(j.contract_cost         ?? 0),
          contractPrice:        Number(j.contract_price        ?? 0),
          orderCount:           Number(j.order_count           ?? 0),
          signedOrderCount:     Number(j.signed_order_count    ?? 0),
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
