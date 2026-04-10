export interface Business {
  id: string;
  name: string;
  phone: string;
  whatsapp_status?: string | null;
  whatsapp_sent_at?: string | null;
}

export interface CampaignStats {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  successRate: number;
  lastCampaignDate?: string;
}

export interface SendResult {
  business: Business;
  success: boolean;
  errorMessage?: string;
  delaySeconds: number;
}

export interface TimingConfig {
  baseDelay: number;
  variance: number;
  batchSize: number;
  batchPause: number;
}

export interface CampaignConfig {
  strategy: 'A' | 'B' | 'C';
  limit: number | null;
  timing: TimingConfig;
  source: 'supabase' | 'csv';
  csvPath?: string;
  templatePath?: string;
  dryRun: boolean;
  webhook: boolean;
}

export interface NabdaResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface WebhookPayload {
  event: string;
  phone: string;
  message: string;
  timestamp: string;
}
