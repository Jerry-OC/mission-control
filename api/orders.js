// /api/orders — Estimation orders (Proposals + Change Orders)
// GET    /api/orders              → list all orders (with line item totals via order_summary)
// GET    /api/orders?job_id=uuid  → orders for a specific job
// POST   /api/orders              → create an order
// PATCH  /api/orders?id=uuid      → update an order
// DELETE /api/orders?id=uuid      → delete an order (+ cascades to line_items)

import { requireAuth } from './_auth.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

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

function normalizeOrder(o) {
  return {
    id:            o.id,
    jobId:         o.job_id,
    name:          o.name,
    type:          o.type,          // 'Proposal' | 'Change Order'
    status:        o.status,        // 'Draft' | 'Sent' | 'Signed'
    dateSent:      o.date_sent,
    dateSigned:    o.date_signed,
    notes:         o.notes,
    totalCost:     Number(o.total_cost  ?? 0),
    totalPrice:    Number(o.total_price ?? 0),
    lineItemCount: Number(o.line_item_count ?? 0),
    createdAt:     o.created_at,
    updatedAt:     o.updated_at,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (!requireAuth(req, res)) return;

  const { id, job_id } = req.query || {};

  // ── GET ──────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      // Use order_summary view so totals are included
      let path = '/order_summary?select=*&order=created_at.asc';
      if (job_id) path += `&job_id=eq.${job_id}`;
      if (id)     path += `&id=eq.${id}`;

      const raw = await sbFetch(path);
      const orders = (raw || []).map(normalizeOrder);
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ orders });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ── POST — create ─────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      if (!body.job_id && !body.jobId) {
        res.status(400).json({ error: 'job_id required' }); return;
      }
      if (!body.name) {
        res.status(400).json({ error: 'name required' }); return;
      }
      const row = {
        job_id:      body.job_id   || body.jobId,
        name:        body.name,
        type:        body.type     || 'Proposal',
        status:      body.status   || 'Draft',
        date_sent:   body.dateSent   || body.date_sent   || null,
        date_signed: body.dateSigned || body.date_signed || null,
        notes:       body.notes    || null,
      };
      const [created] = await sbFetch('/orders', {
        method:  'POST',
        body:    JSON.stringify(row),
        headers: { 'Prefer': 'return=representation' },
      });
      res.status(201).json({ ok: true, id: created.id, name: created.name });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ── PATCH — update ────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    if (!id) { res.status(400).json({ error: 'id required' }); return; }
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const patch = {};
      if (body.name        !== undefined) patch.name        = body.name;
      if (body.type        !== undefined) patch.type        = body.type;
      if (body.status      !== undefined) patch.status      = body.status;
      if (body.dateSent    !== undefined) patch.date_sent   = body.dateSent   || null;
      if (body.date_sent   !== undefined) patch.date_sent   = body.date_sent  || null;
      if (body.dateSigned  !== undefined) patch.date_signed = body.dateSigned || null;
      if (body.date_signed !== undefined) patch.date_signed = body.date_signed|| null;
      if (body.notes       !== undefined) patch.notes       = body.notes;
      patch.updated_at = new Date().toISOString();

      await sbFetch(`/orders?id=eq.${id}`, {
        method:  'PATCH',
        body:    JSON.stringify(patch),
        headers: { 'Prefer': 'return=minimal' },
      });
      res.status(200).json({ ok: true, id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (!id) { res.status(400).json({ error: 'id required' }); return; }
    try {
      // Delete line items first (no FK cascade configured yet)
      await sbFetch(`/line_items?order_id=eq.${id}`, { method: 'DELETE' });
      await sbFetch(`/orders?id=eq.${id}`,            { method: 'DELETE' });
      res.status(200).json({ ok: true, id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
