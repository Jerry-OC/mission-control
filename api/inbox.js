// /api/inbox — Uncoded Plaid transactions from Airtable
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=120');

  const BASE = 'appJ5EwxK3qWT9lqx';
  const TABLE = 'tblowTzY9J7erRfv3';

  try {
    // Fetch transactions where Job is empty (uncoded)
    const params = new URLSearchParams({
      filterByFormula: `{Job} = ""`,
      'fields[]': ['Name', 'Amount', 'Date', 'Account'],
      pageSize: '100',
      sort: JSON.stringify([{ field: 'Date', direction: 'desc' }])
    });

    const response = await fetch(
      `https://api.airtable.com/v0/${BASE}/${TABLE}?${params}`,
      { headers: { 'Authorization': `Bearer ${process.env.AIRTABLE_PAT}` } }
    );

    const data = await response.json();
    const records = data.records || [];

    const transactions = records.map(r => ({
      id: r.id,
      name: r.fields.Name || '',
      amount: r.fields.Amount || 0,
      date: r.fields.Date || '',
      account: r.fields.Account || ''
    }));

    res.json({
      transactions,
      count: transactions.length,
      totalAmount: transactions.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
