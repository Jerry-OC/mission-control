// /api/jobs — Live JobTread active jobs
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=120'); // cache 2 min

  try {
    const response = await fetch('https://api.jobtread.com/pave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        "$": { "grantKey": process.env.JOBTREAD_GRANT_KEY },
        "organization": {
          "id": "22NeVb7CK2sW",
          "jobs": {
            "$": {
              "filter": { "statuses": ["approved"] },
              "onPage": 1,
              "rowsPerPage": 20
            },
            "id": true,
            "name": true,
            "number": true,
            "status": true,
            "customer": { "name": true },
            "location": { "name": true },
            "totalContractValue": true,
            "totalBilled": true,
            "totalPaid": true,
            "totalOwed": true,
            "totalActualCost": true,
            "totalBudgetedCost": true
          }
        }
      })
    });

    const data = await response.json();
    const jobs = data?.organization?.jobs || [];

    res.json({
      jobs: jobs.map(j => ({
        id: j.id,
        name: j.name,
        number: j.number,
        status: j.status,
        customer: j.customer?.name || '',
        location: j.location?.name || '',
        contractValue: j.totalContractValue || 0,
        billed: j.totalBilled || 0,
        paid: j.totalPaid || 0,
        owed: j.totalOwed || 0,
        actualCost: j.totalActualCost || 0,
        budgetedCost: j.totalBudgetedCost || 0
      })),
      total: jobs.length,
      totalValue: jobs.reduce((sum, j) => sum + (j.totalContractValue || 0), 0)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
