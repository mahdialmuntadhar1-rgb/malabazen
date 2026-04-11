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
  rawPhone?: string;
  normalizedPhone?: string;
  contactId?: string;
}

export interface BulkSendResult {
  total: number;
  sent: number;
  failed: number;
  results: NabdaResponse[];
}

export interface PhoneValidationResult {
  valid: boolean;
  normalized: string;
  raw: string;
  error?: string;
  isIraqi: boolean;
}

export interface WebhookPayload {
  event: string;
  phone: string;
  message: string;
  timestamp: string;
  providerMessageId?: string;
  messageId?: string;
  ack?: string;
}

// Database entity types
export interface Contact {
  id: string;
  business_name: string;
  raw_phone?: string;
  normalized_phone: string;
  governorate?: string;
  category?: string;
  whatsapp_status?: string;
  whatsapp_sent_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: string;
  template_id?: string;
  message_text?: string;
  delay_seconds: number;
  total_contacts: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  replied_count: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  contact_id: string;
  campaign_id?: string;
  message_text: string;
  direction: 'inbound' | 'outbound';
  message_type: string;
  provider_message_id?: string;
  provider_status?: string;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  created_at: string;
  updated_at: string;
}

export interface MessageEvent {
  id: string;
  message_id?: string;
  provider_message_id?: string;
  event_type: string;
  event_data?: Record<string, unknown>;
  created_at: string;
}

export interface WebhookLog {
  id: string;
  provider: string;
  event_type?: string;
  payload: Record<string, unknown>;
  processed: boolean;
  processing_result?: Record<string, unknown>;
  error_message?: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  body: string;
  template_type: string;
  variables?: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
