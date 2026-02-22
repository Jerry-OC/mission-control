// /api/invoices — Live JobTread open invoices
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=120');

  try {
    const response = await fetch('https://api.jobtread.com/pave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        "$": { "grantKey": process.env.JOBTREAD_GRANT_KEY },
        "organization": {
          "id": "22NeVb7CK2sW",
          "documents": {
            "$": {
              "filter": {
                "types": ["invoice"],
                "statuses": ["draft", "sent"]
              },
              "onPage": 1,
              "rowsPerPage": 50
            },
            "id": true,
            "name": true,
            "number": true,
            "status": true,
            "type": true,
            "total": true,
            "totalPaid": true,
            "totalOwed": true,
            "date": true,
            "job": { "id": true, "name": true }
          }
        }
      })
    });

    const data = await response.json();
    const docs = data?.organization?.documents || [];

    const invoices = docs.filter(d => d.type === 'invoice');
    const totalOwed = invoices.reduce((sum, d) => sum + (d.totalOwed || 0), 0);

    res.json({
      invoices: invoices.map(d => ({
        id: d.id,
        name: d.name,
        number: d.number,
        status: d.status,
        total: d.total || 0,
        paid: d.totalPaid || 0,
        owed: d.totalOwed || 0,
        date: d.date,
        jobName: d.job?.name || ''
      })),
      count: invoices.length,
      totalOwed
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
