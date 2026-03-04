// /api/cost-codes — Cost codes lookup
//
// GET /api/cost-codes → returns { costCodes: [...] } ordered by number asc

import { requireAuth, corsMiddleware } from './_auth.js';
import { sbFetch } from './_sb.js';

export default async function handler(req, res) {
  if (!corsMiddleware(req, res, 'GET, OPTIONS')) return;
  if (!requireAuth(req, res)) return;

  if (req.method === 'GET') {
    try {
      const raw = await sbFetch('/cost_codes?select=id,name,number,category&order=number.asc');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.status(200).json({ costCodes: raw || [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
