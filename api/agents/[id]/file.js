// GET /api/agents/[id]/file?path=SOUL.md
// Returns content of an .md file from the agent's workspace directory.
import { requireAuth } from '../../_auth.js';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';

const WORKSPACES = {
  jerry:  '/Users/jerryopenclaw/.openclaw/workspace',
  mickey: '/Users/jerryopenclaw/.openclaw/workspace-mickey',
  phil:   '/Users/jerryopenclaw/.openclaw/workspace-phil',
  bobby:  '/Users/jerryopenclaw/.openclaw/workspace-bobby',
  daisy:  '/Users/jerryopenclaw/.openclaw/workspace-daisy',
};

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { id, path: filePath } = req.query;

  if (!id || !WORKSPACES[id]) {
    return res.status(404).json({ error: 'Unknown agent id' });
  }
  if (!filePath) {
    return res.status(400).json({ error: 'Missing path query param' });
  }
  if (!filePath.endsWith('.md')) {
    return res.status(400).json({ error: 'Only .md files are allowed' });
  }
  if (filePath.includes('../') || filePath.includes('..\\') || filePath.includes('\0')) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  const workspace = WORKSPACES[id];
  const fullPath  = resolve(join(workspace, filePath));

  // Ensure resolved path stays within the workspace directory
  if (!fullPath.startsWith(workspace + '/') && fullPath !== workspace) {
    return res.status(400).json({ error: 'Path traversal not allowed' });
  }

  try {
    const content = await readFile(fullPath, 'utf8');
    return res.json({ content, path: filePath, exists: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.json({ content: null, path: filePath, exists: false });
    }
    return res.status(500).json({ error: err.message });
  }
}
