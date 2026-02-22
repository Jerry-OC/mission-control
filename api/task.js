// /api/task — Receive a task from Siri Shortcut and message Jerry via Telegram
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const task = (body.task || body.text || body.message || '').trim();
  if (!task) return res.status(400).json({ error: 'No task provided' });

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return res.status(500).json({ error: 'Bot not configured' });
  }

  const message = `📋 *Siri Task*\n${task}`;

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown'
    })
  });

  const result = await response.json();
  if (!result.ok) return res.status(500).json({ error: result.description });

  return res.json({ ok: true, message: 'Task sent to Jerry' });
}
