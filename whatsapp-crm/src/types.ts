export type Strategy = 'A' | 'B' | 'C';

export interface Contact {
  id?: string | number;
  name: string;
  phone: string;
}

export interface SendOptions {
  strategy: Strategy;
  limit?: number;
  delay: number;
  variance: number;
  batch: number;
  batchPause: number;
  source: 'supabase' | 'csv';
  csvPath?: string;
  templatePath?: string;
  dryRun: boolean;
  webhook: boolean;
  reset: boolean;
}

export interface SendResult {
  ok: boolean;
  status: number;
  body: string;
}

export interface Stats {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  replied: number;
  successRate: number;
  lastCampaignDate: string | null;
}

export interface LogRow {
  timestamp: string;
  business_name: string;
  phone: string;
  status: string;
  error_message: string;
  delay_seconds: number;
}

export interface TimingOptions {
  delaySeconds: number;
  varianceSeconds: number;
  batchSize: number;
  batchPauseSeconds: number;
  hardMinSeconds: number;
}

export interface WebhookPayload {
  event?: string;
  message?: {
    body?: string;
    from?: string;
    phone?: string;
  };
  body?: string;
  from?: string;
  phone?: string;
  [key: string]: unknown;
}
