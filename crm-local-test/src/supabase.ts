import { createClient } from '@supabase/supabase-js';
import { Business, CampaignStats } from './types';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY) in .env');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function getUnsentBusinesses(limit: number | null = null): Promise<Business[]> {
  let query = supabase
    .from('businesses')
    .select('id, name, phone, whatsapp_status, whatsapp_sent_at')
    .is('whatsapp_status', null);

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch businesses: ${error.message}`);
  }

  return (data || []) as Business[];
}

export async function getAllBusinesses(): Promise<Business[]> {
  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, phone, whatsapp_status, whatsapp_sent_at');

  if (error) {
    throw new Error(`Failed to fetch businesses: ${error.message}`);
  }

  return (data || []) as Business[];
}

export async function updateBusinessStatus(
  id: string,
  status: string,
  sentAt?: string
): Promise<void> {
  const update: { whatsapp_status: string; whatsapp_sent_at?: string } = {
    whatsapp_status: status,
  };

  if (sentAt) {
    update.whatsapp_sent_at = sentAt;
  }

  const { error } = await supabase
    .from('businesses')
    .update(update)
    .eq('id', id);

  if (error) {
    console.error(`Failed to update status for business ${id}:`, error.message);
    // Don't throw - we don't want to stop the campaign
  }
}

export async function resetAllStatuses(): Promise<void> {
  const { error } = await supabase
    .from('businesses')
    .update({
      whatsapp_status: null,
      whatsapp_sent_at: null,
    })
    .not('id', 'is', null);

  if (error) {
    throw new Error(`Failed to reset statuses: ${error.message}`);
  }
}

export async function getBusinessByPhone(phone: string): Promise<Business | null> {
  const cleanPhone = phone.replace(/\+/g, '').replace(/\s/g, '');

  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, phone, whatsapp_status, whatsapp_sent_at')
    .eq('phone', cleanPhone)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error(`Error looking up phone ${phone}:`, error.message);
    return null;
  }

  return data as Business;
}

export async function getCampaignStats(): Promise<CampaignStats> {
  const { data, error } = await supabase
    .from('businesses')
    .select('whatsapp_status, whatsapp_sent_at');

  if (error) {
    throw new Error(`Failed to fetch stats: ${error.message}`);
  }

  const businesses = data || [];
  const total = businesses.length;
  const sent = businesses.filter((b: any) => b.whatsapp_status === 'sent').length;
  const failed = businesses.filter((b: any) => b.whatsapp_status === 'failed').length;
  const replied = businesses.filter((b: any) => b.whatsapp_status === 'replied').length;
  const pending = businesses.filter((b: any) => !b.whatsapp_status).length;

  const successRate = total > 0 ? Math.round(((sent + replied) / total) * 100) : 0;

  let lastCampaignDate: string | undefined;
  const sentDates = businesses
    .filter((b: any) => b.whatsapp_sent_at)
    .map((b: any) => new Date(b.whatsapp_sent_at))
    .sort((a: Date, b: Date) => b.getTime() - a.getTime());

  if (sentDates.length > 0) {
    lastCampaignDate = sentDates[0].toISOString();
  }

  return {
    total,
    sent,
    failed,
    pending,
    successRate,
    lastCampaignDate,
  };
}

export async function ensureColumns(): Promise<void> {
  // Supabase doesn't support running raw SQL through the JS client easily
  // We'll check if columns exist by trying to query them
  try {
    const { error } = await supabase
      .from('businesses')
      .select('whatsapp_status, whatsapp_sent_at')
      .limit(1);

    if (error) {
      console.warn('Columns may not exist. Please run the SQL migration in sql/ folder.');
    }
  } catch (err) {
    console.warn('Error checking columns:', err);
  }
}
