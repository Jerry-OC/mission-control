// /api/jobs — Job data
//   GET  /api/jobs                     → JobTread active jobs (live)
//   GET  /api/jobs?source=estimating   → Supabase jobs with estimating totals
//   POST /api/jobs?source=estimating   → Create a new Supabase job record

import { requireAuth } from './_auth.js';

const SB_URL = (process.env.SUPABASE_URL          || '').trim();
const SB_KEY = (process.env.SUPABASE_SERVICE_KEY   || '').trim();
const JT_KEY = (process.env.JOBTREAD_GRANT_KEY     || '').trim();

function sbHeaders(extra = {}) {
  return {
    'apikey':        SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
    'Content-Type':  'application/json',
    ...extra,
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // ── POST — create a new Supabase job (estimating flow only) ──────────
  if (req.method === 'POST') {
    if (!requireAuth(req, res)) return;
    if (req.query?.source !== 'estimating') {
      return res.status(400).json({ error: 'POST only supported for source=estimating' });
    }
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      if (!body.name?.trim()) {
        return res.status(400).json({ error: 'name required' });
      }
      const row = {
        name:            body.name.trim(),
        status:          body.status           || 'estimating',
        address:         body.address          || null,
        city:            body.city             || null,
        description:     body.description      || null,
        contract_amount: body.contractAmount != null ? Number(body.contractAmount) : null,
        projected_cost:  body.projectedCost  != null ? Number(body.projectedCost)  : null,
      };
      const [created] = await sbFetch('/jobs', {
        method:  'POST',
        body:    JSON.stringify(row),
        headers: { 'Prefer': 'return=representation' },
      });
      return res.status(201).json({ ok: true, id: created.id, name: created.name });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── GET: Estimating source — Supabase job_estimating_summary view ─────
  if (req.query?.source === 'estimating') {
    if (!requireAuth(req, res)) return;
    try {
      const jobs = await sbFetch('/job_estimating_summary?select=*&order=name.asc');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        jobs: (jobs || []).map(j => ({
          id:                   j.id,
          name:                 j.name,
          status:               j.status,
          totalEstimatedCost:   Number(j.total_estimated_cost  ?? 0),
          totalEstimatedPrice:  Number(j.total_estimated_price ?? 0),
          signedCost:           Number(j.signed_cost           ?? 0),
          signedPrice:          Number(j.signed_price          ?? 0),
          contractCost:         Number(j.contract_cost         ?? 0),
          contractPrice:        Number(j.contract_price        ?? 0),
          orderCount:           Number(j.order_count           ?? 0),
          signedOrderCount:     Number(j.signed_order_count    ?? 0),
        })),
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── GET: Default — JobTread active jobs (live) ────────────────────────
  if (!requireAuth(req, res)) return;
  res.setHeader('Cache-Control', 's-maxage=120'); // cache 2 min
  try {
    const response = await fetch('https://api.jobtread.com/pave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        "$": { "grantKey": JT_KEY },
        "organization": {
          "id": "22NeVb7CK2sW",
          "jobs": {
            "$": {
              "filter": { "statuses": ["approved"] },
              "onPage": 1,
              "rowsPerPage": 20
            },
            "id": true,
            "name": true,
            "number": true,
            "status": true,
            "customer": { "name": true },
            "location": { "name": true },
            "totalContractValue": true,
            "totalBilled": true,
            "totalPaid": true,
            "totalOwed": true,
            "totalActualCost": true,
            "totalBudgetedCost": true
          }
        }
      })
    });

    const data = await response.json();
    const jobs = data?.organization?.jobs || [];

    return res.json({
      jobs: jobs.map(j => ({
        id: j.id,
        name: j.name,
        number: j.number,
        status: j.status,
        customer: j.customer?.name || '',
        location: j.location?.name || '',
        contractValue: j.totalContractValue || 0,
        billed: j.totalBilled || 0,
        paid: j.totalPaid || 0,
        owed: j.totalOwed || 0,
        actualCost: j.totalActualCost || 0,
        budgetedCost: j.totalBudgetedCost || 0
      })),
      total: jobs.length,
      totalValue: jobs.reduce((sum, j) => sum + (j.totalContractValue || 0), 0)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
