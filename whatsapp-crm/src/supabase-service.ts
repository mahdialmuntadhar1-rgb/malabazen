import 'dotenv/config';

/**
 * Enhanced Supabase Service for WhatsApp CRM
 * Handles all database operations for contacts, campaigns, messages, and webhooks
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  Contact, 
  Campaign, 
  Message, 
  MessageEvent, 
  WebhookLog, 
  MessageTemplate,
  CampaignStats 
} from './types';
import { logInfo, logError } from './logger';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env');
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

// =====================================================
// CONTACT OPERATIONS
// =====================================================

export async function createContact(contact: Partial<Contact>): Promise<Contact | null> {
  const { data, error } = await supabase
    .from('contacts')
    .insert(contact)
    .select()
    .single();

  if (error) {
    logError('Supabase', 'createContact', error.message);
    return null;
  }

  logInfo(`[Supabase] Created contact: ${data.business_name} (${data.normalized_phone})`);
  return data as Contact;
}

export async function getContactById(id: string): Promise<Contact | null> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') { // Not found
      logError('Supabase', 'getContactById', error.message);
    }
    return null;
  }

  return data as Contact;
}

export async function getContactByPhone(phone: string): Promise<Contact | null> {
  // Normalize phone before lookup
  const cleanPhone = phone.replace(/[^\d]/g, '');
  const normalizedPhone = cleanPhone.startsWith('964') ? `+${cleanPhone}` : `+964${cleanPhone.replace(/^0/, '')}`;
  
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('normalized_phone', normalizedPhone)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      logError('Supabase', 'getContactByPhone', error.message);
    }
    return null;
  }

  return data as Contact;
}

export async function getContacts(options?: {
  status?: string;
  governorate?: string;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: Contact[]; count: number | null }> {
  let query = supabase
    .from('contacts')
    .select('*', { count: 'exact' });

  if (options?.status) {
    query = query.eq('whatsapp_status', options.status);
  }
  if (options?.governorate) {
    query = query.eq('governorate', options.governorate);
  }
  if (options?.category) {
    query = query.eq('category', options.category);
  }
  if (options?.search) {
    query = query.or(`business_name.ilike.%${options.search}%,normalized_phone.ilike.%${options.search}%`);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
  }

  const { data, error, count } = await query.order('created_at', { ascending: false });

  if (error) {
    logError('Supabase', 'getContacts', error.message);
    return { data: [], count: null };
  }

  return { data: (data || []) as Contact[], count };
}

export async function updateContact(
  id: string, 
  updates: Partial<Contact>
): Promise<Contact | null> {
  const { data, error } = await supabase
    .from('contacts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    logError('Supabase', 'updateContact', error.message);
    return null;
  }

  return data as Contact;
}

export async function updateContactWhatsAppStatus(
  id: string,
  status: string,
  sentAt?: string
): Promise<boolean> {
  const updates: Partial<Contact> = { whatsapp_status: status };
  if (sentAt) {
    updates.whatsapp_sent_at = sentAt;
  }

  const { error } = await supabase
    .from('contacts')
    .update(updates)
    .eq('id', id);

  if (error) {
    logError('Supabase', 'updateContactWhatsAppStatus', error.message);
    return false;
  }

  return true;
}

export async function deleteContact(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', id);

  if (error) {
    logError('Supabase', 'deleteContact', error.message);
    return false;
  }

  return true;
}

// =====================================================
// CAMPAIGN OPERATIONS
// =====================================================

export async function createCampaign(campaign: Partial<Campaign>): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .insert(campaign)
    .select()
    .single();

  if (error) {
    logError('Supabase', 'createCampaign', error.message);
    return null;
  }

  logInfo(`[Supabase] Created campaign: ${data.name}`);
  return data as Campaign;
}

export async function getCampaignById(id: string): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    logError('Supabase', 'getCampaignById', error.message);
    return null;
  }

  return data as Campaign;
}

export async function getCampaigns(status?: string): Promise<Campaign[]> {
  let query = supabase
    .from('campaigns')
    .select('*');

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    logError('Supabase', 'getCampaigns', error.message);
    return [];
  }

  return (data || []) as Campaign[];
}

export async function updateCampaign(
  id: string, 
  updates: Partial<Campaign>
): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    logError('Supabase', 'updateCampaign', error.message);
    return null;
  }

  return data as Campaign;
}

export async function deleteCampaign(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('campaigns')
    .delete()
    .eq('id', id);

  if (error) {
    logError('Supabase', 'deleteCampaign', error.message);
    return false;
  }

  return true;
}

// =====================================================
// CAMPAIGN CONTACTS (JUNCTION TABLE)
// =====================================================

export async function addContactsToCampaign(
  campaignId: string,
  contactIds: string[]
): Promise<boolean> {
  const junctionRecords = contactIds.map(contactId => ({
    campaign_id: campaignId,
    contact_id: contactId,
    status: 'pending'
  }));

  const { error } = await supabase
    .from('campaign_contacts')
    .insert(junctionRecords);

  if (error) {
    logError('Supabase', 'addContactsToCampaign', error.message);
    return false;
  }

  // Update campaign total_contacts count
  await supabase
    .from('campaigns')
    .update({ total_contacts: contactIds.length })
    .eq('id', campaignId);

  return true;
}

export async function updateCampaignContactStatus(
  campaignId: string,
  contactId: string,
  status: string,
  timestamp?: string,
  errorMessage?: string
): Promise<boolean> {
  const updates: Record<string, unknown> = { status };
  
  if (status === 'sent') {
    updates.sent_at = timestamp || new Date().toISOString();
  } else if (status === 'delivered') {
    updates.delivered_at = timestamp || new Date().toISOString();
  } else if (status === 'failed') {
    updates.failed_at = timestamp || new Date().toISOString();
    if (errorMessage) {
      updates.error_message = errorMessage;
    }
  }

  const { error } = await supabase
    .from('campaign_contacts')
    .update(updates)
    .eq('campaign_id', campaignId)
    .eq('contact_id', contactId);

  if (error) {
    logError('Supabase', 'updateCampaignContactStatus', error.message);
    return false;
  }

  return true;
}

export async function getCampaignContacts(campaignId: string): Promise<{
  contact_id: string;
  status: string;
  contact: Contact;
}[]> {
  const { data, error } = await supabase
    .from('campaign_contacts')
    .select(`
      contact_id,
      status,
      contact:contacts(*)
    `)
    .eq('campaign_id', campaignId);

  if (error) {
    logError('Supabase', 'getCampaignContacts', error.message);
    return [];
  }

  return (data || []) as unknown as { contact_id: string; status: string; contact: Contact }[];
}

// =====================================================
// MESSAGE OPERATIONS
// =====================================================

export async function createMessage(message: Partial<Message>): Promise<Message | null> {
  const { data, error } = await supabase
    .from('messages')
    .insert(message)
    .select()
    .single();

  if (error) {
    logError('Supabase', 'createMessage', error.message);
    return null;
  }

  return data as Message;
}

export async function getMessageByProviderId(providerMessageId: string): Promise<Message | null> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('provider_message_id', providerMessageId)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      logError('Supabase', 'getMessageByProviderId', error.message);
    }
    return null;
  }

  return data as Message;
}

export async function getMessagesByContact(
  contactId: string, 
  limit: number = 50
): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    logError('Supabase', 'getMessagesByContact', error.message);
    return [];
  }

  return (data || []) as Message[];
}

export async function updateMessageStatus(
  messageId: string,
  status: string,
  timestamp?: string
): Promise<boolean> {
  const updates: Partial<Message> = { provider_status: status };
  
  if (status === 'sent' || status === 'delivered') {
    updates.delivered_at = timestamp || new Date().toISOString();
  } else if (status === 'read') {
    updates.read_at = timestamp || new Date().toISOString();
  }

  const { error } = await supabase
    .from('messages')
    .update(updates)
    .eq('id', messageId);

  if (error) {
    logError('Supabase', 'updateMessageStatus', error.message);
    return false;
  }

  return true;
}

export async function updateMessageByProviderId(
  providerMessageId: string,
  updates: Partial<Message>
): Promise<boolean> {
  const { error } = await supabase
    .from('messages')
    .update(updates)
    .eq('provider_message_id', providerMessageId);

  if (error) {
    logError('Supabase', 'updateMessageByProviderId', error.message);
    return false;
  }

  return true;
}

// =====================================================
// MESSAGE EVENTS
// =====================================================

export async function createMessageEvent(event: Partial<MessageEvent>): Promise<MessageEvent | null> {
  const { data, error } = await supabase
    .from('message_events')
    .insert(event)
    .select()
    .single();

  if (error) {
    logError('Supabase', 'createMessageEvent', error.message);
    return null;
  }

  return data as MessageEvent;
}

export async function getMessageEvents(messageId: string): Promise<MessageEvent[]> {
  const { data, error } = await supabase
    .from('message_events')
    .select('*')
    .eq('message_id', messageId)
    .order('created_at', { ascending: true });

  if (error) {
    logError('Supabase', 'getMessageEvents', error.message);
    return [];
  }

  return (data || []) as MessageEvent[];
}

// =====================================================
// WEBHOOK LOGS
// =====================================================

export async function createWebhookLog(log: Partial<WebhookLog>): Promise<WebhookLog | null> {
  const { data, error } = await supabase
    .from('webhook_logs')
    .insert(log)
    .select()
    .single();

  if (error) {
    logError('Supabase', 'createWebhookLog', error.message);
    return null;
  }

  return data as WebhookLog;
}

export async function updateWebhookLog(
  id: string,
  updates: Partial<WebhookLog>
): Promise<boolean> {
  const { error } = await supabase
    .from('webhook_logs')
    .update(updates)
    .eq('id', id);

  if (error) {
    logError('Supabase', 'updateWebhookLog', error.message);
    return false;
  }

  return true;
}

export async function getRecentWebhookLogs(
  provider: string = 'nabda',
  limit: number = 100
): Promise<WebhookLog[]> {
  const { data, error } = await supabase
    .from('webhook_logs')
    .select('*')
    .eq('provider', provider)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logError('Supabase', 'getRecentWebhookLogs', error.message);
    return [];
  }

  return (data || []) as WebhookLog[];
}

// =====================================================
// MESSAGE TEMPLATES
// =====================================================

export async function getMessageTemplates(
  activeOnly: boolean = true
): Promise<MessageTemplate[]> {
  let query = supabase
    .from('message_templates')
    .select('*');

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query.order('name');

  if (error) {
    logError('Supabase', 'getMessageTemplates', error.message);
    return [];
  }

  return (data || []) as MessageTemplate[];
}

export async function getMessageTemplateById(id: string): Promise<MessageTemplate | null> {
  const { data, error } = await supabase
    .from('message_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      logError('Supabase', 'getMessageTemplateById', error.message);
    }
    return null;
  }

  return data as MessageTemplate;
}

export async function createMessageTemplate(
  template: Partial<MessageTemplate>
): Promise<MessageTemplate | null> {
  const { data, error } = await supabase
    .from('message_templates')
    .insert(template)
    .select()
    .single();

  if (error) {
    logError('Supabase', 'createMessageTemplate', error.message);
    return null;
  }

  return data as MessageTemplate;
}

export async function updateMessageTemplate(
  id: string,
  updates: Partial<MessageTemplate>
): Promise<MessageTemplate | null> {
  const { data, error } = await supabase
    .from('message_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    logError('Supabase', 'updateMessageTemplate', error.message);
    return null;
  }

  return data as MessageTemplate;
}

export async function deleteMessageTemplate(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('message_templates')
    .delete()
    .eq('id', id);

  if (error) {
    logError('Supabase', 'deleteMessageTemplate', error.message);
    return false;
  }

  return true;
}

// =====================================================
// STATS & ANALYTICS
// =====================================================

export async function getCampaignStatistics(): Promise<{
  total: number;
  sent: number;
  delivered: number;
  failed: number;
  replied: number;
  pending: number;
  successRate: number;
}> {
  const { data, error } = await supabase
    .from('contacts')
    .select('whatsapp_status');

  if (error) {
    logError('Supabase', 'getCampaignStatistics', error.message);
    return { total: 0, sent: 0, delivered: 0, failed: 0, replied: 0, pending: 0, successRate: 0 };
  }

  const contacts = data || [];
  const total = contacts.length;
  const sent = contacts.filter((c: any) => c.whatsapp_status === 'sent').length;
  const delivered = contacts.filter((c: any) => c.whatsapp_status === 'delivered').length;
  const failed = contacts.filter((c: any) => c.whatsapp_status === 'failed').length;
  const replied = contacts.filter((c: any) => c.whatsapp_status === 'replied').length;
  const pending = contacts.filter((c: any) => !c.whatsapp_status).length;

  const successRate = total > 0 ? Math.round(((sent + delivered + replied) / total) * 100) : 0;

  return { total, sent, delivered, failed, replied, pending, successRate };
}

export async function getConversations(limit: number = 50): Promise<any[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .limit(limit)
    .order('last_message_at', { ascending: false });

  if (error) {
    logError('Supabase', 'getConversations', error.message);
    return [];
  }

  return data || [];
}

// =====================================================
// SYSTEM CHECKS
// =====================================================

export async function checkTableExists(tableName: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_name', tableName)
    .single();

  if (error || !data) {
    return false;
  }

  return true;
}

export async function getSystemStatus(): Promise<{
  supabaseConnected: boolean;
  tables: Record<string, boolean>;
  missingTables: string[];
}> {
  const requiredTables = [
    'contacts',
    'campaigns',
    'campaign_contacts',
    'messages',
    'message_events',
    'webhook_logs',
    'message_templates'
  ];

  const tables: Record<string, boolean> = {};
  const missingTables: string[] = [];
  let supabaseConnected = false;

  try {
    // Test connection by checking one table
    const { error } = await supabase
      .from('contacts')
      .select('id')
      .limit(1);

    supabaseConnected = !error || error.code !== 'PGRST116'; // 116 = table not found, others are OK
  } catch (err) {
    supabaseConnected = false;
  }

  // Check all tables
  for (const table of requiredTables) {
    const exists = await checkTableExists(table);
    tables[table] = exists;
    if (!exists) {
      missingTables.push(table);
    }
  }

  return { supabaseConnected, tables, missingTables };
}
