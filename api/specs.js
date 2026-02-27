// /api/specs.js — Spec documents (backed by GitHub private repo)
// GitHub token stays server-side — never exposed to the browser.
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

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (!GH_TOKEN) {
    return res.status(503).json({ error: 'GITHUB_DOCS_TOKEN not configured' });
  }

  const { feature, version } = req.query || {};

  try {
  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    if (!feature) return res.status(400).json({ error: 'feature query param is required' });

    if (version) {
      // Fetch a specific spec file's content
      const path = `specs/${feature}/${version}.md`;
      const r = await fetch(`${GH_BASE}/${path}`, { headers: ghHeaders() });
      if (r.status === 404) return res.status(404).json({ error: 'Spec not found' });
      if (!r.ok) return res.status(500).json({ error: 'GitHub fetch failed' });
      const data = await r.json();
      const content = Buffer.from(data.content, 'base64').toString('utf8');
      return res.json({
        spec: {
          path,
          sha:      data.sha,
          version,
          content,
          html_url: data.html_url,
        },
      });
    }

    // List all spec versions for a feature (directory listing)
    const r = await fetch(`${GH_BASE}/specs/${feature}`, { headers: ghHeaders() });
    if (r.status === 404) return res.json({ specs: [] });
    if (!r.ok) return res.status(500).json({ error: 'GitHub listing failed' });
    const files = await r.json();
    const specs = (Array.isArray(files) ? files : [])
      .filter(function(f) { return f.type === 'file' && f.name.endsWith('.md'); })
      .map(function(f) {
        return {
          version: f.name.replace(/\.md$/, ''),
          sha:     f.sha,
          path:    f.path,
          size:    f.size,
        };
      });
    return res.json({ specs });
  }

  // ── POST — create new spec file ───────────────────────────────────────────
  if (req.method === 'POST') {
    const { feature: feat, version: ver, content, message } = req.body || {};
    if (!feat || !ver || !content) {
      return res.status(400).json({ error: 'feature, version, and content are required' });
    }
    const path    = `specs/${feat}/${ver}.md`;
    const encoded = Buffer.from(content, 'utf8').toString('base64');
    const r = await fetch(`${GH_BASE}/${path}`, {
      method: 'PUT',
      headers: ghHeaders(),
      body: JSON.stringify({
        message: message || `spec: add ${feat}/${ver}`,
        content: encoded,
      }),
    });
    if (r.status === 422) {
      return res.status(409).json({ error: 'Spec version already exists' });
    }
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(500).json({ error: err.message || 'GitHub write failed' });
    }
    const data = await r.json();
    return res.status(201).json({
      ok:   true,
      spec: { path, version: ver, sha: data.content && data.content.sha },
    });
  }

  // ── PATCH — update existing spec file ────────────────────────────────────
  if (req.method === 'PATCH') {
    const { feature: feat, version: ver, content, sha, message } = req.body || {};
    if (!feat || !ver || !content || !sha) {
      return res.status(400).json({ error: 'feature, version, content, and sha are required' });
    }
    const path    = `specs/${feat}/${ver}.md`;
    const encoded = Buffer.from(content, 'utf8').toString('base64');
    const r = await fetch(`${GH_BASE}/${path}`, {
      method: 'PUT',
      headers: ghHeaders(),
      body: JSON.stringify({
        message: message || `spec: update ${feat}/${ver}`,
        content: encoded,
        sha,
      }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(500).json({ error: err.message || 'GitHub update failed' });
    }
    const data = await r.json();
    return res.json({
      ok:   true,
      spec: { path, version: ver, sha: data.content && data.content.sha },
    });
  }

  res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[specs] Request failed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
