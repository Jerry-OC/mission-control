// /api/features.js — Feature registry backed by GitHub (features.json)
// GitHub token stays server-side only.
import { requireAuth } from './_auth.js';

const GH_TOKEN = process.env.GITHUB_DOCS_TOKEN;
const GH_REPO  = 'Jerry-OC/cdb-specs-and-docs';
const GH_PATH  = 'features.json';
const GH_BASE  = `https://api.github.com/repos/${GH_REPO}/contents`;

function ghHeaders() {
  return {
    'Authorization': `Bearer ${GH_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

async function readFeatures() {
  const r = await fetch(`${GH_BASE}/${GH_PATH}`, { headers: ghHeaders() });
  if (!r.ok) throw new Error(`GitHub read failed: ${r.status}`);
  const { content, sha } = await r.json();
  const features = JSON.parse(Buffer.from(content, 'base64').toString('utf8'));
  return { features, sha };
}

async function writeFeatures(features, sha, message) {
  const r = await fetch(`${GH_BASE}/${GH_PATH}`, {
    method: 'PUT',
    headers: ghHeaders(),
    body: JSON.stringify({
      message,
      content: Buffer.from(JSON.stringify(features, null, 2)).toString('base64'),
      sha,
    }),
  });
  if (!r.ok) throw new Error(`GitHub write failed: ${r.status} ${await r.text()}`);
  return r.json();
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (!GH_TOKEN) return res.status(503).json({ error: 'GITHUB_DOCS_TOKEN not configured' });

  const { slug } = req.query || {};

  try {
    if (req.method === 'GET') {
      const { features } = await readFeatures();
      // Ensure id = slug for HTML compatibility
      const normalized = features.map(f => ({ ...f, id: f.slug }));
      return res.json({ features: normalized });
    }

    if (req.method === 'POST') {
      const { name, slug: s, description = '', app = 'general' } = req.body || {};
      if (!name || !s) return res.status(400).json({ error: 'name and slug are required' });
      const slugified = s.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
      const { features, sha } = await readFeatures();
      if (features.find(f => f.slug === slugified)) {
        return res.status(409).json({ error: 'Feature with that slug already exists' });
      }
      const feature = { id: slugified, slug: slugified, name, description, app, created_at: new Date().toISOString() };
      features.push(feature);
      features.sort((a, b) => a.name.localeCompare(b.name));
      await writeFeatures(features, sha, `feat: add feature "${name}"`);
      return res.status(201).json({ ok: true, feature });
    }

    if (req.method === 'PATCH') {
      if (!slug) return res.status(400).json({ error: 'slug query param required' });
      const { features, sha } = await readFeatures();
      const idx = features.findIndex(f => f.slug === slug);
      if (idx < 0) return res.status(404).json({ error: 'Feature not found' });
      const { name, description, app } = req.body || {};
      if (name        !== undefined) features[idx].name        = name;
      if (description !== undefined) features[idx].description = description;
      if (app         !== undefined) features[idx].app         = app;
      features[idx].updated_at = new Date().toISOString();
      features[idx].id = features[idx].slug;
      await writeFeatures(features, sha, `feat: update feature "${features[idx].name}"`);
      return res.json({ ok: true, feature: features[idx] });
    }

    if (req.method === 'DELETE') {
      if (!slug) return res.status(400).json({ error: 'slug query param required' });
      const { features, sha } = await readFeatures();
      const idx = features.findIndex(f => f.slug === slug);
      if (idx < 0) return res.status(404).json({ error: 'Feature not found' });
      const [removed] = features.splice(idx, 1);
      await writeFeatures(features, sha, `feat: remove feature "${removed.name}"`);
      return res.json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
