import express, { Request, Response } from 'express';
import { NabdaClient } from './nabda.js';
import { CampaignLogger } from './logger.js';
import { SupabaseService, normalizePhone } from './supabase.js';
import { getStrategyBFollowupTemplate, renderTemplate } from './templates.js';
import { WebhookPayload } from './types.js';

function extractIncomingMessage(payload: WebhookPayload): { body: string; phone: string } | null {
  const body = String(payload.message?.body ?? payload.body ?? '').trim();
  const rawPhone = String(payload.message?.from ?? payload.message?.phone ?? payload.from ?? payload.phone ?? '').trim();
  const phone = normalizePhone(rawPhone);

  if (!body || !phone) {
    return null;
  }

  return { body, phone };
}

export function startWebhookServer(
  port: number,
  supabase: SupabaseService,
  nabda: NabdaClient,
  logger: CampaignLogger
): void {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/webhook', async (req: Request, res: Response) => {
    const payload = req.body as WebhookPayload;
    logger.info(`Webhook received: ${JSON.stringify(payload)}`);

    const incoming = extractIncomingMessage(payload);
    if (!incoming) {
      res.status(200).json({ ok: true, ignored: true });
      return;
    }

    const trigger = incoming.body.toLowerCase().includes('yes') || incoming.body.includes('نعم');
    if (!trigger) {
      res.status(200).json({ ok: true, ignored: true });
      return;
    }

    try {
      const contact = await supabase.findContactByPhone(incoming.phone);
      if (!contact) {
        logger.warn(`No contact found for reply phone ${incoming.phone}`);
        res.status(200).json({ ok: true, ignored: true });
        return;
      }

      const message = renderTemplate(getStrategyBFollowupTemplate(), contact.name);
      const sendResult = await nabda.sendMessage(contact.phone, message);

      if (sendResult.ok) {
        await supabase.updateStatus(contact, 'replied', new Date().toISOString());
        logger.success(`Follow-up sent to ${contact.name} (${contact.phone})`);
      } else {
        logger.error(`Follow-up failed for ${contact.phone}: ${sendResult.status} ${sendResult.body}`);
      }
    } catch (error) {
      logger.error(`Webhook processing error: ${error instanceof Error ? error.message : String(error)}`);
    }

    res.status(200).json({ ok: true });
  });

  app.listen(port, () => {
    logger.info(`Webhook listener running on http://localhost:${port}/webhook`);
  });
}
