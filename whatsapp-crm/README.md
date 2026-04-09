# WhatsApp CRM (Iraqi Business Outreach)

Node.js + TypeScript CLI to run bulk WhatsApp campaigns for Iraqi businesses using Nabda OTP API and Supabase.

## Features

- Load contacts from **Supabase** (`businesses`) where `whatsapp_status IS NULL`
- Or load contacts from local **CSV** (`name,phone`)
- Strategies A/B/C with `{name}` personalization
- Optional custom template file via `--template`
- Human-like timing engine:
  - Base delay + random variance
  - Hard minimum 8 seconds between sends
  - Batch pause support
  - Optional typing simulation (`/typing`)
- Robust send loop (continues on failures)
- Supabase status updates after every attempt
- CSV append logging (`campaign_log.csv`)
- Live progress output + summary every 10 sends
- Webhook listener for Strategy B follow-up replies
- Commands: `send`, `reset`, `stats`, `test`

## Setup

```bash
cd whatsapp-crm
npm install
cp .env.example .env
# update .env with your credentials
```

## Environment variables

- `NABDA_BASE_URL`
- `NABDA_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_TABLE` (default `businesses`)
- `WEBHOOK_PORT` (default `3001`)
- `CAMPAIGN_LOG_PATH` (default `campaign_log.csv`)

## Run (dev)

```bash
npx ts-node src/index.ts send \
  --strategy=A \
  --limit=50 \
  --delay=20 \
  --variance=10 \
  --batch=20 \
  --batch-pause=180 \
  --source=supabase \
  --dry-run
```

### CSV source example

```bash
npx ts-node src/index.ts send \
  --source=csv \
  --csv=contacts.csv \
  --strategy=C
```

### Start send with webhook (Strategy B)

```bash
npx ts-node src/index.ts send --strategy=B --webhook
```

Webhook endpoint:

- `POST http://localhost:3001/webhook`

If incoming message includes `نعم` or `yes` (case-insensitive), the tool sends Strategy B follow-up and sets status to `replied`.

## Other commands

```bash
npx ts-node src/index.ts reset
npx ts-node src/index.ts stats
npx ts-node src/index.ts test --phone=9647701234567
```

## Build for production

```bash
npm run build
node dist/index.js stats
```

## Notes

- Keep credentials only in `.env`.
- Phone numbers are normalized to digits and must start with `964`.
- Campaign gracefully handles `Ctrl+C` and prints a summary.
- `ensureColumns()` attempts SQL migration via available Supabase RPC helper functions (`exec_sql`/`run_sql`). If not available, create the columns manually:

```sql
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS whatsapp_status TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS whatsapp_sent_at TIMESTAMPTZ;
```

## Vercel deployment notes

This repository is **not a Next.js app** and is also **not a Vite frontend**. It is a Node.js TypeScript CLI tool with an optional Express webhook listener.

If you deploy from Vercel, use these project settings:

- **Root Directory:** `whatsapp-crm`
- **Framework Preset:** `Other`
- **Build Command:** `npm run build`
- **Output Directory:** *(leave empty)*

If your Vercel project currently points to the repository root (`/`) with Framework Preset `Next.js`, Vercel will fail with “Could not identify Next.js version” / “No Next.js version detected” because there is no `next` dependency and no Next.js app in this repository.

For webhook hosting, this project may require a traditional Node host (or additional serverless adaptation) rather than the default static deployment flow.
