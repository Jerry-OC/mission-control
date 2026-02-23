// /api/order-groups — CRUD + reorder for order groups
// GET    ?order_id=uuid          → list groups for an order (sorted by sort_order)
// POST                           → create group { order_id, name, sort_order? }
// PATCH  ?id=uuid                → update name or sort_order
// PATCH  ?action=reorder         → bulk update: body = [{ id, sort_order }]
// DELETE ?id=uuid                → delete group (line items become ungrouped via SET NULL)

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

  const { id, order_id, action } = req.query || {};

  // ── GET — list groups for an order ───────────────────────────────────────
  if (req.method === 'GET') {
    if (!order_id) { res.status(400).json({ error: 'order_id required' }); return; }
    try {
      const raw = await sbFetch(
        `/order_groups?order_id=eq.${order_id}&select=*&order=sort_order.asc,created_at.asc`
      );
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ groups: (raw || []).map(normalizeGroup) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ── POST — create group ───────────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const orderId = body.order_id || body.orderId;
      if (!orderId) { res.status(400).json({ error: 'order_id required' }); return; }
      if (!body.name) { res.status(400).json({ error: 'name required' }); return; }

      // Auto sort_order: put at the end
      let sortOrder = body.sort_order ?? body.sortOrder;
      if (sortOrder == null) {
        const existing = await sbFetch(
          `/order_groups?order_id=eq.${orderId}&select=sort_order&order=sort_order.desc&limit=1`
        );
        sortOrder = existing?.length ? (existing[0].sort_order + 1) : 0;
      }

      const row = {
        order_id:   orderId,
        name:       body.name,
        sort_order: Number(sortOrder),
      };

      const [created] = await sbFetch('/order_groups', {
        method:  'POST',
        body:    JSON.stringify(row),
        headers: { 'Prefer': 'return=representation' },
      });
      res.status(201).json({ ok: true, group: normalizeGroup(created) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ── PATCH ─────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {

    // Bulk reorder: body = [{ id, sort_order }]
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
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
      return;
    }

    // Single update
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
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (!id) { res.status(400).json({ error: 'id required' }); return; }
    try {
      // FK ON DELETE SET NULL handles ungrouping line items automatically
      await sbFetch(`/order_groups?id=eq.${id}`, { method: 'DELETE' });
      res.status(200).json({ ok: true, id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
