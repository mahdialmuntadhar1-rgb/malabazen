import { CampaignLogger } from './logger.js';
import { NabdaClient } from './nabda.js';
import { SupabaseService } from './supabase.js';
import { calculateDelaySeconds, calculateEtaSeconds, formatDuration, HARD_MIN_SECONDS, isBatchBoundary, sleep } from './timing.js';
import { renderTemplate } from './templates.js';
import { Contact, SendOptions } from './types.js';

export async function runCampaign(
  contacts: Contact[],
  template: string,
  opts: SendOptions,
  supabase: SupabaseService,
  nabda: NabdaClient,
  logger: CampaignLogger
): Promise<void> {
  let sent = 0;
  let failed = 0;
  let processed = 0;
  let stopRequested = false;
  let lastSendTimestamp = 0;

  const onSigInt = (): void => {
    stopRequested = true;
    logger.warn('\nSIGINT received. Stopping after current contact...');
  };

  process.on('SIGINT', onSigInt);
  logger.info(`Starting campaign with ${contacts.length} contacts.`);

  for (const contact of contacts) {
    if (stopRequested) {
      break;
    }

    const delaySeconds = calculateDelaySeconds({
      delaySeconds: opts.delay,
      varianceSeconds: opts.variance,
      batchSize: opts.batch,
      batchPauseSeconds: opts.batchPause,
      hardMinSeconds: HARD_MIN_SECONDS
    });

    const now = Date.now();
    const elapsedSeconds = Math.floor((now - lastSendTimestamp) / 1000);
    const mustWait = lastSendTimestamp > 0 ? Math.max(0, HARD_MIN_SECONDS - elapsedSeconds, delaySeconds) : delaySeconds;

    logger.warn(`Waiting ${mustWait}s before sending to ${contact.name} (${contact.phone})...`);
    await sleep(mustWait);

    if (Math.random() < 0.2) {
      const typingOk = await nabda.sendTyping(contact.phone);
      if (typingOk) {
        logger.info(`Typing simulation sent for ${contact.phone}`);
        await sleep(2);
      }
    }

    const message = renderTemplate(template, contact.name);
    logger.info(`Sending to ${contact.name} (+${contact.phone})...`);

    if (opts.dryRun) {
      logger.info(`[Dry-run] Message:\n${message}`);
      processed += 1;
      lastSendTimestamp = Date.now();
      await logger.logCsv({
        timestamp: new Date().toISOString(),
        business_name: contact.name,
        phone: contact.phone,
        status: 'dry_run',
        error_message: '',
        delay_seconds: mustWait
      });
      continue;
    }

    const response = await nabda.sendMessage(contact.phone, message);
    const sentAt = new Date().toISOString();

    if (response.ok && (response.status === 200 || response.status === 201)) {
      sent += 1;
      logger.success(`Sent to ${contact.name} (${contact.phone})`);
      await supabase.updateStatus(contact, 'sent', sentAt);

      await logger.logCsv({
        timestamp: sentAt,
        business_name: contact.name,
        phone: contact.phone,
        status: 'sent',
        error_message: '',
        delay_seconds: mustWait
      });
    } else {
      failed += 1;
      logger.error(`Failed ${contact.phone}: HTTP ${response.status} ${response.body}`);
      await supabase.updateStatus(contact, 'failed');

      await logger.logCsv({
        timestamp: sentAt,
        business_name: contact.name,
        phone: contact.phone,
        status: 'failed',
        error_message: `HTTP ${response.status}: ${response.body}`,
        delay_seconds: mustWait
      });
    }

    processed += 1;
    lastSendTimestamp = Date.now();

    const etaSeconds = calculateEtaSeconds(
      contacts.length - processed,
      Math.max(opts.delay + Math.floor(opts.variance / 2), HARD_MIN_SECONDS),
      opts.batch,
      opts.batchPause,
      processed
    );

    logger.printProgress(processed, contacts.length, sent, failed, etaSeconds);
    logger.printSummaryEveryTen(processed, sent, failed);

    if (isBatchBoundary(processed, opts.batch) && processed < contacts.length) {
      logger.warn(`Batch ${processed / opts.batch} complete. Pausing for ${formatDuration(opts.batchPause)}...`);
      await sleep(opts.batchPause);
    }
  }

  process.off('SIGINT', onSigInt);
  logger.info(`Campaign finished. Processed=${processed}, sent=${sent}, failed=${failed}.`);
}
