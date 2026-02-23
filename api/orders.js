// /api/orders — Estimation orders + order groups
//
// ORDERS
// GET    /api/orders                        → list all orders
// GET    /api/orders?job_id=uuid            → orders for a specific job
// POST   /api/orders                        → create an order
// PATCH  /api/orders?id=uuid                → update an order
// DELETE /api/orders?id=uuid                → delete an order
//
// ORDER GROUPS  (resource=groups)
// GET    /api/orders?resource=groups&order_id=uuid   → list groups
// POST   /api/orders?resource=groups                 → create group
// PATCH  /api/orders?resource=groups&id=uuid         → update group
// PATCH  /api/orders?resource=groups&action=reorder  → bulk reorder
// DELETE /api/orders?resource=groups&id=uuid         → delete group

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
    type:          o.type,
    status:        o.status,
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

function normalizeGroup(g) {
  return {
    id:        g.id,
    orderId:   g.order_id,
    name:      g.name,
    sortOrder: Number(g.sort_order ?? 0),
    createdAt: g.created_at,
    updatedAt: g.updated_at,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (!requireAuth(req, res)) return;

  const { id, job_id, resource, order_id, action } = req.query || {};

  // ══════════════════════════════════════════════════════
  // ORDER GROUPS  (resource=groups)
  // ══════════════════════════════════════════════════════
  if (resource === 'groups') {

    // GET — list groups for an order
    if (req.method === 'GET') {
      if (!order_id) { res.status(400).json({ error: 'order_id required' }); return; }
      try {
        const raw = await sbFetch(
          `/order_groups?order_id=eq.${order_id}&select=*&order=sort_order.asc,created_at.asc`
        );
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json({ groups: (raw || []).map(normalizeGroup) });
      } catch (err) { res.status(500).json({ error: err.message }); }
      return;
    }

    // POST — create group
    if (req.method === 'POST') {
      try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const orderId = body.order_id || body.orderId;
        if (!orderId) { res.status(400).json({ error: 'order_id required' }); return; }
        if (!body.name) { res.status(400).json({ error: 'name required' }); return; }

        let sortOrder = body.sort_order ?? body.sortOrder;
        if (sortOrder == null) {
          const existing = await sbFetch(
            `/order_groups?order_id=eq.${orderId}&select=sort_order&order=sort_order.desc&limit=1`
          );
          sortOrder = existing?.length ? (existing[0].sort_order + 1) : 0;
        }
        const [created] = await sbFetch('/order_groups', {
          method:  'POST',
          body:    JSON.stringify({ order_id: orderId, name: body.name, sort_order: Number(sortOrder) }),
          headers: { 'Prefer': 'return=representation' },
        });
        res.status(201).json({ ok: true, group: normalizeGroup(created) });
      } catch (err) { res.status(500).json({ error: err.message }); }
      return;
    }

    // PATCH — bulk reorder or single update
    if (req.method === 'PATCH') {
      if (action === 'reorder') {
        try {
          const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || []);
          const updates = Array.isArray(body) ? body : (body.items || []);
          await Promise.all(
            updates.map(item =>
              sbFetch(`/order_groups?id=eq.${item.id}`, {
                method:  'PATCH',
                body:    JSON.stringify({ sort_order: item.sort_order ?? item.sortOrder }),
                headers: { 'Prefer': 'return=minimal' },
              })
            )
          );
          res.status(200).json({ ok: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
        return;
      }
      if (!id) { res.status(400).json({ error: 'id required' }); return; }
      try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const patch = {};
        if (body.name       !== undefined) patch.name       = body.name;
        if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order);
        if (body.sortOrder  !== undefined) patch.sort_order = Number(body.sortOrder);
        patch.updated_at = new Date().toISOString();
        const [updated] = await sbFetch(`/order_groups?id=eq.${id}`, {
          method:  'PATCH',
          body:    JSON.stringify(patch),
          headers: { 'Prefer': 'return=representation' },
        });
        res.status(200).json({ ok: true, group: normalizeGroup(updated) });
      } catch (err) { res.status(500).json({ error: err.message }); }
      return;
    }

    // DELETE — delete group (line items become ungrouped via SET NULL)
    if (req.method === 'DELETE') {
      if (!id) { res.status(400).json({ error: 'id required' }); return; }
      try {
        await sbFetch(`/order_groups?id=eq.${id}`, { method: 'DELETE' });
        res.status(200).json({ ok: true, id });
      } catch (err) { res.status(500).json({ error: err.message }); }
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // ══════════════════════════════════════════════════════
  // ORDERS
  // ══════════════════════════════════════════════════════

  // GET
  if (req.method === 'GET') {
    try {
      let path = '/order_summary?select=*&order=created_at.asc';
      if (job_id) path += `&job_id=eq.${job_id}`;
      if (id)     path += `&id=eq.${id}`;
      const raw = await sbFetch(path);
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ orders: (raw || []).map(normalizeOrder) });
    } catch (err) { res.status(500).json({ error: err.message }); }
    return;
  }

  // POST — create
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      if (!body.job_id && !body.jobId) { res.status(400).json({ error: 'job_id required' }); return; }
      if (!body.name) { res.status(400).json({ error: 'name required' }); return; }
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
    } catch (err) { res.status(500).json({ error: err.message }); }
    return;
  }

  // PATCH — update
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
    } catch (err) { res.status(500).json({ error: err.message }); }
    return;
  }

  // DELETE
  if (req.method === 'DELETE') {
    if (!id) { res.status(400).json({ error: 'id required' }); return; }
    try {
      await sbFetch(`/line_items?order_id=eq.${id}`, { method: 'DELETE' });
      await sbFetch(`/orders?id=eq.${id}`,            { method: 'DELETE' });
      res.status(200).json({ ok: true, id });
    } catch (err) { res.status(500).json({ error: err.message }); }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
