#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import { CampaignConfig, TimingConfig } from './types';
import { runCampaign, sendTestMessage } from './sender';
import { startWebhookServer } from './webhook';
import {
  getUnsentBusinesses,
  getAllBusinesses,
  resetAllStatuses,
  getCampaignStats,
  ensureColumns,
} from './supabase';
import { loadContactsFromCsv, filterValidContacts } from './csv-loader';
import { logInfo, logError, printStats, logWarning } from './logger';

const program = new Command();

program
  .name('whatsapp-crm')
  .description('WhatsApp CRM Bulk Messaging System for Iraqi Business Outreach')
  .version('1.0.0');

program
  .command('send')
  .description('Start a WhatsApp messaging campaign')
  .option('-s, --strategy <strategy>', 'Message strategy: A, B, or C', 'A')
  .option('-l, --limit <number>', 'Maximum contacts to send to')
  .option('-d, --delay <seconds>', 'Base delay between messages in seconds', '20')
  .option('-v, --variance <seconds>', 'Random variance to add to delay', '10')
  .option('-b, --batch <number>', 'Batch size before longer pause', '20')
  .option('-p, --batch-pause <seconds>', 'Pause between batches in seconds', '180')
  .option('--source <source>', 'Contact source: supabase or csv', 'supabase')
  .option('--csv <path>', 'Path to CSV file (if source=csv)')
  .option('-t, --template <path>', 'Path to custom template file')
  .option('--dry-run', 'Print messages without sending', false)
  .option('-w, --webhook', 'Start webhook listener for Strategy B follow-ups', false)
  .action(async (options) => {
    try {
      // Validate strategy
      const strategy = options.strategy.toUpperCase() as 'A' | 'B' | 'C';
      if (!['A', 'B', 'C'].includes(strategy)) {
        logError('CLI', 'validation', `Invalid strategy: ${options.strategy}. Use A, B, or C.`);
        process.exit(1);
      }

      // Build timing config
      const timing: TimingConfig = {
        baseDelay: parseInt(options.delay, 10),
        variance: parseInt(options.variance, 10),
        batchSize: parseInt(options.batch, 10),
        batchPause: parseInt(options.batchPause, 10),
      };

      // Build campaign config
      const limitValue = options.limit ? parseInt(options.limit, 10) : undefined;
      const config: CampaignConfig = {
        strategy,
        limit: limitValue || null,
        timing,
        source: options.source,
        csvPath: options.csv,
        templatePath: options.template,
        dryRun: options.dryRun,
        webhook: options.webhook,
      };

      // Validate options
      if (config.source === 'csv' && !config.csvPath) {
        logError('CLI', 'validation', 'CSV path required when source=csv. Use --csv flag.');
        process.exit(1);
      }

      // Ensure Supabase columns exist
      if (config.source === 'supabase') {
        await ensureColumns();
      }

      // Load contacts
      let contacts = await loadContacts(config);

      if (contacts.length === 0) {
        logWarning('No contacts found to send to.');
        process.exit(0);
      }

      // Validate and filter contacts
      contacts = filterValidContacts(contacts);

      if (contacts.length === 0) {
        logWarning('No valid contacts after filtering.');
        process.exit(0);
      }

      // Apply limit if specified
      if (config.limit && config.limit > 0 && contacts.length > config.limit) {
        contacts = contacts.slice(0, config.limit);
        logInfo(`Limited to ${config.limit} contacts`);
      }

      logInfo(`Loaded ${contacts.length} valid contacts`);
      console.log();

      // Start webhook server if requested (for Strategy B)
      if (config.webhook) {
        startWebhookServer();
      }

      // Run the campaign
      await runCampaign(contacts, config);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logError('CLI', 'send', errorMessage);
      process.exit(1);
    }
  });

program
  .command('reset')
  .description('Reset all whatsapp_status to NULL (re-run campaign)')
  .action(async () => {
    try {
      logInfo('Resetting all WhatsApp statuses...');
      await resetAllStatuses();
      logInfo(chalk.green('✓ All statuses reset successfully'));
      logInfo('You can now re-run the campaign with all contacts.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logError('CLI', 'reset', errorMessage);
      process.exit(1);
    }
  });

program
  .command('stats')
  .description('Show campaign statistics from Supabase')
  .action(async () => {
    try {
      const stats = await getCampaignStats();
      printStats(stats);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logError('CLI', 'stats', errorMessage);
      process.exit(1);
    }
  });

program
  .command('test')
  .description('Send a single test message')
  .requiredOption('-p, --phone <number>', 'Phone number to test (format: 9647XXXXXXXX)')
  .option('-s, --strategy <strategy>', 'Message strategy: A, B, or C', 'A')
  .option('-t, --template <path>', 'Custom template file')
  .action(async (options) => {
    try {
      const strategy = options.strategy.toUpperCase() as 'A' | 'B' | 'C';
      if (!['A', 'B', 'C'].includes(strategy)) {
        logError('CLI', 'validation', `Invalid strategy: ${options.strategy}`);
        process.exit(1);
      }

      await sendTestMessage(options.phone, strategy, options.template);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logError('CLI', 'test', errorMessage);
      process.exit(1);
    }
  });

program
  .command('webhook')
  .description('Start the webhook listener server for Strategy B follow-ups')
  .action(() => {
    startWebhookServer();
  });

// Helper function to load contacts based on source
async function loadContacts(config: CampaignConfig) {
  if (config.source === 'csv') {
    if (!config.csvPath) {
      throw new Error('CSV path not provided');
    }
    logInfo(`Loading contacts from CSV: ${config.csvPath}`);
    return loadContactsFromCsv(config.csvPath);
  } else {
    logInfo('Loading contacts from Supabase (unsent only)...');
    return getUnsentBusinesses(config.limit);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

program.parse();
