import express, { Request, Response } from 'express';
import { WebhookPayload } from './types';
import { getBusinessByPhone, updateBusinessStatus } from './supabase';
import { sendFollowUpMessage } from './sender';
import { logInfo, logSuccess, logError, logWarning } from './logger';

const app = express();
const PORT = process.env.WEBHOOK_PORT || 3001;

export function startWebhookServer(): void {
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'whatsapp-crm-webhook' });
  });

  // Main webhook endpoint
  app.post('/webhook', async (req: Request, res: Response) => {
    try {
      const payload = req.body;

      logInfo('📨 Webhook received:');
      console.log(JSON.stringify(payload, null, 2));

      // Handle Nabda OTP format
      const event = payload.event || payload.type;
      const phone = payload.phone || payload.from || payload.sender;
      const message = payload.message || payload.body || payload.text || '';
      const timestamp = payload.timestamp || new Date().toISOString();

      const webhookData: WebhookPayload = {
        event: event || 'unknown',
        phone: phone || 'unknown',
        message: message,
        timestamp: timestamp,
      };

      // Log the incoming webhook
      logInfo(`Event: ${webhookData.event}`);
      logInfo(`From: ${webhookData.phone}`);
      logInfo(`Message: ${webhookData.message.substring(0, 100)}...`);

      // Process message.received events
      if (event === 'message.received' || event === 'message') {
        await handleIncomingMessage(webhookData);
      }

      // Always acknowledge receipt quickly
      res.status(200).json({ received: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logError('Webhook', 'handler', errorMessage);
      res.status(200).json({ received: true, error: 'Processing error but acknowledged' });
    }
  });

  // Alternative endpoint for testing
  app.get('/webhook', (req: Request, res: Response) => {
    res.json({
      status: 'Webhook endpoint active',
      endpoints: {
        'POST /webhook': 'Receive WhatsApp webhooks',
        'GET /health': 'Health check',
      },
    });
  });

  app.listen(PORT, () => {
    logInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logInfo('         WEBHOOK SERVER STARTED          ');
    logInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logInfo(`Listening on port: ${PORT}`);
    logInfo(`Health check: http://localhost:${PORT}/health`);
    logInfo(`Webhook URL: http://localhost:${PORT}/webhook`);
    logInfo('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log();
    logInfo('Press Ctrl+C to stop the server');
    console.log();
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    logWarning('\nShutting down webhook server...');
    process.exit(0);
  });
}

async function handleIncomingMessage(payload: WebhookPayload): Promise<void> {
  const { phone, message } = payload;

  if (!phone || !message) {
    logWarning('Missing phone or message in webhook payload');
    return;
  }

  // Clean the phone number
  const cleanPhone = phone.replace(/\+/g, '').replace(/\s/g, '');

  // Look up the contact in Supabase
  const business = await getBusinessByPhone(cleanPhone);

  if (!business) {
    logWarning(`Contact not found in database: ${cleanPhone}`);
    return;
  }

  logInfo(`Contact found: ${business.name} (${business.phone})`);

  // Check for positive response (Strategy B follow-up trigger)
  const positiveResponses = ['نعم', 'yes', 'yeah', 'yup', 'sure', 'ok', 'تمام', 'أكيد', 'بالتأكيد'];
  const normalizedMessage = message.toLowerCase().trim();
  const isPositiveResponse = positiveResponses.some((response) =>
    normalizedMessage.includes(response.toLowerCase())
  );

  if (isPositiveResponse) {
    logInfo(`Positive response detected from ${business.name}`);

    // Send follow-up message (Strategy B message 2)
    const sent = await sendFollowUpMessage(business.phone, business.name);

    if (sent) {
      // Update status to 'replied'
      await updateBusinessStatus(business.id, 'replied', new Date().toISOString());
      logSuccess(business.name, business.phone);
    }
  } else {
    logInfo(`Message from ${business.name} not a positive response: "${message.substring(0, 50)}..."`);
  }
}

export async function testWebhookHandler(payload: WebhookPayload): Promise<void> {
  logInfo('Testing webhook handler with mock payload...');
  await handleIncomingMessage(payload);
}
