// /api/docs.js — Design Documents CRUD
import { requireAuth } from './_auth.js';

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

function sbHeaders() {
  return {
    'apikey': SB_KEY,
    'Authorization': `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  };
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  const { id } = req.query || {};

  try {
    // ── GET ──────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      if (id) {
        // Single doc with full content
        const r = await fetch(
          `${SB_URL}/rest/v1/design_docs?id=eq.${id}&select=*&limit=1`,
          { headers: sbHeaders() }
        );
        if (!r.ok) return res.status(500).json({ error: 'Supabase fetch failed' });
        const rows = await r.json();
        if (!rows.length) return res.status(404).json({ error: 'Not found' });
        return res.json({ doc: rows[0] });
      }

      // List — omit content for performance
      const r = await fetch(
        `${SB_URL}/rest/v1/design_docs?select=id,title,category,tags,created_at,updated_at&order=updated_at.desc`,
        { headers: sbHeaders() }
      );
      if (!r.ok) return res.status(500).json({ error: 'Supabase fetch failed' });
      const rows = await r.json();
      return res.json({ docs: rows });
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { title, category = 'general', content, tags = [] } = req.body || {};
      if (!title || !content) {
        return res.status(400).json({ error: 'title and content are required' });
      }
      const r = await fetch(`${SB_URL}/rest/v1/design_docs`, {
        method: 'POST',
        headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify({ title, category, content, tags }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(500).json({ error: err.message || 'Supabase insert failed' });
      }
      const rows = await r.json();
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

      const r = await fetch(`${SB_URL}/rest/v1/design_docs?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify(updates),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(500).json({ error: err.message || 'Supabase update failed' });
      }
      const rows = await r.json();
      return res.json({ ok: true, doc: rows[0] });
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id is required' });
      const r = await fetch(`${SB_URL}/rest/v1/design_docs?id=eq.${id}`, {
        method: 'DELETE',
        headers: sbHeaders(),
      });
      if (!r.ok) return res.status(500).json({ error: 'Supabase delete failed' });
      return res.json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[docs] Request failed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
