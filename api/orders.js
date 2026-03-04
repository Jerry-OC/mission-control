// /api/orders — Estimation orders
//
// GET    /api/orders                        → list all orders
// GET    /api/orders?job_id=uuid            → orders for a specific job
// POST   /api/orders                        → create an order
// PATCH  /api/orders?id=uuid                → update an order
// DELETE /api/orders?id=uuid                → delete an order
//
// Order groups have been extracted to /api/order-groups

import { requireAuth } from './_auth.js';
import { sbFetch } from './_sb.js';

const VALID_ORDER_TYPES = ['Proposal', 'Change Order'];
const VALID_ORDER_STATUSES = ['Draft', 'Sent', 'Signed'];

function normalizeOrder(o) {
  return {
    id:                  o.id,
    jobId:               o.job_id,
    name:                o.name,
    type:                o.type,
    status:              o.status,
    dateSent:            o.date_sent,
    dateSigned:          o.date_signed,
    notes:               o.notes,
    docusealSubmissionId: o.docuseal_submission_id ?? null,
    totalCost:           Number(o.total_cost  ?? 0),
    totalPrice:          Number(o.total_price ?? 0),
    lineItemCount:       Number(o.line_item_count ?? 0),
    createdAt:           o.created_at,
    updatedAt:           o.updated_at,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (!requireAuth(req, res)) return;

  const { id, job_id } = req.query || {};

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
      
      const orderType = body.type || 'Proposal';
      const orderStatus = body.status || 'Draft';
      
      if (!VALID_ORDER_TYPES.includes(orderType)) {
        res.status(400).json({ error: `Invalid type: must be one of ${VALID_ORDER_TYPES.join(', ')}` });
        return;
      }
      if (!VALID_ORDER_STATUSES.includes(orderStatus)) {
        res.status(400).json({ error: `Invalid status: must be one of ${VALID_ORDER_STATUSES.join(', ')}` });
        return;
      }
      
      const row = {
        job_id:                body.job_id   || body.jobId,
        name:                  body.name,
        type:                  orderType,
        status:                orderStatus,
        date_sent:             body.dateSent   || body.date_sent   || null,
        date_signed:           body.dateSigned || body.date_signed || null,
        notes:                 body.notes    || null,
        docuseal_submission_id: body.docusealSubmissionId || body.docuseal_submission_id || null,
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
      
      if (body.name !== undefined) patch.name = body.name;
      
      if (body.type !== undefined) {
        if (!VALID_ORDER_TYPES.includes(body.type)) {
          res.status(400).json({ error: `Invalid type: must be one of ${VALID_ORDER_TYPES.join(', ')}` });
          return;
        }
        patch.type = body.type;
      }
      
      if (body.status !== undefined) {
        if (!VALID_ORDER_STATUSES.includes(body.status)) {
          res.status(400).json({ error: `Invalid status: must be one of ${VALID_ORDER_STATUSES.join(', ')}` });
          return;
        }
        patch.status = body.status;
        // Auto-set date_sent if transitioning to 'Sent'
        if (body.status === 'Sent' && !body.dateSent && !body.date_sent) {
          patch.date_sent = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        }
      }
      
      if (body.dateSent    !== undefined) patch.date_sent   = body.dateSent   || null;
      if (body.date_sent   !== undefined) patch.date_sent   = body.date_sent  || null;
      if (body.dateSigned  !== undefined) patch.date_signed = body.dateSigned || null;
      if (body.date_signed !== undefined) patch.date_signed = body.date_signed|| null;
      if (body.notes       !== undefined) patch.notes       = body.notes;
      if (body.docusealSubmissionId !== undefined) patch.docuseal_submission_id = body.docusealSubmissionId || null;
      if (body.docuseal_submission_id !== undefined) patch.docuseal_submission_id = body.docuseal_submission_id || null;
      
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

  // DELETE — cascade delete handled by database
  if (req.method === 'DELETE') {
    if (!id) { res.status(400).json({ error: 'id required' }); return; }
    try {
      // Line items are automatically deleted via CASCADE constraint on orders table
      await sbFetch(`/orders?id=eq.${id}`, { method: 'DELETE' });
      res.status(200).json({ ok: true, id });
    } catch (err) { res.status(500).json({ error: err.message }); }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
