import chalk from 'chalk';
import { createObjectCsvWriter } from 'csv-writer';
import { LogRow } from './types.js';

export class CampaignLogger {
  private readonly csvWriter;

  constructor(logPath: string) {
    this.csvWriter = createObjectCsvWriter({
      path: logPath,
      append: true,
      header: [
        { id: 'timestamp', title: 'timestamp' },
        { id: 'business_name', title: 'business_name' },
        { id: 'phone', title: 'phone' },
        { id: 'status', title: 'status' },
        { id: 'error_message', title: 'error_message' },
        { id: 'delay_seconds', title: 'delay_seconds' }
      ]
    });
  }

  info(message: string): void {
    console.log(chalk.cyan(message));
  }

  success(message: string): void {
    console.log(chalk.green(message));
  }

  warn(message: string): void {
    console.log(chalk.yellow(message));
  }

  error(message: string): void {
    console.log(chalk.red(message));
  }

  async logCsv(row: LogRow): Promise<void> {
    try {
      await this.csvWriter.writeRecords([row]);
    } catch (error) {
      this.error(`Failed to write CSV log: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  printProgress(current: number, total: number, sent: number, failed: number, etaSeconds: number): void {
    const width = 20;
    const pct = total > 0 ? current / total : 1;
    const complete = Math.round(width * pct);
    const bar = `${'='.repeat(Math.max(0, complete - 1))}${complete > 0 ? '>' : ''}${' '.repeat(Math.max(0, width - complete))}`;
    const etaMins = Math.round(etaSeconds / 60);
    const pctLabel = (pct * 100).toFixed(0);

    process.stdout.write(`\r[${bar}] ${current}/${total} (${pctLabel}%) | Sent: ${sent} | Failed: ${failed} | ETA: ${etaMins}m`);

    if (current === total) {
      process.stdout.write('\n');
    }
  }

  printSummaryEveryTen(processed: number, sent: number, failed: number): void {
    if (processed > 0 && processed % 10 === 0) {
      console.log('\n');
      console.table([
        {
          processed,
          sent,
          failed,
          success_rate: `${((sent / Math.max(1, sent + failed)) * 100).toFixed(2)}%`
        }
      ]);
    }
  }
}
