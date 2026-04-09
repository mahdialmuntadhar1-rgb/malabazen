import { Command } from 'commander';
import dotenv from 'dotenv';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CampaignLogger } from './logger.js';
import { NabdaClient } from './nabda.js';
import { runCampaign } from './sender.js';
import { SupabaseService, normalizePhone } from './supabase.js';
import { loadTemplate } from './templates.js';
import { startWebhookServer } from './webhook.js';
import { Contact, SendOptions, Strategy } from './types.js';

dotenv.config();

const program = new Command();

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

async function loadContactsFromCsv(csvPath: string, limit?: number): Promise<Contact[]> {
  const absolutePath = path.resolve(csvPath);
  const raw = await fs.readFile(absolutePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) {
    return [];
  }

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const nameIdx = header.indexOf('name');
  const phoneIdx = header.indexOf('phone');
  if (nameIdx === -1 || phoneIdx === -1) {
    throw new Error('CSV must include name and phone columns.');
  }

  const contacts: Contact[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const name = cols[nameIdx]?.trim();
    const phone = cols[phoneIdx]?.trim();

    if (!name || !phone) {
      continue;
    }

    const normalized = normalizePhone(phone);
    if (!normalized) {
      continue;
    }

    contacts.push({ name, phone: normalized });
    if (limit && limit > 0 && contacts.length >= limit) {
      break;
    }
  }

  return contacts;
}

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

program.name('whatsapp-crm').description('CLI for WhatsApp outreach campaigns').version('1.0.0');

program
  .command('send')
  .option('--strategy <strategy>', 'A, B, or C', 'A')
  .option('--limit <number>', 'max contacts')
  .option('--delay <seconds>', 'base delay in seconds', '20')
  .option('--variance <seconds>', 'random extra delay in seconds', '10')
  .option('--batch <number>', 'batch size', '20')
  .option('--batch-pause <seconds>', 'pause duration between batches', '180')
  .option('--source <source>', 'supabase or csv', 'supabase')
  .option('--csv <path>', 'path to CSV contacts file')
  .option('--template <path>', 'custom template txt path')
  .option('--dry-run', 'print messages without sending', false)
  .option('--webhook', 'start webhook listener', false)
  .option('--reset', 'clear status before send', false)
  .action(async (args) => {
    const logger = new CampaignLogger(process.env.CAMPAIGN_LOG_PATH ?? 'campaign_log.csv');

    try {
      const strategy = String(args.strategy).toUpperCase() as Strategy;
      if (!['A', 'B', 'C'].includes(strategy)) {
        throw new Error('Invalid --strategy value. Use A, B, or C.');
      }

      const opts: SendOptions = {
        strategy,
        limit: args.limit ? parsePositiveInt(args.limit, 0) : undefined,
        delay: parsePositiveInt(args.delay, 20),
        variance: Math.max(0, parsePositiveInt(args.variance, 10)),
        batch: parsePositiveInt(args.batch, 20),
        batchPause: parsePositiveInt(args.batchPause, 180),
        source: args.source === 'csv' ? 'csv' : 'supabase',
        csvPath: args.csv,
        templatePath: args.template,
        dryRun: Boolean(args.dryRun),
        webhook: Boolean(args.webhook),
        reset: Boolean(args.reset)
      };

      const supabase = new SupabaseService(
        requiredEnv('SUPABASE_URL'),
        requiredEnv('SUPABASE_SERVICE_KEY'),
        process.env.SUPABASE_TABLE ?? 'businesses'
      );

      const nabda = new NabdaClient(requiredEnv('NABDA_BASE_URL'), requiredEnv('NABDA_TOKEN'));

      await supabase.ensureColumns();
      if (opts.reset) {
        logger.warn('Reset requested. Clearing existing statuses...');
        await supabase.resetStatuses();
      }

      if (opts.webhook && opts.strategy === 'B') {
        startWebhookServer(parsePositiveInt(process.env.WEBHOOK_PORT ?? '3001', 3001), supabase, nabda, logger);
      }

      let contacts: Contact[] = [];
      if (opts.source === 'supabase') {
        contacts = await supabase.fetchPendingContacts(opts.limit);
      } else {
        if (!opts.csvPath) {
          throw new Error('--csv is required when --source=csv');
        }
        contacts = await loadContactsFromCsv(opts.csvPath, opts.limit);
      }

      if (opts.limit && opts.limit > 0) {
        contacts = contacts.slice(0, opts.limit);
      }

      logger.info(`Loaded ${contacts.length} valid contacts from ${opts.source}.`);
      if (contacts.length === 0) {
        logger.warn('No contacts to send. Exiting.');
        return;
      }

      const template = await loadTemplate(opts.strategy, opts.templatePath);
      await runCampaign(contacts, template, opts, supabase, nabda, logger);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('reset')
  .description('clear all whatsapp status columns')
  .action(async () => {
    const logger = new CampaignLogger(process.env.CAMPAIGN_LOG_PATH ?? 'campaign_log.csv');
    try {
      const supabase = new SupabaseService(
        requiredEnv('SUPABASE_URL'),
        requiredEnv('SUPABASE_SERVICE_KEY'),
        process.env.SUPABASE_TABLE ?? 'businesses'
      );

      await supabase.resetStatuses();
      logger.success('All whatsapp_status and whatsapp_sent_at values reset.');
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('stats')
  .description('print campaign stats')
  .action(async () => {
    const logger = new CampaignLogger(process.env.CAMPAIGN_LOG_PATH ?? 'campaign_log.csv');
    try {
      const supabase = new SupabaseService(
        requiredEnv('SUPABASE_URL'),
        requiredEnv('SUPABASE_SERVICE_KEY'),
        process.env.SUPABASE_TABLE ?? 'businesses'
      );

      const stats = await supabase.getStats();
      logger.info('Campaign stats:');
      console.table([
        {
          total_businesses: stats.total,
          sent: stats.sent,
          failed: stats.failed,
          pending: stats.pending,
          replied: stats.replied,
          success_rate: `${stats.successRate.toFixed(2)}%`,
          last_campaign_date: stats.lastCampaignDate ?? 'N/A'
        }
      ]);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command('test')
  .requiredOption('--phone <phone>', 'destination phone 9647XXXXXXXXX')
  .option('--strategy <strategy>', 'A, B, or C', 'A')
  .option('--template <path>', 'custom template txt path')
  .action(async (args) => {
    const logger = new CampaignLogger(process.env.CAMPAIGN_LOG_PATH ?? 'campaign_log.csv');
    try {
      const phone = normalizePhone(args.phone);
      if (!phone) {
        throw new Error('Invalid phone. Must start with 964 and be numeric.');
      }

      const strategy = String(args.strategy).toUpperCase() as Strategy;
      const template = await loadTemplate(strategy, args.template);
      const message = template.replaceAll('{name}', 'Test Business');

      const nabda = new NabdaClient(requiredEnv('NABDA_BASE_URL'), requiredEnv('NABDA_TOKEN'));
      const result = await nabda.sendMessage(phone, message);

      if (result.ok) {
        logger.success(`Test message sent successfully to ${phone}`);
      } else {
        logger.error(`Test message failed: HTTP ${result.status} ${result.body}`);
        process.exitCode = 1;
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error);
  process.exit(1);
});
