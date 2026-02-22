// /api/tasks — Airtable-backed task management
// GET  /api/tasks              → list all tasks
// POST /api/tasks              → create a task
// PATCH /api/tasks?id=recXXX  → update a task
// DELETE /api/tasks?id=recXXX → delete a task

const BASE_ID  = 'appYwbR0tGpKUCb8P';
const TABLE_ID = 'tblUqgCA5pGSjxK7B';
const AT_URL   = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;

function atHeaders() {
  return {
    'Authorization': `Bearer ${process.env.AIRTABLE_PAT}`,
    'Content-Type': 'application/json',
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  // ── GET — list all tasks ────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const params = new URLSearchParams({
        sort: JSON.stringify([
          { field: 'Priority', direction: 'desc' },
          { field: 'Status',   direction: 'asc'  },
        ]),
        pageSize: '100',
      });
      const r = await fetch(`${AT_URL}?${params}`, { headers: atHeaders() });
      const data = await r.json();

      const tasks = (data.records || []).map(rec => ({
        id:          rec.id,
        name:        rec.fields['Name']        || '',
        description: rec.fields['Description'] || '',
        status:      rec.fields['Status']      || 'To Do',
        priority:    rec.fields['Priority']    || 'Medium',
        level:       rec.fields['Level']       || 'Org',
        job:         rec.fields['Job']         || '',
        assignee:    rec.fields['Assignee']    || '',
        dueDate:     rec.fields['Due Date']    || null,
        notes:       rec.fields['Notes']       || '',
        createdTime: rec.createdTime,
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
      const fields = {};
      if (body.name)        fields['Name']        = body.name;
      if (body.description) fields['Description'] = body.description;
      if (body.status)      fields['Status']      = body.status;
      if (body.priority)    fields['Priority']    = body.priority;
      if (body.level)       fields['Level']       = body.level;
      if (body.job)         fields['Job']         = body.job;
      if (body.assignee)    fields['Assignee']    = body.assignee;
      if (body.dueDate)     fields['Due Date']    = body.dueDate;
      if (body.notes)       fields['Notes']       = body.notes;

      if (!fields['Status'])   fields['Status']   = 'To Do';
      if (!fields['Priority']) fields['Priority'] = 'Medium';
      if (!fields['Level'])    fields['Level']    = 'Org';

      const r = await fetch(AT_URL, {
        method: 'POST',
        headers: atHeaders(),
        body: JSON.stringify({ records: [{ fields }] }),
      });
      const data = await r.json();
      const rec = data.records?.[0];
      res.status(201).json({ ok: true, id: rec?.id, name: rec?.fields?.Name });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ── PATCH — update a task ───────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const id = req.query?.id || new URL(req.url, 'http://x').searchParams.get('id');
    if (!id) { res.status(400).json({ error: 'id required' }); return; }
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const fields = {};
      if (body.name        !== undefined) fields['Name']        = body.name;
      if (body.description !== undefined) fields['Description'] = body.description;
      if (body.status      !== undefined) fields['Status']      = body.status;
      if (body.priority    !== undefined) fields['Priority']    = body.priority;
      if (body.level       !== undefined) fields['Level']       = body.level;
      if (body.job         !== undefined) fields['Job']         = body.job;
      if (body.assignee    !== undefined) fields['Assignee']    = body.assignee;
      if (body.dueDate     !== undefined) fields['Due Date']    = body.dueDate;
      if (body.notes       !== undefined) fields['Notes']       = body.notes;

      const r = await fetch(`${AT_URL}/${id}`, {
        method: 'PATCH',
        headers: atHeaders(),
        body: JSON.stringify({ fields }),
      });
      const data = await r.json();
      res.status(200).json({ ok: true, id: data.id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ── DELETE ──────────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const id = req.query?.id || new URL(req.url, 'http://x').searchParams.get('id');
    if (!id) { res.status(400).json({ error: 'id required' }); return; }
    try {
      await fetch(`${AT_URL}/${id}`, { method: 'DELETE', headers: atHeaders() });
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
