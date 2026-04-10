import { Business, CampaignConfig, SendResult, TimingConfig } from './types';
import { getMessageTemplate, shouldSendFollowUp } from './templates';
import { sendWhatsAppMessage, sendTypingIndicator, validatePhoneNumber } from './nabda';
import { updateBusinessStatus } from './supabase';
import {
  calculateDelay,
  calculateETA,
  sleep,
  formatDuration,
} from './timing';
import {
  logSuccess,
  logError,
  logWaiting,
  logInfo,
  logWarning,
  printProgressBar,
  printSummary,
  printBatchPauseMessage,
  logToCsv,
  initLogFile,
} from './logger';

interface CampaignState {
  sent: number;
  failed: number;
  processed: number;
  total: number;
  isRunning: boolean;
  shouldStop: boolean;
}

export async function runCampaign(
  contacts: Business[],
  config: CampaignConfig
): Promise<void> {
  initLogFile();

  const state: CampaignState = {
    sent: 0,
    failed: 0,
    processed: 0,
    total: contacts.length,
    isRunning: true,
    shouldStop: false,
  };

  // Set up graceful shutdown
  setupShutdownHandler(state);

  logInfo(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  logInfo(`           STARTING CAMPAIGN             `);
  logInfo(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  logInfo(`Strategy: ${config.strategy}`);
  logInfo(`Total contacts: ${state.total}`);
  logInfo(`Base delay: ${config.timing.baseDelay}s`);
  logInfo(`Variance: ${config.timing.variance}s`);
  logInfo(`Batch size: ${config.timing.batchSize}`);
  logInfo(`Batch pause: ${config.timing.batchPause}s`);
  if (config.dryRun) {
    logWarning('⚠️ DRY RUN MODE - No messages will be sent');
  }
  logInfo(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log();

  let batchNumber = 1;
  let messagesInBatch = 0;

  for (let i = 0; i < contacts.length; i++) {
    if (state.shouldStop) {
      logWarning('\n🛑 Campaign stopped by user');
      break;
    }

    const contact = contacts[i];
    const delayMs = calculateDelay(config.timing);
    const delaySeconds = Math.round(delayMs / 1000);

    // Process this contact
    console.log(`[${i + 1}/${state.total}] Processing: ${contact.name}`);

    const result = await processContact(contact, config, delaySeconds);

    // Update state
    state.processed++;
    if (result.success) {
      state.sent++;
    } else {
      state.failed++;
    }

    // Log to CSV
    logToCsv(result);

    // Print progress every 10 messages
    if (state.processed % 10 === 0) {
      const eta = calculateETA(state.processed, state.total, config.timing);
      printProgressBar(state.processed, state.total, state.sent, state.failed, eta);
    }

    messagesInBatch++;

    // Check for batch pause
    if (
      messagesInBatch >= config.timing.batchSize &&
      i < contacts.length - 1
    ) {
      printBatchPauseMessage(batchNumber, config.timing.batchPause);
      await sleep(config.timing.batchPause * 1000);
      messagesInBatch = 0;
      batchNumber++;
    } else if (i < contacts.length - 1) {
      // Normal delay between messages
      logWaiting(contact.name, contact.phone, delaySeconds);
      await sleep(delayMs);
    }
  }

  state.isRunning = false;

  // Final summary
  console.log();
  printSummary(state.sent, state.failed, state.processed);
}

async function processContact(
  contact: Business,
  config: CampaignConfig,
  delaySeconds: number
): Promise<SendResult> {
  const result: SendResult = {
    business: contact,
    success: false,
    delaySeconds,
  };

  // Validate phone
  const validation = validatePhoneNumber(contact.phone);
  if (!validation.valid) {
    result.errorMessage = validation.error;
    logError(contact.name, contact.phone, validation.error || 'Invalid phone');
    await updateBusinessStatus(contact.id, 'failed');
    return result;
  }

  // Build message
  const message = getMessageTemplate(contact.name, config, false);

  // Dry run - just log and return
  if (config.dryRun) {
    logSuccess(contact.name, contact.phone);
    console.log(chalk.gray(`    Message: ${message.substring(0, 50)}...`));
    result.success = true;
    return result;
  }

  // Send typing indicator (optional, non-blocking)
  try {
    await sendTypingIndicator(contact.phone);
    await sleep(1000); // Small pause after typing
  } catch {
    // Ignore typing errors
  }

  // Send message
  try {
    const sendResult = await sendWhatsAppMessage(contact.phone, message);

    if (sendResult.success) {
      result.success = true;
      logSuccess(contact.name, contact.phone);

      // Update Supabase
      await updateBusinessStatus(contact.id, 'sent', new Date().toISOString());
    } else {
      result.errorMessage = sendResult.error || 'Unknown error';
      logError(contact.name, contact.phone, result.errorMessage);

      // Update Supabase with failed status
      await updateBusinessStatus(contact.id, 'failed');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    result.errorMessage = errorMessage;
    logError(contact.name, contact.phone, errorMessage);

    // Update Supabase with failed status
    await updateBusinessStatus(contact.id, 'failed');
  }

  return result;
}

export async function sendTestMessage(
  phone: string,
  strategy: 'A' | 'B' | 'C' = 'A',
  templatePath?: string
): Promise<void> {
  const config: CampaignConfig = {
    strategy,
    limit: 1,
    timing: { baseDelay: 10, variance: 5, batchSize: 1, batchPause: 0 },
    source: 'supabase',
    templatePath,
    dryRun: false,
    webhook: false,
  };

  const message = getMessageTemplate('Test Business', config, false);

  logInfo(`Sending test message to ${phone}...`);
  logInfo(`Strategy: ${strategy}`);
  console.log();
  logInfo('Message content:');
  console.log(chalk.gray('─'.repeat(50)));
  console.log(message);
  console.log(chalk.gray('─'.repeat(50)));
  console.log();

  const result = await sendWhatsAppMessage(phone, message);

  if (result.success) {
    logSuccess('Test', phone);
    logInfo(`Message ID: ${result.messageId}`);
  } else {
    logError('Test', phone, result.error || 'Unknown error');
    process.exit(1);
  }
}

export async function sendFollowUpMessage(phone: string, name: string): Promise<boolean> {
  const config: CampaignConfig = {
    strategy: 'B',
    limit: 1,
    timing: { baseDelay: 8, variance: 0, batchSize: 1, batchPause: 0 },
    source: 'supabase',
    dryRun: false,
    webhook: false,
  };

  const message = getMessageTemplate(name, config, true);

  logInfo(`Sending follow-up to ${name} (${phone})...`);

  const result = await sendWhatsAppMessage(phone, message);

  if (result.success) {
    logSuccess(name, phone);
    return true;
  } else {
    logError(name, phone, result.error || 'Unknown error');
    return false;
  }
}

function setupShutdownHandler(state: CampaignState): void {
  const shutdown = (signal: string) => {
    if (state.isRunning) {
      logWarning(`\nReceived ${signal}. Stopping campaign gracefully...`);
      state.shouldStop = true;

      // Give a moment to save progress
      setTimeout(() => {
        console.log('');
        printSummary(state.sent, state.failed, state.processed);
        process.exit(0);
      }, 1000);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Windows doesn't support SIGINT properly in some environments
  if (process.platform === 'win32') {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.on('SIGINT', () => shutdown('SIGINT'));
  }
}

// Need to import at the end to avoid circular dependency
import chalk from 'chalk';
