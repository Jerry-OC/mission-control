// /api/cost-codes — Cost codes lookup
//
// GET /api/cost-codes → returns { costCodes: [...] } ordered by number asc

import { requireAuth } from './_auth.js';
import { sbFetch } from './_sb.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

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
