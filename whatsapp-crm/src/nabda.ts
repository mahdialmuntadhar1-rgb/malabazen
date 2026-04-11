import fetch from 'node-fetch';
import { NabdaResponse, BulkSendResult, PhoneValidationResult } from './types';
import { logInfo, logError, logWarning } from './logger';

const NABDA_BASE_URL = process.env.NABDA_BASE_URL || '';
const NABDA_TOKEN = process.env.NABDA_TOKEN || '';

// Validate env vars on module load but don't throw (let caller handle)
if (!NABDA_BASE_URL || !NABDA_TOKEN) {
  logWarning('Nabda service: Missing NABDA_BASE_URL or NABDA_TOKEN in environment');
}

/**
 * Iraqi phone number normalization
 * Accepts: 0770..., 770..., 964770..., +964770..., 00964770...
 * Returns: +9647XXXXXXXXX (E.164 format for Iraq)
 */
export function normalizePhoneNumber(phone: string): PhoneValidationResult {
  if (!phone || typeof phone !== 'string') {
    return { 
      valid: false, 
      normalized: '', 
      raw: phone || '',
      error: 'Phone number is empty or invalid type',
      isIraqi: false 
    };
  }

  const raw = phone.trim();
  
  // Remove all non-digit characters except the leading +
  let digits = raw.replace(/[^\d]/g, '');
  
  // Handle 00964... format (international dialing prefix)
  if (digits.startsWith('00964')) {
    digits = digits.substring(2); // Remove the 00 prefix
  }
  
  // Handle numbers starting with 0 (local Iraqi format: 0770...)
  if (digits.startsWith('0')) {
    digits = digits.substring(1); // Remove the leading 0
  }
  
  // Now digits should start with 964 or 770...
  if (!digits.startsWith('964')) {
    // Check if it's a local number without country code (770...)
    if (/^7\d{9}$/.test(digits)) {
      digits = '964' + digits;
    } else {
      return { 
        valid: false, 
        normalized: '', 
        raw,
        error: 'Invalid Iraqi phone number format. Must start with 07, 7, 964, or +964',
        isIraqi: false 
      };
    }
  }
  
  // Validate length: 964 + 10 digits = 13 characters total
  if (digits.length !== 13) {
    return { 
      valid: false, 
      normalized: '', 
      raw,
      error: `Invalid phone number length: ${digits.length} digits. Expected 13 (964XXXXXXXXXX)`,
      isIraqi: false 
    };
  }
  
  // Validate that it starts with 9647 (Iraqi mobile)
  if (!digits.startsWith('9647')) {
    return { 
      valid: false, 
      normalized: '', 
      raw,
      error: 'Not a valid Iraqi mobile number. Must start with +9647',
      isIraqi: false 
    };
  }
  
  // Validate remaining digits are numeric
  const remaining = digits.substring(3); // Remove 964
  if (!/^\d{10}$/.test(remaining)) {
    return { 
      valid: false, 
      normalized: '', 
      raw,
      error: 'Phone number contains invalid characters',
      isIraqi: false 
    };
  }
  
  return { 
    valid: true, 
    normalized: '+' + digits, 
    raw,
    isIraqi: true 
  };
}

/**
 * Bulk normalize phone numbers with deduplication
 */
export function normalizePhoneNumbers(phones: string[]): {
  valid: { normalized: string; raw: string }[];
  invalid: { raw: string; error: string }[];
  duplicates: { normalized: string; count: number }[];
  stats: {
    total: number;
    valid: number;
    invalid: number;
    duplicatesRemoved: number;
  };
} {
  const seen = new Map<string, number>();
  const valid: { normalized: string; raw: string }[] = [];
  const invalid: { raw: string; error: string }[] = [];
  
  for (const raw of phones) {
    const result = normalizePhoneNumber(raw);
    
    if (!result.valid || !result.normalized) {
      invalid.push({ raw: result.raw, error: result.error || 'Invalid' });
      continue;
    }
    
    // Check for duplicates
    const count = seen.get(result.normalized) || 0;
    seen.set(result.normalized, count + 1);
    
    if (count === 0) {
      valid.push({ normalized: result.normalized, raw: result.raw });
    }
  }
  
  const duplicates = Array.from(seen.entries())
    .filter(([_, count]) => count > 1)
    .map(([normalized, count]) => ({ normalized, count }));
  
  const duplicatesRemoved = duplicates.reduce((sum, d) => sum + d.count - 1, 0);
  
  return {
    valid,
    invalid,
    duplicates,
    stats: {
      total: phones.length,
      valid: valid.length,
      invalid: invalid.length,
      duplicatesRemoved,
    },
  };
}

/**
 * Send a single WhatsApp message via Nabda
 */
