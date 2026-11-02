# Gambit Hackathon — registration site

```
index.html          the website (poster style)
assets/             logos
api/register.js     backend: receives the form and sends it to your Telegram bot
```

## What you need to prepare

1. **Telegram bot token**
   - Open Telegram → @BotFather → `/newbot` → choose a name and username.
   - Copy the token (looks like `123456789:AAH...`).
2. **Chat ID** of the place where registrations should arrive
   - Easiest: make a private group (or channel) for organisers, add your bot to it (in a channel: as admin with "post messages").
   - Send any message in the group, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` in the browser and find `"chat":{"id":-100...}`. That number (with the minus) is the chat ID.
   - For personal messages: write `/start` to your bot, then use the same `getUpdates` link and take `"from":{"id":...}`.
3. **A free hosting account** (Vercel is the simplest) and, optionally, a domain.

## Deploy on Vercel (about 5 minutes)

1. Put this folder in a GitHub repo (or use `npx vercel` from the folder).
2. vercel.com → Add New Project → import the repo → Deploy.
3. Project → Settings → Environment Variables, add:
   - `TELEGRAM_BOT_TOKEN` = your bot token
   - `TELEGRAM_CHAT_ID` = your chat id
4. Redeploy (Deployments → ⋯ → Redeploy). Open the site and submit a test team.

**Never** put the bot token inside `index.html` — anyone could read it and take over the bot. It must stay in the environment variables only.

## Good to know

- Registration closes automatically after **10 November 2026, 23:59 Aktobe time** (both on the site and on the server). To change it, edit `DEADLINE` in `api/register.js` and in `index.html`.
- Each registration arrives in Telegram as one message with team, school, 2–4 names, email, phone and captain's Telegram.
- Simple spam protection is included (hidden field and minimum fill time).
- Telegram messages are the only storage. If you want a table with all teams (Google Sheets) or duplicate-team checks, that can be added later.
