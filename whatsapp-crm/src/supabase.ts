import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Contact, Stats } from './types.js';

interface BusinessRow {
  id: string;
  name: string | null;
  phone: string | null;
  whatsapp_status: string | null;
  whatsapp_sent_at: string | null;
}

export function normalizePhone(value: string): string | null {
  const cleaned = value.replace(/[^\d+]/g, '').replace(/^\+/, '');
  if (!cleaned.startsWith('964')) {
    return null;
  }
  if (!/^\d{12,15}$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

export class SupabaseService {
  private readonly client: SupabaseClient;

  constructor(
    url: string,
    key: string,
    private readonly table: string
  ) {
    this.client = createClient(url, key, { auth: { persistSession: false } });
  }

  async ensureColumns(): Promise<void> {
    const sql = [
      `ALTER TABLE ${this.table} ADD COLUMN IF NOT EXISTS whatsapp_status TEXT;`,
      `ALTER TABLE ${this.table} ADD COLUMN IF NOT EXISTS whatsapp_sent_at TIMESTAMPTZ;`
    ].join('\n');

    try {
      const first = await this.client.rpc('exec_sql', { sql });
      if (!first.error) {
        return;
      }
      const second = await this.client.rpc('run_sql', { query: sql });
      if (!second.error) {
        return;
      }
      // Continue gracefully if no SQL helper exists.
      console.warn(`Could not auto-run migration: ${first.error.message}`);
    } catch (error) {
      console.warn(`Could not auto-run migration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async fetchPendingContacts(limit?: number): Promise<Contact[]> {
    try {
      let query = this.client
        .from(this.table)
        .select('id,name,phone,whatsapp_status')
        .is('whatsapp_status', null)
        .order('id', { ascending: true });

      if (limit && limit > 0) {
        query = query.limit(limit);
      }

      const { data, error } = await query;
      if (error) {
        throw error;
      }

      return this.mapContacts(data ?? []);
    } catch (error) {
      console.error('Failed to fetch contacts from Supabase:', error);
      return [];
    }
  }

  async findContactByPhone(phone: string): Promise<Contact | null> {
    try {
      const { data, error } = await this.client
        .from(this.table)
        .select('id,name,phone')
        .eq('phone', phone)
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      const normalized = normalizePhone(data.phone ?? '');
      if (!data.name || !normalized) {
        return null;
      }

      return {
        id: data.id,
        name: data.name,
        phone: normalized
      };
    } catch {
      return null;
    }
  }

  async updateStatus(contact: Contact, status: string, sentAt?: string): Promise<void> {
    try {
      const payload: Record<string, string | null> = {
        whatsapp_status: status,
        whatsapp_sent_at: sentAt ?? null
      };

      let query = this.client
        .from(this.table)
        .update(payload)
        .eq('phone', contact.phone);

      if (contact.id !== undefined) {
        query = query.eq('id', String(contact.id));
      }

      const { error } = await query;
      if (error) {
        throw error;
      }
    } catch (error) {
      console.error(`Supabase update failed for ${contact.phone}:`, error);
    }
  }

  async resetStatuses(): Promise<void> {
    try {
      const { error } = await this.client
        .from(this.table)
        .update({ whatsapp_status: null, whatsapp_sent_at: null })
        .not('id', 'is', null);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Failed to reset statuses:', error);
    }
  }

  async getStats(): Promise<Stats> {
    const fallback: Stats = {
      total: 0,
      sent: 0,
      failed: 0,
      pending: 0,
      replied: 0,
      successRate: 0,
      lastCampaignDate: null
    };

    try {
      const { data, error } = await this.client
        .from(this.table)
        .select('whatsapp_status,whatsapp_sent_at');

      if (error || !data) {
        return fallback;
      }

      let sent = 0;
      let failed = 0;
      let pending = 0;
      let replied = 0;
      let lastDate: string | null = null;

      for (const row of data as BusinessRow[]) {
        if (row.whatsapp_status === 'sent') {
          sent += 1;
        } else if (row.whatsapp_status === 'failed') {
          failed += 1;
        } else if (row.whatsapp_status === 'replied') {
          replied += 1;
        } else if (row.whatsapp_status === null) {
          pending += 1;
        }

        if (row.whatsapp_sent_at && (!lastDate || row.whatsapp_sent_at > lastDate)) {
          lastDate = row.whatsapp_sent_at;
        }
      }

      const total = data.length;
      const successRate = total > 0 ? (sent / Math.max(sent + failed, 1)) * 100 : 0;

      return { total, sent, failed, pending, replied, successRate, lastCampaignDate: lastDate };
    } catch {
      return fallback;
    }
  }

  private mapContacts(rows: BusinessRow[]): Contact[] {
    const contacts: Contact[] = [];

    for (const row of rows) {
      if (!row.name || !row.phone) {
        continue;
      }

      const phone = normalizePhone(row.phone);
      if (!phone) {
        continue;
      }

      contacts.push({ id: row.id, name: row.name.trim(), phone });
    }

    return contacts;
  }
}
