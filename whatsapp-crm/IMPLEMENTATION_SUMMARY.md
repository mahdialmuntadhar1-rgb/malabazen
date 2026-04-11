# WhatsApp CRM - Implementation Summary

## Security Alert
**The Nabda token has been exposed twice in chat.** Treat it as compromised and rotate immediately:
1. Go to Nabda Dashboard → Instances → #e01ed90e → Credentials
2. Click to regenerate the token
3. Update your `.env` file with the new token

## 1. Diagnosis

The WhatsApp CRM had these issues:
- Hardcoded secrets in `.env.example`
- Inconsistent phone normalization
- Missing database tables (only had `businesses`, needed `contacts`, `messages`, `campaigns`, etc.)
- Webhook handler didn't match actual Nabda payload format
- No proper message tracking or inbox functionality
- Frontend wasn't connected to real backend API

## 2. Root Causes

1. **Schema mismatch**: Backend used `businesses` table, frontend expected `contacts`
2. **Phone format chaos**: Different formats across the codebase (0770..., 964..., +964...)
3. **Webhook format**: Assumed flat payload, Nabda actually uses nested `payload` object
4. **Missing infrastructure**: No proper API routes, no message storage, no event tracking

## 3. Files Changed

### Core Backend Files
| File | Changes |
|------|---------|
| `src/nabda.ts` | Complete rewrite with proper Iraqi phone normalization, bulk sending, retry logic |
| `src/types.ts` | Added comprehensive types: `Contact`, `Campaign`, `Message`, `MessageEvent`, `PhoneValidationResult`, `BulkSendResult` |
| `src/supabase-service.ts` | **NEW** Full CRUD operations for all tables |
| `src/api-routes.ts` | **NEW** Express API routes for frontend integration |
| `src/api-server.ts` | **NEW** Standalone API server entry point |

### Webhook/Cloud Functions
| File | Changes |
|------|---------|
| `functions/api/webhook.ts` | Complete rewrite to handle actual Nabda payload format with nested `payload` object |
| `functions/_shared/types.ts` | Added `PagesFunction` type definition |

### Configuration
| File | Changes |
|------|---------|
| `.env.example` | Removed all real credentials, added placeholders with instructions |
| `apps/web/.env.example` | **NEW** Frontend environment template |

### Database
| File | Changes |
|------|---------|
| `sql/001_initial_schema.sql` | **NEW** Complete schema with all tables, indexes, triggers, views |

## 4. SQL Migrations

Run this in Supabase SQL Editor:

```sql
-- 001_initial_schema.sql (included in this repo)
-- Creates tables:
--   - contacts (main contact table with normalized_phone)
--   - message_templates (with default templates for strategies A, B, C)
--   - campaigns (campaign management)
--   - campaign_contacts (junction table)
--   - messages (all inbound/outbound messages)
--   - message_events (webhook event tracking)
--   - webhook_logs (audit trail)
-- Plus: indexes, triggers, views
```

## 5. Environment Variables Required

### Backend (`/.env`)
```bash
NABDA_BASE_URL=https://api.nabdaotp.com/inst/e01ed90e-1e03-4746-861a-c0a5d45e0d7e
NABDA_TOKEN=YOUR_NEW_TOKEN_HERE  # ROTATE THE EXPOSED ONE!
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
API_PORT=3002
WEBHOOK_PORT=3001
```

### Frontend (`/apps/web/.env`)
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## 6. Phone Normalization

The system now accepts and normalizes all these formats:
- `0770...` → `+964770...` 
- `770...` → `+964770...`
- `964770...` → `+964770...`
- `+964770...` → `+964770...`
- `00964770...` → `+964770...`

**Validation rules:**
- Must be Iraqi mobile (starts with 7 after country code)
- Total length: 13 digits (964 + 10 digits)
- Deduplication happens automatically

## 7. Webhook Events Handled

Based on your Nabda dashboard, these events are supported:

| Event | Handler Action |
|-------|---------------|
| `message.sent` | Creates outbound message record, updates contact status |
| `message.received` | Creates inbound message, stores reply, triggers Strategy B follow-up if positive response |
| `message.ack` | Updates message delivery status (delivered/read/failed) |

