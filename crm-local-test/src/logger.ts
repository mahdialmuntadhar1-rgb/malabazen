import { createObjectCsvWriter } from 'csv-writer';
import chalk from 'chalk';
import { appendFileSync, existsSync } from 'fs';
import { SendResult, CampaignStats } from './types';

const LOG_FILE = 'campaign_log.csv';

interface CsvRecord {
  timestamp: string;
  business_name: string;
  phone: string;
  status: string;
  error_message: string;
  delay_seconds: number;
}

export function initLogFile(): void {
  if (!existsSync(LOG_FILE)) {
    const header = 'timestamp,business_name,phone,status,error_message,delay_seconds\n';
    appendFileSync(LOG_FILE, header);
  }
}

export function logToCsv(result: SendResult): void {
  const record: CsvRecord = {
    timestamp: new Date().toISOString(),
    business_name: result.business.name,
    phone: result.business.phone,
    status: result.success ? 'sent' : 'failed',
    error_message: result.errorMessage || '',
    delay_seconds: result.delaySeconds,
  };

  const line = `${record.timestamp},${escapeCsv(record.business_name)},${record.phone},${record.status},"${escapeCsv(record.error_message)}",${record.delay_seconds}\n`;
  appendFileSync(LOG_FILE, line);
}

function escapeCsv(value: string): string {
  return value.replace(/"/g, '""').replace(/\n/g, ' ');
}

export function logSuccess(name: string, phone: string): void {
  console.log(chalk.green(`  ✓ Sent to ${name} (+${phone})`));
}

export function logError(name: string, phone: string, error: string): void {
  console.log(chalk.red(`  ✗ Failed to ${name} (+${phone}): ${error}`));
}

export function logWaiting(name: string, phone: string, delaySeconds: number): void {
  console.log(chalk.yellow(`  ⏳ Waiting ${delaySeconds}s before next send...`));
}

export function logInfo(message: string): void {
  console.log(chalk.cyan(message));
}

export function logWarning(message: string): void {
  console.log(chalk.yellow(message));
}

export function printProgressBar(
  current: number,
  total: number,
  sent: number,
  failed: number,
  eta: string
): void {
  const width = 30;
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  const bar = '='.repeat(filled) + '>'.repeat(Math.min(1, empty)) + ' '.repeat(Math.max(0, empty - 1));
  const percentage = Math.round((current / total) * 100);

  console.log(
    chalk.cyan(`[${bar}] ${current}/${total} (${percentage}%) | Sent: ${chalk.green(sent)} | Failed: ${chalk.red(failed)} | ETA: ${eta}`)
  );
}

export function printSummary(sent: number, failed: number, total: number): void {
  console.log('');
  console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.cyan('           CAMPAIGN SUMMARY              '));
  console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(`Total processed: ${total}`);
  console.log(chalk.green(`  ✓ Successfully sent: ${sent}`));
  console.log(chalk.red(`  ✗ Failed: ${failed}`));

  const successRate = total > 0 ? Math.round((sent / total) * 100) : 0;
  console.log(`Success rate: ${successRate}%`);
  console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
}

export function printStats(stats: CampaignStats): void {
  console.log('');
  console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.cyan('          CAMPAIGN STATISTICS            '));
  console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(`Total businesses: ${stats.total}`);
  console.log(chalk.green(`  Sent: ${stats.sent}`));
  console.log(chalk.red(`  Failed: ${stats.failed}`));
  console.log(chalk.yellow(`  Pending: ${stats.pending}`));
  console.log(`Success rate: ${stats.successRate}%`);

  if (stats.lastCampaignDate) {
    const date = new Date(stats.lastCampaignDate);
    console.log(`Last campaign: ${date.toLocaleString()}`);
  }
  console.log(chalk.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
}

export function printBatchPauseMessage(batchNumber: number, pauseSeconds: number): void {
  console.log('');
  console.log(chalk.yellow(`  📦 Batch ${batchNumber} complete. Pausing for ${pauseSeconds}s...`));
  console.log('');
}
