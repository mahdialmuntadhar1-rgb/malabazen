# WhatsApp CRM - Local Testing Setup

## Quick Start

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables:**
   - Already configured in `.env` file
   - Supabase URL and keys are set
   - Nabda API credentials are configured

3. **Available Commands:**

### Test Connection
```bash
npm run stats
```

### Send Test Message
```bash
npm run test -- --phone 9647XXXXXXXX --strategy A
```

### Start Webhook Server
```bash
npm run webhook
```

### Send Campaign
```bash
npm run send -- --strategy A --limit 5 --dry-run
```

### Reset All Statuses
```bash
npm run reset
```

## Directory Structure

```
crm-local-test/
  .env                    # Environment variables (configured)
  package.json           # Dependencies and scripts
  tsconfig.json          # TypeScript configuration
  src/
    index.ts            # Main CLI entry point
    supabase.ts         # Database operations
    nabda.ts           # WhatsApp API client
    sender.ts          # Message sending logic
    webhook.ts         # Webhook server
    types.ts           # Type definitions
    logger.ts          # Logging utilities
    csv-loader.ts      # CSV contact loading
    templates.ts       # Message templates
    timing.ts          # Campaign timing
```

## Webhook Server
- Runs on port 3001 by default
- Handles Strategy B follow-up messages
- Endpoint: `POST /api/webhook`

## Testing Flow
1. Test database connection with `npm run stats`
2. Send test message to verify WhatsApp API
3. Start webhook server for follow-ups
4. Run small campaign with `--dry-run` first
5. Execute actual campaign

## Environment Variables
All variables are pre-configured:
- SUPABASE_URL: https://ujdsxzvvgaugypwtugdl.supabase.co
- NABDA_TOKEN: sk_40e90a8b16fa4265a8f54ea3cc96b87d
- NABDA_API_URL: https://api.nabdaotp.com/inst/84cf1e71-6f8d-4411-9e58-de6a18e6007c
