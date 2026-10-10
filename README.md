# Kharcha Coach

Finds the subscriptions and recurring payments hiding in a bank statement, then lets an AI agent (Claude) answer money questions using the user's own numbers.

## Run it

```bash
npm install
copy .env.example .env     # paste your ANTHROPIC_API_KEY into .env
node make-demo.mjs         # writes demo-statement.csv (dates relative to today)
npm start                  # http://localhost:8787
```

Open http://localhost:8787 (not the HTML file directly) so the page can reach the AI server. Without a key the page still works with a built-in rule-based coach.

## What it does

| Feature | Where |
|---|---|
| Recurring payment finder: weekly / monthly / quarterly / yearly, price hikes, renewals, lapsed items, tick-to-cancel savings | `kharcha-coach.html` |
| Heads-up alerts: overlapping services, new subscriptions, duplicate charges | `kharcha-coach.html` |
| Month-by-month spend, biggest movers, per-category budgets, savings goals | `kharcha-coach.html` |
| Heads-up nudges (renewals, price hikes, budgets) with one-tap "Ask Coach"; renewal calendar with `.ics` export and a reminder the day before | `kharcha-coach.html` |
| First-visit tour (re-open with "Take a tour") | `kharcha-coach.html` |
| Needs / wants / savings split against the 50/30/20 guide | `kharcha-coach.html` |
| Agent charts drawn inside the chat (the agent calls `show_chart`) | `tools.mjs`, `server.mjs` |
| "Negotiate" button on each subscription drafts a message asking for a better price | agent, with an offline template |
| Ask by voice (mic button, English or Hindi) | browser speech recognition |
| Bank format detection: HDFC, SBI, ICICI, Axis, Kotak | `kharcha-coach.html` |
| "Share my month" image card (download or native share) | `kharcha-coach.html` |
| "Hide amounts" privacy mode for demos | `kharcha-coach.html` |
| Installable app (PWA) with offline fallback; API calls are never cached | `manifest.webmanifest`, `sw.js` |
| AI agent with tools (overview, transaction search, recurring list, what-if, goal planner) | `server.mjs`, `tools.mjs` |
| Floating "Ask Coach" chat button on every part of the page (Esc closes it), weekly briefing, cancel help, English / Hinglish / Hindi replies | agent |
| "Sort Other with AI": labels unplaced merchants, then re-detects recurring payments | `/api/classify` |
| Upload a PDF or screenshot of a statement | `/api/extract` |
| Saves the statement, budgets and goals in this browser only; "Forget my data" clears them | `localStorage` |

Privacy: the browser posts the statement to your own server per question. Claude only sees what the tools return, not the whole statement. Nothing is stored server-side.

## 2-minute demo script

1. Click **Load demo statement**. Point at the KPIs: spend, savings rate, recurring cost per month.
2. **Recurring payments**: Netflix price hike (₹649 → ₹799), Spotify renewing in 3 days, JioHotstar lapsed (left out of totals). Tick two to cancel and show the yearly savings.
3. **Heads-up alerts**: overlapping music and video services, ChatGPT as a new charge, the double Cult.fit charge.
4. Click **Sort "Other" with AI**: unplaced UPI merchants get categories and the list updates.
5. Click **Weekly briefing** and watch the tool chips appear while the answer streams. Switch to **Hinglish** and ask "Can I afford a ₹40,000 trip in 3 months?".
6. Set a Food budget and add a Goa trip goal to show the budget status and monthly target.
7. Close with privacy: data stays in the browser, **Forget my data** wipes it.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Required for the AI features |
| `KHARCHA_MODEL` | `claude-opus-5-5` | Model used by every AI call |
| `PORT` / `HOST` | `8787` / `127.0.0.1` | Set `HOST=0.0.0.0` when deploying |
| `ALLOWED_HOSTS` | none | Public hostname(s), comma separated. Requests with other `Host` headers are rejected |
| `RATE_PER_HOUR` | `60` | Per-IP budget (agent = 1, classify = 2, PDF/screenshot = 5) |
| `DAILY_CAP` | `3000` | Global units per day: a hard ceiling on spend |
| `TRUST_PROXY` | off | Set to `1` behind a proxy so the rate limit sees real client IPs |

## Deploy

Any host that runs a Docker image or Node 22 works (Render, Railway, Fly.io, Cloud Run).

1. Push this folder to a Git repo (`.env` and `node_modules` are ignored).
2. Create a web service from the `Dockerfile`.
3. Set `ANTHROPIC_API_KEY`, `ALLOWED_HOSTS=<your-app-hostname>` and optionally `DAILY_CAP`.
4. Open the URL and run the demo script.

The page is public once deployed, so keep `DAILY_CAP` low and set a spend limit on the API key in the Anthropic Console.

## Tests

```bash
npm test    # tool maths + the page's real CSV parsing, bank formats and recurring detection
```
