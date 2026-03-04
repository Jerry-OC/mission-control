// /api/orders — Estimation orders
//
// GET    /api/orders                        → list all orders
// GET    /api/orders?job_id=uuid            → orders for a specific job
// POST   /api/orders                        → create an order
// PATCH  /api/orders?id=uuid                → update an order
// DELETE /api/orders?id=uuid                → delete an order
//
// Order groups have been extracted to /api/order-groups

import { createHandler, parseBody, requireParam, requireFields, validateOneOf, sendJson, sendError } from './_handler.js';
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

async function handleGet(req, res) {
  const { id, job_id } = req.query || {};

  let path = '/order_summary?select=*&order=created_at.asc';
  if (job_id) path += `&job_id=eq.${job_id}`;
  if (id)     path += `&id=eq.${id}`;
  
  const raw = await sbFetch(path);
  res.setHeader('Cache-Control', 'no-store');
  sendJson(res, 200, { orders: (raw || []).map(normalizeOrder) });
}

async function handlePost(req, res) {
  const body = parseBody(req);
  
  if (!body.job_id && !body.jobId) {
    throw new Error('job_id required');
  }
  requireFields(body, 'name');
  
  const orderType = body.type || 'Proposal';
  const orderStatus = body.status || 'Draft';
  
  validateOneOf(orderType, VALID_ORDER_TYPES, 'type');
  validateOneOf(orderStatus, VALID_ORDER_STATUSES, 'status');
  
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
  
  sendJson(res, 201, { ok: true, id: created.id, name: created.name });
}

async function handlePatch(req, res) {
  const { id } = req.query || {};
  if (!id) throw new Error('id required');
  
  const body = parseBody(req);
  const patch = {};
  
  if (body.name !== undefined) patch.name = body.name;
  
  if (body.type !== undefined) {
    validateOneOf(body.type, VALID_ORDER_TYPES, 'type');
    patch.type = body.type;
  }
  
  if (body.status !== undefined) {
    validateOneOf(body.status, VALID_ORDER_STATUSES, 'status');
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
  
  sendJson(res, 200, { ok: true, id });
}

async function handleDelete(req, res) {
  const { id } = req.query || {};
  if (!id) throw new Error('id required');
  
  // Line items are automatically deleted via CASCADE constraint on orders table
  await sbFetch(`/orders?id=eq.${id}`, { method: 'DELETE' });
  
  sendJson(res, 200, { ok: true, id });
}

export default createHandler(async (req, res) => {
  switch (req.method) {
    case 'GET':
      return handleGet(req, res);
    case 'POST':
      return handlePost(req, res);
    case 'PATCH':
      return handlePatch(req, res);
    case 'DELETE':
      return handleDelete(req, res);
    default:
      sendError(res, 405, 'Method not allowed');
  }
});