export async function sendWhatsAppMessage(
  phone: string,
  message: string,
  options?: {
    campaignId?: string;
    messageTemplateId?: string;
    retryCount?: number;
  }
): Promise<NabdaResponse> {
  const validation = normalizePhoneNumber(phone);
  
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
      rawPhone: phone,
    };
  }
  
  const normalizedPhone = validation.normalized.replace('+', ''); // Nabda expects without +
  
  if (!NABDA_BASE_URL || !NABDA_TOKEN) {
    return {
      success: false,
      error: 'Nabda not configured. Set NABDA_BASE_URL and NABDA_TOKEN',
      rawPhone: phone,
    };
  }
  
  const maxRetries = options?.retryCount ?? 1;
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logInfo(`[Nabda] Sending message to ${validation.normalized} (attempt ${attempt}/${maxRetries})`);
      
      const response = await fetch(`${NABDA_BASE_URL}/message/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${NABDA_TOKEN}`,
        },
        body: JSON.stringify({
          phone: normalizedPhone,
          message: message,
        }),
      });

      const responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = `HTTP ${response.status}: ${JSON.stringify(responseData)}`;
        logError('Nabda', 'send', `Failed for ${validation.normalized}: ${errorMsg}`);
        
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          logInfo(`[Nabda] Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        
        return {
          success: false,
          error: errorMsg,
          rawPhone: phone,
          normalizedPhone: validation.normalized,
        };
      }

      const messageId = responseData.messageId || responseData.id || responseData.message_id || null;
      logInfo(`[Nabda] Message sent successfully to ${validation.normalized}, ID: ${messageId || 'unknown'}`);

      return {
        success: true,
        messageId: messageId,
        rawPhone: phone,
        normalizedPhone: validation.normalized,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logError('Nabda', 'send', `Error for ${validation.normalized}: ${lastError.message}`);
      
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  
  return {
    success: false,
    error: lastError?.message || 'Unknown error after retries',
    rawPhone: phone,
    normalizedPhone: validation.normalized,
  };
}

/**
 * Send bulk messages with pacing
 */
export async function sendBulkMessages(
  items: { phone: string; message: string; contactId?: string }[],
  options?: {
    campaignId?: string;
    delayMs?: number;
    batchSize?: number;
    batchPauseMs?: number;
    onProgress?: (completed: number, total: number, result: NabdaResponse) => void;
    onBatchComplete?: (batchNumber: number, results: NabdaResponse[]) => void;
  }
): Promise<BulkSendResult> {
  const results: NabdaResponse[] = [];
  const total = items.length;
  const delayMs = options?.delayMs ?? 3000; // Default 3 second delay
  const batchSize = options?.batchSize ?? 20;
  const batchPauseMs = options?.batchPauseMs ?? 60000; // Default 1 minute pause
  
  let sent = 0;
  let failed = 0;
  let currentBatch = 0;
  let batchResults: NabdaResponse[] = [];
  
  logInfo(`[Nabda] Starting bulk send: ${total} messages, delay: ${delayMs}ms, batch: ${batchSize}`);
  
  for (let i = 0; i < total; i++) {
    const item = items[i];
    
    // Check if we need a batch pause
    if (i > 0 && i % batchSize === 0) {
      currentBatch++;
      logInfo(`[Nabda] Batch ${currentBatch} complete. Pausing for ${batchPauseMs}ms...`);
      
      if (options?.onBatchComplete) {
        options.onBatchComplete(currentBatch, batchResults);
      }
      
      batchResults = [];
      await new Promise(r => setTimeout(r, batchPauseMs));
    }
    
    // Send the message
    const result = await sendWhatsAppMessage(item.phone, item.message, {
      campaignId: options?.campaignId,
    });
    
    if (result.contactId) {
      result.contactId = item.contactId;
    }
    
    results.push(result);
    batchResults.push(result);
    
    if (result.success) {
      sent++;
    } else {
      failed++;
    }
    
    if (options?.onProgress) {
      options.onProgress(i + 1, total, result);
    }
    
    // Delay before next message (except for last)
    if (i < total - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  
  // Final batch callback
  if (options?.onBatchComplete && batchResults.length > 0) {
    options.onBatchComplete(currentBatch + 1, batchResults);
  }
  
  logInfo(`[Nabda] Bulk send complete: ${sent} sent, ${failed} failed, ${total} total`);
  
  return {
    total,
    sent,
    failed,
    results,
  };
}

/**
 * Send typing indicator (best effort, non-blocking)
 */
export async function sendTypingIndicator(phone: string): Promise<boolean> {
  const validation = normalizePhoneNumber(phone);
  
  if (!validation.valid || !NABDA_BASE_URL || !NABDA_TOKEN) {
    return false;
  }
  
  const normalizedPhone = validation.normalized.replace('+', '');
  
  try {
    await fetch(`${NABDA_BASE_URL}/typing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NABDA_TOKEN}`,
      },
      body: JSON.stringify({
        phone: normalizedPhone,
      }),
    });
    return true;
  } catch (error) {
    // Typing indicator is optional, don't log errors
    return false;
  }
}

/**
 * Legacy validatePhoneNumber function (for backward compatibility)
 */
export function validatePhoneNumber(phone: string): { valid: boolean; error?: string } {
  const result = normalizePhoneNumber(phone);
  return { 
    valid: result.valid, 
    error: result.error 
  };
}

/**
 * Legacy cleanPhoneNumber function (for backward compatibility)
 * Returns digits only without country code for API calls
 */
export function cleanPhoneNumber(phone: string): string {
  const result = normalizePhoneNumber(phone);
  return result.valid ? result.normalized.replace('+', '') : '';
}
