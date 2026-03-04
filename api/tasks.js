// /api/tasks — Supabase-backed task management
// GET    /api/tasks              → list all tasks
// POST   /api/tasks              → create a task
// PATCH  /api/tasks?id=uuid      → update a task
// DELETE /api/tasks?id=uuid      → delete a task

import { createHandler, parseBody, requireParam, buildPatch } from './_handler.js';
import { sbFetch } from './_sb.js';

const FIELD_MAP = {
  'job_name': 'job',
  'due_date': 'dueDate',
  'created_at': 'createdAt',
};

function normalizeTask(t) {
  return {
    id:          t.id,
    name:        t.name,
    description: t.description,
    status:      t.status,
    priority:    t.priority,
    level:       t.level,
    job:         t.job_name,
    assignee:    t.assignee,
    dueDate:     t.due_date,
    notes:       t.notes,
    createdAt:   t.created_at,
  };
}

export default createHandler(async (req, res) => {
  const id = req.query?.id;

  // ── GET — list all tasks ───────────────────────────────────────────────
  if (req.method === 'GET') {
    const raw = await sbFetch(
      '/tasks?select=*&order=created_at.asc'
    );
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    res.status(200).json({ tasks: (raw || []).map(normalizeTask) });
    return;
  }

  // ── POST — create a task ────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = parseBody(req);
    const row = {
      name:        body.name        || null,
      description: body.description || null,
      status:      body.status      || 'To Do',
      priority:    body.priority    || 'Medium',
      level:       body.level       || 'Org',
      job_name:    body.job         || body.job_name || null,
      assignee:    body.assignee    || null,
      due_date:    body.dueDate     || body.due_date || null,
      notes:       body.notes       || null,
    };
    const [created] = await sbFetch('/tasks', {
      method: 'POST',
      body: JSON.stringify(row),
      headers: { 'Prefer': 'return=representation' },
    });
    res.status(201).json({ ok: true, id: created.id, name: created.name });
    return;
  }

  // ── PATCH — update a task ──────────────────────────────────────────────
  if (req.method === 'PATCH') {
    if (!id) throw new Error('id required');
    const body = parseBody(req);
    const patch = buildPatch(body, FIELD_MAP);
    
    // Only include fields that were explicitly provided
    const finalPatch = {};
    const allowedFields = ['name', 'description', 'status', 'priority', 'level', 'job_name', 'assignee', 'due_date', 'notes'];
    for (const field of allowedFields) {
      if (patch[field] !== undefined) finalPatch[field] = patch[field];
    }

    await sbFetch(`/tasks?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(finalPatch),
      headers: { 'Prefer': 'return=minimal' },
    });
    res.status(200).json({ ok: true, id });
    return;
  }

  // ── DELETE ──────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (!id) throw new Error('id required');
    await sbFetch(`/tasks?id=eq.${id}`, { method: 'DELETE' });
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
