// /api/docs.js — Design Documents CRUD
import { requireAuth } from './_auth.js';
import { sbFetch } from './_sb.js';

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  const { id } = req.query || {};

  try {
    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      if (id) {
        // Single doc with full content
        const rows = await sbFetch(`/design_docs?id=eq.${id}&select=*&limit=1`);
        if (!rows.length) return res.status(404).json({ error: 'Not found' });
        return res.json({ doc: rows[0] });
      }

      // List — omit content for performance
      const rows = await sbFetch(
        `/design_docs?select=id,title,category,tags,created_at,updated_at&order=updated_at.desc`
      );
      return res.json({ docs: rows });
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { title, category = 'general', content, tags = [] } = req.body || {};
      if (!title || !content) {
        return res.status(400).json({ error: 'title and content are required' });
      }
      const rows = await sbFetch('/design_docs', {
        method: 'POST',
        body: JSON.stringify({ title, category, content, tags }),
        headers: { 'Prefer': 'return=representation' },
      });
      return res.status(201).json({ ok: true, doc: rows[0] });
    }

    // ── PATCH ────────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      if (!id) return res.status(400).json({ error: 'id is required' });
      const updates = {};
      const { title, category, content, tags } = req.body || {};
      if (title    !== undefined) updates.title    = title;
      if (category !== undefined) updates.category = category;
      if (content  !== undefined) updates.content  = content;
      if (tags     !== undefined) updates.tags     = tags;
      updates.updated_at = new Date().toISOString();

      const rows = await sbFetch(`/design_docs?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
        headers: { 'Prefer': 'return=representation' },
      });
      return res.json({ ok: true, doc: rows[0] });
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id is required' });
      await sbFetch(`/design_docs?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[docs] Request failed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
