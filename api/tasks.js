// /api/tasks — Supabase-backed task management
// GET    /api/tasks              → list all tasks
// POST   /api/tasks              → create a task
// PATCH  /api/tasks?id=uuid      → update a task
// DELETE /api/tasks?id=uuid      → delete a task

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

function sbHeaders() {
  return {
    'apikey': SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    ...options,
    headers: { ...sbHeaders(), ...(options.headers || {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.message || `Supabase error ${res.status}`);
  return data;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const id = req.query?.id;

  // ── GET — list all tasks ───────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const raw = await sbFetch(
        '/tasks?select=*&order=created_at.asc',
        { headers: { 'Prefer': 'return=representation' } }
      );
      // Normalize to camelCase / frontend-friendly field names
      const tasks = (raw || []).map(t => ({
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
      }));
      res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
      res.status(200).json({ tasks });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ── POST — create a task ────────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
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
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ── PATCH — update a task ──────────────────────────────────────────────
  if (req.method === 'PATCH') {
    if (!id) { res.status(400).json({ error: 'id required' }); return; }
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const patch = {};
      if (body.name        !== undefined) patch.name        = body.name;
      if (body.description !== undefined) patch.description = body.description;
      if (body.status      !== undefined) patch.status      = body.status;
      if (body.priority    !== undefined) patch.priority    = body.priority;
      if (body.level       !== undefined) patch.level       = body.level;
      if (body.job         !== undefined) patch.job_name    = body.job;
      if (body.job_name    !== undefined) patch.job_name    = body.job_name;
      if (body.assignee    !== undefined) patch.assignee    = body.assignee;
      if (body.dueDate     !== undefined) patch.due_date    = body.dueDate;
      if (body.due_date    !== undefined) patch.due_date    = body.due_date;
      if (body.notes       !== undefined) patch.notes       = body.notes;

      await sbFetch(`/tasks?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
        headers: { 'Prefer': 'return=minimal' },
      });
      res.status(200).json({ ok: true, id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ── DELETE ──────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (!id) { res.status(400).json({ error: 'id required' }); return; }
    try {
      await sbFetch(`/tasks?id=eq.${id}`, { method: 'DELETE' });
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
