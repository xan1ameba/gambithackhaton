// Vercel serverless function: receives a registration and sends it to Telegram.
// The bot token lives ONLY in environment variables, never in the website code.
//
// Required env vars (Vercel -> Project -> Settings -> Environment Variables):
//   TELEGRAM_BOT_TOKEN  - token from @BotFather
//   TELEGRAM_CHAT_ID    - id of the chat/group/channel that receives registrations

const DEADLINE = new Date('2026-11-10T23:59:59+05:00'); // end of 10 Nov, Aktobe time

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const clean = (v, max) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Where registrations go (set any of them in Vercel -> Environment Variables):
  //   GOOGLE_SCRIPT_URL                      -> a row in Google Sheets
  //   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID  -> a message in Telegram (chat ids may be separated by commas)
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const sheetUrl = process.env.GOOGLE_SCRIPT_URL;
  const useTelegram = Boolean(token && chatId);
  if (!useTelegram && !sheetUrl) {
    console.error('Nothing configured: set GOOGLE_SCRIPT_URL and/or TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID');
    return res.status(500).json({ error: 'Server is not configured yet.' });
  }

  if (Date.now() > DEADLINE.getTime()) {
    return res.status(403).json({ closed: true, error: 'Registration is closed.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid request.' });
  }

  // Bots: filled honeypot or form submitted impossibly fast -> pretend success, send nothing.
  if (body.website || (Number(body.elapsed) || 0) < 3000) {
    return res.status(200).json({ ok: true });
  }

  const d = {
    teamName: clean(body.teamName, 60),
    school: clean(body.school, 160),
    member1: clean(body.member1, 80),
    member2: clean(body.member2, 80),
    member3: clean(body.member3, 80),
    member4: clean(body.member4, 80),
    email: clean(body.email, 120),
    phone: clean(body.phone, 24),
    telegram: clean(body.telegram, 40),
  };

  const tg = d.telegram.replace(/^@/, '');
  const phoneDigits = d.phone.replace(/\D/g, '');
  const problems = [];
  if (d.teamName.length < 2) problems.push('team name');
  if (d.school.length < 2) problems.push('school');
  for (const k of ['member1', 'member2']) if (d[k].length < 3) problems.push(k);
  for (const k of ['member3', 'member4']) if (d[k] && d[k].length < 3) problems.push(k);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) problems.push('email');
  if (phoneDigits.length < 10 || phoneDigits.length > 15) problems.push('phone');
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(tg)) problems.push('telegram');
  if (problems.length) {
    return res.status(400).json({ error: 'Please check: ' + problems.join(', ') + '.' });
  }

  const time = new Date().toLocaleString('en-GB', {
    timeZone: 'Asia/Aqtobe', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  const members = [d.member1, d.member2, d.member3, d.member4].filter(Boolean);

  const text =
    '🆕 <b>New team registered</b>\n\n' +
    '🏷 <b>Team:</b> ' + esc(d.teamName) + '\n' +
    '🏫 <b>School:</b> ' + esc(d.school) + '\n\n' +
    '👥 <b>Members (' + members.length + ')</b>\n' +
    members.map((m, i) => (i + 1) + '. ' + esc(m) + (i === 0 ? ' (captain)' : '')).join('\n') + '\n\n' +
    '📧 ' + esc(d.email) + '\n' +
    '📞 ' + esc(d.phone) + '\n' +
    '✈️ @' + esc(tg) + '\n\n' +
    '🕒 ' + esc(time);

  const sendToSheet = async () => {
    const r = await fetch(sheetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...d, members: members.length, telegram: '@' + tg }),
      redirect: 'follow',
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error('sheet: ' + r.status + ' ' + JSON.stringify(j));
  };

  // TELEGRAM_CHAT_ID may hold several ids separated by commas: "-1001111111111,123456789,987654321"
  const chatIds = useTelegram ? chatId.split(/[,\s;]+/).filter(Boolean) : [];

  const sendTo = async (id) => {
    const r = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: id,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error('chat ' + id + ': ' + r.status + ' ' + JSON.stringify(j));
  };

  const jobs = chatIds.map(sendTo);
  if (sheetUrl) jobs.push(sendToSheet());
  const results = await Promise.allSettled(jobs);
  results.forEach((r) => { if (r.status === 'rejected') console.error('Send error:', r.reason && r.reason.message); });

  // Success if at least one place (sheet or chat) received the registration.
  if (results.some((r) => r.status === 'fulfilled')) {
    return res.status(200).json({ ok: true });
  }
  return res.status(502).json({ error: 'Could not send the registration. Please try again in a minute.' });
};
