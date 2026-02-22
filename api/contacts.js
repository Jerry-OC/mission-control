// api/contacts.js — Contacts CRM (Supabase backend)
const PROJECT = 'evfgrjslfrjwyopyzqzx';
const SB_BASE = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (Array.isArray(v)) {
    if (!v.length) return "'{}'";
    return `ARRAY[${v.map(x => `'${String(x).replace(/'/g,"''")}'`).join(',')}]::text[]`;
  }
  return `'${String(v).replace(/'/g,"''")}'`;
}

async function sql(query) {
  const res = await fetch(SB_BASE, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_MGMT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (data.error || data.message) throw new Error(data.error?.message || data.message);
  return Array.isArray(data) ? data : [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // GET — list/search
    if (req.method === 'GET') {
      const { search, type, trade, unverified, limit = 200 } = req.query;
      const id = req.query.id;

      if (id) {
        const rows = await sql(`SELECT * FROM contacts WHERE id = ${esc(id)}`);
        return res.json({ contact: rows[0] || null });
      }

      const wheres = ['is_active = TRUE'];
      if (search) {
        const s = search.replace(/'/g,"''");
        wheres.push(`(first_name ILIKE '%${s}%' OR last_name ILIKE '%${s}%' OR company ILIKE '%${s}%' OR phone LIKE '%${s}%' OR email ILIKE '%${s}%')`);
      }
      if (type)  wheres.push(`${esc(type)} = ANY(types)`);
      if (trade) wheres.push(`${esc(trade)} = ANY(trades)`);
      if (unverified === 'true') wheres.push('is_verified = FALSE');

      const rows = await sql(`
        SELECT * FROM contacts
        WHERE ${wheres.join(' AND ')}
        ORDER BY last_name NULLS LAST, first_name NULLS LAST
        LIMIT ${parseInt(limit)}
      `);
      return res.json({ contacts: rows, total: rows.length });
    }

    // POST — create
    if (req.method === 'POST') {
      const b = req.body;
      const fields = {};
      const allowed = ['first_name','last_name','phone','phone_alt','email','email_alt',
        'company','title','address','city','state','zip','types','trades',
        'license_number','license_expiry','coi_expiry','coi_amount',
        'source','rating','notes','tags','is_verified','is_active'];
      allowed.forEach(k => { if (b[k] !== undefined) fields[k] = b[k]; });

      const cols = Object.keys(fields).join(', ');
      const vals = Object.values(fields).map(esc).join(', ');
      const rows = await sql(`INSERT INTO contacts (${cols}) VALUES (${vals}) RETURNING *`);
      return res.json({ ok: true, contact: rows[0] });
    }

    // PATCH — update
    if (req.method === 'PATCH') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const b = req.body;
      const allowed = ['first_name','last_name','phone','phone_alt','email','email_alt',
        'company','title','address','city','state','zip','types','trades',
        'license_number','license_expiry','coi_expiry','coi_amount',
        'source','rating','notes','tags','is_verified','is_active'];
      const updates = [];
      allowed.forEach(k => { if (b[k] !== undefined) updates.push(`${k} = ${esc(b[k])}`); });
      if (!updates.length) return res.status(400).json({ error: 'nothing to update' });
      const rows = await sql(`UPDATE contacts SET ${updates.join(', ')} WHERE id = ${esc(id)} RETURNING *`);
      return res.json({ ok: true, contact: rows[0] });
    }

    // DELETE
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await sql(`UPDATE contacts SET is_active = FALSE WHERE id = ${esc(id)}`);
      return res.json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('contacts API error:', err);
    res.status(500).json({ error: err.message });
  }
}
