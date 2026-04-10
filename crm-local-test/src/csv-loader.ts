import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { Business } from './types';
import { validatePhoneNumber } from './nabda';

interface CsvRow {
  name?: string;
  phone?: string;
  [key: string]: string | undefined;
}

export function loadContactsFromCsv(filePath: string): Business[] {
  const content = readFileSync(filePath, 'utf-8');

  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];

  const businesses: Business[] = [];
  const errors: string[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    // Try different column name variations
    const name = record.name || record.Name || record.NAME || record['Business Name'] || '';
    const phone = record.phone || record.Phone || record.PHONE || record['Phone Number'] || record['phone_number'] || '';

    if (!name || name.trim() === '') {
      errors.push(`Row ${i + 1}: Missing name`);
      continue;
    }

    if (!phone || phone.trim() === '') {
      errors.push(`Row ${i + 1}: Missing phone for "${name}"`);
      continue;
    }

    // Clean phone number
    const cleanPhone = phone.replace(/\+/g, '').replace(/\s/g, '').replace(/-/g, '');

    const validation = validatePhoneNumber(cleanPhone);
    if (!validation.valid) {
      errors.push(`Row ${i + 1}: Invalid phone for "${name}" - ${validation.error}`);
      continue;
    }

    businesses.push({
      id: `csv-${i}`,
      name: name.trim(),
      phone: cleanPhone,
      whatsapp_status: null,
      whatsapp_sent_at: null,
    });
  }

  if (errors.length > 0) {
    console.warn(`CSV loading warnings (${errors.length} issues):`);
    errors.slice(0, 10).forEach((err) => console.warn(`  - ${err}`));
    if (errors.length > 10) {
      console.warn(`  ... and ${errors.length - 10} more`);
    }
  }

  return businesses;
}

export function filterValidContacts(contacts: Business[]): Business[] {
  return contacts.filter((contact) => {
    if (!contact.name || contact.name.trim() === '') return false;
    if (!contact.phone || contact.phone.trim() === '') return false;

    const validation = validatePhoneNumber(contact.phone);
    return validation.valid;
  });
}
