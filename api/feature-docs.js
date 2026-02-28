// /api/feature-docs.js — Living feature docs backed by GitHub (docs/{slug}.md)
// One living doc per feature. feature_id = feature slug.
import { requireAuth } from './_auth.js';

const GH_TOKEN = process.env.GITHUB_DOCS_TOKEN;
const GH_REPO  = 'Jerry-OC/cdb-specs-and-docs';
const GH_BASE  = `https://api.github.com/repos/${GH_REPO}/contents`;

function ghHeaders() {
  return {
    'Authorization': `Bearer ${GH_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

async function readFile(path) {
  const r = await fetch(`${GH_BASE}/${path}`, { headers: ghHeaders() });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub read failed: ${r.status}`);
  const data = await r.json();
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return { content, sha: data.sha, path: data.path };
}

async function writeFile(path, content, sha, message) {
  const body = {
    message,
    content: Buffer.from(content).toString('base64'),
  };
  if (sha) body.sha = sha;
  const r = await fetch(`${GH_BASE}/${path}`, {
    method: 'PUT',
    headers: ghHeaders(),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`GitHub write failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function listDir(path) {
  const r = await fetch(`${GH_BASE}/${path}`, { headers: ghHeaders() });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`GitHub list failed: ${r.status}`);
  const items = await r.json();
  return Array.isArray(items) ? items : [];
}

function parseDocFrontmatter(content, slug) {
  const fm = {};
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (match) {
    match[1].split('\n').forEach(line => {
      const [k, ...v] = line.split(':');
      if (k) fm[k.trim()] = v.join(':').trim();
    });
  }
  // Parse linked_specs array from frontmatter
  const linkedMatch = content.match(/linked_specs:\s*\n((?:\s*-[^\n]*\n?)*)/);
  const linked_specs = [];
  if (linkedMatch) {
    linkedMatch[1].split('\n').forEach(l => {
      const m = l.match(/^\s*-\s*(.+)/);
      if (m) linked_specs.push(m[1].trim());
    });
  }
  return {
    id: slug,
    feature_id: slug,
    last_updated: fm.last_updated || null,
    linked_specs,
  };
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (!GH_TOKEN) return res.status(503).json({ error: 'GITHUB_DOCS_TOKEN not configured' });

  // feature_id = slug
  const { feature_id, id } = req.query || {};
  const slug = feature_id || id;

  try {
    // ── GET ──────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      if (slug) {
        const file = await readFile(`docs/${slug}.md`);
        if (!file) return res.json({ doc: null });
        const meta = parseDocFrontmatter(file.content, slug);
        return res.json({ doc: { ...meta, content: file.content, sha: file.sha } });
      }
      // List all docs (meta only, no content)
      const items = await listDir('docs');
      const docs = items
        .filter(f => f.name.endsWith('.md'))
        .map(f => {
          const s = f.name.replace(/\.md$/, '');
          return { id: s, feature_id: s, path: f.path, sha: f.sha };
        });
      return res.json({ docs });
    }

    // ── POST (create) ─────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { feature_id: fid, content, change_summary = 'Initial doc' } = req.body || {};
      if (!fid || !content) return res.status(400).json({ error: 'feature_id and content are required' });
      const existing = await readFile(`docs/${fid}.md`);
      if (existing) return res.status(409).json({ error: 'Doc already exists for this feature. Use PATCH to update.' });
      await writeFile(`docs/${fid}.md`, content, null, `docs(${fid}): ${change_summary}`);
      return res.status(201).json({ ok: true, doc: { id: fid, feature_id: fid, content } });
    }

    // ── PATCH (update) ────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      if (!slug) return res.status(400).json({ error: 'feature_id or id query param required' });
      const { content, change_summary = 'Updated' } = req.body || {};
      if (!content) return res.status(400).json({ error: 'content is required' });
      const existing = await readFile(`docs/${slug}.md`);
      await writeFile(`docs/${slug}.md`, content, existing?.sha || null, `docs(${slug}): ${change_summary}`);
      return res.json({ ok: true, doc: { id: slug, feature_id: slug, content } });
    }

    // ── DELETE ────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      if (!slug) return res.status(400).json({ error: 'feature_id or id query param required' });
      const existing = await readFile(`docs/${slug}.md`);
      if (!existing) return res.status(404).json({ error: 'Doc not found' });
      const r = await fetch(`${GH_BASE}/docs/${slug}.md`, {
        method: 'DELETE',
        headers: ghHeaders(),
        body: JSON.stringify({ message: `docs(${slug}): delete`, sha: existing.sha }),
      });
      if (!r.ok) throw new Error(`GitHub delete failed: ${r.status}`);
      return res.json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
