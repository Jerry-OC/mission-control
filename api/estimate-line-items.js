// /api/estimate-line-items — Line items + cost code lookup for estimation orders
// GET    /api/estimate-line-items?order_id=uuid       → all line items (with cost code join)
// GET    /api/estimate-line-items?resource=cost-codes → full cost codes list
// POST   /api/estimate-line-items                     → create a line item
// PATCH  /api/estimate-line-items?id=uuid             → update a line item
// DELETE /api/estimate-line-items?id=uuid             → delete a line item
// PATCH  /api/estimate-line-items?action=reorder      → update sort_order array

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

function normalizeLineItem(li) {
  const cc = li.cost_codes || {};
  return {
    id:               li.id,
    orderId:          li.order_id,
    groupId:          li.group_id      ?? null,
    costCodeId:       li.cost_code_id  ?? null,
    costCodeName:     cc.name          ?? null,
    costCodeNumber:   cc.number        ?? null,
    costCodeCategory: cc.category      ?? null,
    name:             li.name,
    description:      li.description,
    laborCost:        Number(li.labor_cost     ?? 0),
    materialsCost:    Number(li.materials_cost ?? 0),
    otherCost:        Number(li.other_cost     ?? 0),
    markupPct:        Number(li.margin_pct     ?? 20),  // DB col = margin_pct, API = markupPct
    totalCost:        Number(li.total_cost     ?? 0),
    price:            Number(li.price          ?? 0),
    sortOrder:        Number(li.sort_order     ?? 0),
    notes:            li.notes,
    createdAt:        li.created_at,
    updatedAt:        li.updated_at,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (!requireAuth(req, res)) return;

  const { id, order_id, action, resource } = req.query || {};

  // ── GET cost-codes (resource=cost-codes) ─────────────────────────────────
  if (req.method === 'GET' && resource === 'cost-codes') {
    try {
      const raw = await sbFetch('/cost_codes?select=id,name,number,category&order=number.asc');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.status(200).json({ costCodes: raw || [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ── GET — list line items for an order ────────────────────────────────────
  if (req.method === 'GET') {
    if (!order_id) { res.status(400).json({ error: 'order_id required' }); return; }
    try {
      const raw = await sbFetch(
        `/line_items?order_id=eq.${order_id}&select=*,cost_codes(name,number,category)&order=sort_order.asc,created_at.asc`
      );
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ lineItems: (raw || []).map(normalizeLineItem) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ── POST — create a line item ─────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const orderId = body.order_id || body.orderId;
      if (!orderId) { res.status(400).json({ error: 'order_id required' }); return; }
      if (!body.name) { res.status(400).json({ error: 'name required' }); return; }

      // Determine sort_order: put new items at the end
      const existing = await sbFetch(
        `/line_items?order_id=eq.${orderId}&select=sort_order&order=sort_order.desc&limit=1`
      );
      const nextSort = existing?.length ? (existing[0].sort_order + 1) : 0;

      const row = {
        order_id:       orderId,
        group_id:       body.groupId      ?? body.group_id      ?? null,
        cost_code_id:   body.costCodeId   ?? body.cost_code_id  ?? null,
        name:           body.name,
        description:    body.description  || null,
        labor_cost:     Number(body.laborCost     ?? body.labor_cost     ?? 0),
        materials_cost: Number(body.materialsCost ?? body.materials_cost ?? 0),
        other_cost:     Number(body.otherCost     ?? body.other_cost     ?? 0),
        margin_pct:     Number(body.markupPct     ?? body.marginPct      ?? body.margin_pct ?? 20),
        notes:          body.notes        || null,
        sort_order:     body.sortOrder    ?? body.sort_order ?? nextSort,
      };

      // Insert then re-fetch with join so cost code info is included
      const [created] = await sbFetch('/line_items', {
        method:  'POST',
        body:    JSON.stringify(row),
        headers: { 'Prefer': 'return=representation' },
      });

      // Re-fetch with cost_codes join
      const [withJoin] = await sbFetch(
        `/line_items?id=eq.${created.id}&select=*,cost_codes(name,number,category)`
      );

      res.status(201).json({ ok: true, lineItem: normalizeLineItem(withJoin || created) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ── PATCH ─────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    // Bulk reorder: body = { items: [{id, sortOrder}] }
    if (action === 'reorder') {
      try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const updates = body.items || [];
        await Promise.all(
          updates.map(item =>
            sbFetch(`/line_items?id=eq.${item.id}`, {
              method:  'PATCH',
              body:    JSON.stringify({ sort_order: item.sortOrder ?? item.sort_order }),
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
      if (body.name          !== undefined) patch.name           = body.name;
      if (body.description   !== undefined) patch.description    = body.description;
      if (body.groupId       !== undefined) patch.group_id       = body.groupId       ?? null;
      if (body.group_id      !== undefined) patch.group_id       = body.group_id      ?? null;
      if (body.costCodeId    !== undefined) patch.cost_code_id   = body.costCodeId    ?? null;
      if (body.cost_code_id  !== undefined) patch.cost_code_id   = body.cost_code_id  ?? null;
      if (body.laborCost     !== undefined) patch.labor_cost     = Number(body.laborCost);
      if (body.labor_cost    !== undefined) patch.labor_cost     = Number(body.labor_cost);
      if (body.materialsCost !== undefined) patch.materials_cost = Number(body.materialsCost);
      if (body.materials_cost!== undefined) patch.materials_cost = Number(body.materials_cost);
      if (body.otherCost     !== undefined) patch.other_cost     = Number(body.otherCost);
      if (body.other_cost    !== undefined) patch.other_cost     = Number(body.other_cost);
      if (body.markupPct     !== undefined) patch.margin_pct     = Number(body.markupPct);
      if (body.marginPct     !== undefined) patch.margin_pct     = Number(body.marginPct);
      if (body.margin_pct    !== undefined) patch.margin_pct     = Number(body.margin_pct);
      if (body.notes         !== undefined) patch.notes          = body.notes;
      if (body.sortOrder     !== undefined) patch.sort_order     = body.sortOrder;
      if (body.sort_order    !== undefined) patch.sort_order     = body.sort_order;
      patch.updated_at = new Date().toISOString();

      await sbFetch(`/line_items?id=eq.${id}`, {
        method:  'PATCH',
        body:    JSON.stringify(patch),
        headers: { 'Prefer': 'return=minimal' },
      });

      // Re-fetch with cost_codes join
      const [withJoin] = await sbFetch(
        `/line_items?id=eq.${id}&select=*,cost_codes(name,number,category)`
      );

      res.status(200).json({ ok: true, lineItem: normalizeLineItem(withJoin) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (!id) { res.status(400).json({ error: 'id required' }); return; }
    try {
      await sbFetch(`/line_items?id=eq.${id}`, { method: 'DELETE' });
      res.status(200).json({ ok: true, id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