## 8. API Endpoints Available

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | System health check |
| GET | `/api/readiness` | Environment variable check |
| GET | `/api/contacts` | List contacts with filtering |
| POST | `/api/contacts` | Create new contact |
| PATCH | `/api/contacts/:id` | Update contact |
| DELETE | `/api/contacts/:id` | Delete contact |
| POST | `/api/send-message` | Send single WhatsApp message |
| POST | `/api/send-bulk` | Send bulk messages with pacing |
| GET | `/api/campaigns` | List campaigns |
| POST | `/api/campaigns` | Create campaign |
| GET | `/api/templates` | List message templates |
| POST | `/api/templates` | Create template |
| GET | `/api/inbox` | Get conversations view |
| GET | `/api/stats` | Get campaign statistics |
| POST | `/api/validate-phones` | Validate/normalize phone numbers |

## 9. How to Run Locally

### 1. Install dependencies
```bash
cd whatsapp-crm
npm install
```

### 2. Set up environment
```bash
cp .env.example .env
# Edit .env with your actual values (use NEW rotated token!)
```

### 3. Run database migration
- Open Supabase SQL Editor
- Copy contents of `sql/001_initial_schema.sql`
- Run the script

### 4. Start API server
```bash
npm run api
# or
npx ts-node src/api-server.ts
```

### 5. Test single send
```bash
curl -X POST http://localhost:3002/api/send-message \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "07701995386",
    "message": "Test message from API"
  }'
```

## 10. How to Test Webhook Locally

### Option A: Cloudflare Pages (Production)
1. Deploy to Cloudflare Pages
2. Set environment variables in Cloudflare dashboard
3. Configure webhook URL in Nabda dashboard: `https://your-site.pages.dev/api/webhook`
4. Enable webhook and check "message.received" event

### Option B: Local Tunnel (Development)
```bash
# Install cloudflared
npm install -g cloudflared

# Create tunnel
cloudflared tunnel --url http://localhost:3002

# Use the https URL + /api/webhook in Nabda dashboard
```

## 11. Remaining Issues

### Must Fix Before Production
1. **Rotate the exposed Nabda token** (critical)
2. Run the SQL migration in Supabase
3. Test the webhook with actual Nabda events
4. Frontend App.tsx still needs to be updated to use the real API

### Frontend Updates Needed
The current `App.tsx` still uses Supabase client directly. It needs:
- Integration with `/api/send-message` for test sends
- Integration with `/api/send-bulk` for campaigns
- Integration with `/api/inbox` for replies display
- Real-time updates for message status

### Nice to Have
- CSV import endpoint
- Campaign pause/resume
- Message retry for failed sends
- Webhook signature verification (if Nabda supports it)

## 12. Final Verdict

**Status: PARTIALLY WORKING - Core infrastructure complete, integration testing needed**

### What's Working
- Phone normalization with all Iraqi formats
- Nabda service with retry logic and bulk sending
- Complete database schema
- API routes for all CRUD operations
- Webhook handler matching actual Nabda format
- Cloud function ready for deployment

### What Needs Testing
- Actual message send through API
- Webhook receiving from Nabda
- Database writes from webhook
- Frontend integration (needs separate work)

### Next Steps (Priority Order)
1. **URGENT**: Rotate the exposed Nabda token
2. Run SQL migration in Supabase
3. Set up environment variables
4. Test single message send via API
5. Deploy webhook to Cloudflare Pages
6. Configure webhook URL in Nabda dashboard
7. Send test message and verify webhook receives it
8. Update frontend to use API routes

## 13. Testing Checklist

- [ ] SQL migration executed successfully
- [ ] Environment variables configured
- [ ] API server starts without errors
- [ ] POST /api/send-message returns success
- [ ] Message appears in Supabase `messages` table
- [ ] Webhook endpoint responds to GET with status OK
- [ ] Nabda webhook configured and enabled
- [ ] Test message triggers webhook event
- [ ] Inbound message stored in database
- [ ] Reply appears in inbox/conversations view

---

**Summary**: The core plumbing is fixed and ready. The system now properly handles Iraqi phone numbers, stores all message events, and matches the actual Nabda webhook format. The main blocker is the exposed token - rotate that first, then run through the testing checklist.
