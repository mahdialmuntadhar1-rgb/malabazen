import { TimingConfig } from './types';

export function calculateDelay(config: TimingConfig): number {
  // Base delay in seconds
  const baseDelayMs = config.baseDelay * 1000;
  // Random variance in seconds, converted to ms
  const varianceMs = Math.floor(Math.random() * (config.variance * 1000));

  const totalDelayMs = baseDelayMs + varianceMs;

  // Enforce hard minimum of 8 seconds
  const minDelayMs = 8000;
  return Math.max(totalDelayMs, minDelayMs);
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

export function calculateETA(
  current: number,
  total: number,
  config: TimingConfig
): string {
  const remaining = total - current;

  // Calculate average delay per message
  const avgDelayMs = (config.baseDelay * 1000) + (config.variance * 500); // average of 0-variance
  const minDelayMs = 8000;
  const effectiveDelayMs = Math.max(avgDelayMs, minDelayMs);

  // Account for batch pauses
  const remainingBatches = Math.ceil(remaining / config.batchSize) - 1;
  const batchPauseMs = remainingBatches * config.batchPause * 1000;

  const totalRemainingMs = remaining * effectiveDelayMs + batchPauseMs;

  return formatDuration(totalRemainingMs);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
