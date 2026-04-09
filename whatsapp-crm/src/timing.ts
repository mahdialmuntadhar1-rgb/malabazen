import { TimingOptions } from './types.js';

export const HARD_MIN_SECONDS = 8;

export function calculateDelaySeconds(options: TimingOptions): number {
  const base = Math.max(options.delaySeconds, options.hardMinSeconds);
  const variance = Math.max(0, options.varianceSeconds);
  const randomExtra = Math.floor(Math.random() * (variance + 1));
  return Math.max(base + randomExtra, HARD_MIN_SECONDS);
}

export function isBatchBoundary(sentCount: number, batchSize: number): boolean {
  return batchSize > 0 && sentCount > 0 && sentCount % batchSize === 0;
}

export function calculateEtaSeconds(
  remaining: number,
  avgDelaySeconds: number,
  batchSize: number,
  batchPauseSeconds: number,
  completed: number
): number {
  if (remaining <= 0) {
    return 0;
  }

  const futureSends = remaining;
  const futureBatchPauses = batchSize > 0 ? Math.floor((completed + futureSends) / batchSize) - Math.floor(completed / batchSize) : 0;
  return Math.max(0, (futureSends * avgDelaySeconds) + (futureBatchPauses * Math.max(0, batchPauseSeconds)));
}

export async function sleep(seconds: number): Promise<void> {
  const safeSeconds = Math.max(0, seconds);
  await new Promise<void>((resolve) => setTimeout(resolve, safeSeconds * 1000));
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins <= 0) {
    return `${secs}s`;
  }
  return `${mins}m ${secs}s`;
}
