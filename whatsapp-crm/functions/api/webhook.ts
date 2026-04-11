import { json, error, type Env } from "../_shared/types";

/**
 * Nabda OTP Webhook Handler
 * Handles: message.sent, message.received, message.ack events
 * Stores all events in Supabase for CRM tracking
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Actual Nabda OTP Webhook Payload Format
 * {
 *   "instanceId": "uuid",
 *   "event": "message.sent",
 *   "payload": {
 *     "messageId": "uuid",
 *     "status": "SENT",
 *     "phone": "+1234567890",
 *     "message": "Your OTP is 123456"
 *   },
 *   "timestamp": "2026-01-01T00:00:00.000Z"
 * }
 */
interface WebhookPayload {
  instanceId?: string;
  event?: string;
  type?: string;
  timestamp?: string;
  // Nested payload object
  payload?: {
    messageId?: string;
    id?: string;
    status?: string;
    phone?: string;
    from?: string;
    to?: string;
    message?: string;
    body?: string;
    text?: string;
    ack?: string;
  };
  // Legacy flat format (fallback)
  messageId?: string;
  id?: string;
  phone?: string;
  from?: string;
  to?: string;
  message?: string;
  body?: string;
  text?: string;
  ack?: string;
  data?: Record<string, unknown>;
}

interface Contact {
  id: string;
  business_name: string;
  normalized_phone: string;
}

// ============================================================================
// PHONE NORMALIZATION (matches backend)
// ============================================================================

function normalizePhoneNumber(phone: string): string | null {
  if (!phone) return null;
  
  let digits = phone.replace(/[^\d]/g, '');
  
  // Handle 00964... format
  if (digits.startsWith('00964')) {
    digits = digits.substring(2);
  }
  
  // Handle numbers starting with 0 (local Iraqi format)
  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }
  
  // If doesn't start with 964, check if it's a local number
  if (!digits.startsWith('964')) {
    if (/^7\d{9}$/.test(digits)) {
      digits = '964' + digits;
    } else {
      return null;
    }
  }
  
  // Validate length and format
  if (digits.length !== 13 || !digits.startsWith('9647')) {
    return null;
  }
  
  return '+' + digits;
}

// ============================================================================
// SUPABASE CLIENT HELPERS
// ============================================================================

async function supabaseRequest(
  env: Env,
  path: string,
  method: string,
  body?: unknown
): Promise<{ data?: unknown; error?: string; status?: number }> {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
  const headers: Record<string, string> = {
    'apikey': env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal',
  };

  if (method === 'GET') {
    headers['Accept'] = 'application/vnd.pgrst.object+json';
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { error: `HTTP ${response.status}: ${errorText}`, status: response.status };
    }

    // Handle empty responses (204)
    if (response.status === 204) {
      return { status: 204 };
    }

    const data = await response.json().catch(() => null);
    return { data, status: response.status };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ============================================================================
// CONTACT OPERATIONS
// ============================================================================

async function getOrCreateContact(
  env: Env,
  normalizedPhone: string,
  rawPhone: string
): Promise<Contact | null> {
  // Try to find existing contact
  const { data: existing, error: lookupError } = await supabaseRequest(
    env,
    `contacts?normalized_phone=eq.${encodeURIComponent(normalizedPhone)}&select=id,business_name,normalized_phone&limit=1`,
    'GET'
  );

  if (existing && Array.isArray(existing) && existing.length > 0) {
    return existing[0] as Contact;
  }

  if (lookupError) {
    console.error('Error looking up contact:', lookupError);
  }

  // Create new contact with unknown business name
  const { data: created, error: createError } = await supabaseRequest(
    env,
    'contacts',
    'POST',
    {
      business_name: 'Unknown',
      raw_phone: rawPhone,
      normalized_phone: normalizedPhone,
      whatsapp_status: 'pending'
    }
  );

  if (createError) {
    console.error('Error creating contact:', createError);
    return null;
  }

  // Return the created contact
  if (Array.isArray(created) && created.length > 0) {
    return created[0] as Contact;
  }

  return null;
}

// ============================================================================
// MESSAGE OPERATIONS
// ============================================================================

async function createOutboundMessage(
  env: Env,
  contactId: string,
  providerMessageId: string,
  timestamp: string,
  messageText: string = ''
): Promise<string | null> {
  const { data, error } = await supabaseRequest(
    env,
    'messages',
    'POST',
    {
      contact_id: contactId,
      message_text: messageText,
      direction: 'outbound',
      message_type: 'text',
      provider_message_id: providerMessageId,
      provider_status: 'sent',
      sent_at: timestamp
    }
  );

  if (error) {
    console.error('Error creating outbound message:', error);
    return null;
  }

  if (Array.isArray(data) && data.length > 0) {
    return data[0].id;
  }

  return null;
}

async function createInboundMessage(
  env: Env,
  contactId: string,
  messageText: string,
  providerMessageId: string | null,
  timestamp: string
): Promise<string | null> {
  const { data, error } = await supabaseRequest(
    env,
    'messages',
    'POST',
    {
      contact_id: contactId,
      message_text: messageText,
      direction: 'inbound',
      message_type: 'text',
      provider_message_id: providerMessageId,
      provider_status: 'received',
      sent_at: timestamp
    }
  );

  if (error) {
    console.error('Error creating inbound message:', error);
    return null;
  }

  if (Array.isArray(data) && data.length > 0) {
    return data[0].id;
  }

  return null;
}

async function updateMessageStatus(
  env: Env,
  providerMessageId: string,
  status: string,
  timestamp: string
): Promise<boolean> {
  const updates: Record<string, unknown> = { provider_status: status };
  
  if (status === 'delivered') {
    updates.delivered_at = timestamp;
  } else if (status === 'read') {
    updates.read_at = timestamp;
  } else if (status === 'failed') {
    updates.failed_at = timestamp;
  }

  const { error } = await supabaseRequest(
    env,
    `messages?provider_message_id=eq.${encodeURIComponent(providerMessageId)}`,
    'PATCH',
    updates
  );

  if (error) {
    console.error('Error updating message status:', error);
    return false;
  }

  return true;
}

// ============================================================================
// MESSAGE EVENTS
// ============================================================================

async function createMessageEvent(
  env: Env,
  messageId: string | null,
  providerMessageId: string | null,
  eventType: string,
  eventData: Record<string, unknown>
): Promise<boolean> {
  const { error } = await supabaseRequest(
    env,
    'message_events',
    'POST',
    {
      message_id: messageId,
      provider_message_id: providerMessageId,
      event_type: eventType,
      event_data: eventData
    }
  );

  if (error) {
    console.error('Error creating message event:', error);
    return false;
  }

  return true;
}

// ============================================================================
// WEBHOOK LOGGING
// ============================================================================

async function logWebhook(
  env: Env,
  payload: WebhookPayload,
  eventType: string,
  processed: boolean,
  result?: Record<string, unknown>,
  errorMessage?: string,
  requestHeaders?: Headers
): Promise<string | null> {
  const { data, error } = await supabaseRequest(
    env,
    'webhook_logs',
    'POST',
    {
      provider: 'nabda',
      event_type: eventType,
      payload: payload as Record<string, unknown>,
      processed,
      processing_result: result,
      error_message: errorMessage,
      ip_address: requestHeaders?.get('cf-connecting-ip') || requestHeaders?.get('x-forwarded-for') || null,
      user_agent: requestHeaders?.get('user-agent') || null
    }
  );

  if (error) {
    console.error('Error logging webhook:', error);
    return null;
  }

  if (Array.isArray(data) && data.length > 0) {
    return data[0].id;
  }

  return null;
}

// ============================================================================
// FOLLOW-UP LOGIC (Strategy B)
// ============================================================================

const STRATEGY_B_FOLLOWUP = `ممتاز! 🎉

Iraq Compass هو دليل الأعمال العراقي الأول.
500+ مشروع مسجل. العملاء يبحثون عنك كل يوم.

سجّل مشروعك مجاناً هنا 👇
https://iraq-compass.pages.dev`;

function shouldSendFollowUp(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  const positiveResponses = ['نعم', 'yes', 'yeah', 'yup', 'sure', 'ok', 'تمام', 'أكيد', 'بالتأكيد', 'تمام', 'حاضر'];
  return positiveResponses.some((response) => normalized.includes(response));
}

async function sendFollowUp(env: Env, phone: string): Promise<{ success: boolean; messageId?: string }> {
  const cleanPhone = phone.replace(/\+/g, '');

  try {
    const response = await fetch(`${env.NABDA_BASE_URL}/message/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.NABDA_TOKEN}`,
      },
      body: JSON.stringify({
        phone: cleanPhone,
        message: STRATEGY_B_FOLLOWUP,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to send follow-up:', errorText);
      return { success: false };
    }

    const responseData = await response.json().catch(() => ({}));
    return { 
      success: true, 
      messageId: responseData.messageId || responseData.id || null 
    };
  } catch (err) {
    console.error('Error sending follow-up:', err);
    return { success: false };
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

async function handleMessageSent(
  env: Env,
  payload: WebhookPayload,
  timestamp: string
): Promise<{ success: boolean; messageId?: string }> {
  // Extract from nested payload or flat format
  const providerMessageId = payload.payload?.messageId || payload.payload?.id || payload.messageId || payload.id;
  const phone = payload.payload?.phone || payload.payload?.to || payload.phone || payload.to;
  const messageText = payload.payload?.message || payload.message || '';

  if (!providerMessageId || !phone) {
    console.log('[Webhook] Missing providerMessageId or phone in message.sent');
    return { success: false };
  }

  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    return { success: false };
  }

  // Get or create contact
  const contact = await getOrCreateContact(env, normalizedPhone, phone);
  if (!contact) {
    return { success: false };
  }

  // Create outbound message record
  const messageId = await createOutboundMessage(env, contact.id, providerMessageId, timestamp, messageText);
  
  // Log event
  await createMessageEvent(env, messageId, providerMessageId, 'sent', {
    phone: normalizedPhone,
    message: messageText?.substring(0, 100) || '',
    timestamp
  });

  // Update contact status
  await supabaseRequest(
    env,
    `contacts?id=eq.${contact.id}`,
    'PATCH',
    { 
      whatsapp_status: 'sent',
      whatsapp_sent_at: timestamp
    }
  );

  return { success: true, messageId: messageId || undefined };
}

async function handleMessageReceived(
  env: Env,
  payload: WebhookPayload,
  timestamp: string
): Promise<{ success: boolean; replySent?: boolean; contactName?: string }> {
  // Extract from nested payload or flat format
  const phone = payload.payload?.phone || payload.payload?.from || payload.phone || payload.from;
  const messageText = payload.payload?.message || payload.payload?.body || payload.payload?.text || 
                     payload.message || payload.body || payload.text || '';
  const providerMessageId = payload.payload?.messageId || payload.payload?.id || payload.messageId || payload.id;

  if (!phone || !messageText) {
    console.log('[Webhook] Missing phone or message in message.received');
    return { success: false };
  }

  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    return { success: false };
  }

  // Get or create contact
  const contact = await getOrCreateContact(env, normalizedPhone, phone);
  if (!contact) {
    return { success: false };
  }

  // Create inbound message
  const messageId = await createInboundMessage(
    env,
    contact.id,
    messageText,
    providerMessageId || null,
    timestamp
  );

  // Log event
  await createMessageEvent(env, messageId, providerMessageId || null, 'received', {
    phone: normalizedPhone,
    message: messageText.substring(0, 100),
    timestamp
  });

  // Update contact status
  await supabaseRequest(
    env,
    `contacts?id=eq.${contact.id}`,
    'PATCH',
    { whatsapp_status: 'replied' }
  );

  // Check if we should send follow-up (Strategy B)
  let replySent = false;
  if (shouldSendFollowUp(messageText)) {
    const followUpResult = await sendFollowUp(env, normalizedPhone);
    if (followUpResult.success) {
      replySent = true;
      // Log the follow-up sent
      await createMessageEvent(env, null, followUpResult.messageId || null, 'follow_up_sent', {
        phone: normalizedPhone,
        trigger: 'positive_response',
        timestamp
      });
    }
  }

  return { 
    success: true, 
    replySent,
    contactName: contact.business_name
  };
}

async function handleMessageAck(
  env: Env,
  payload: WebhookPayload,
  timestamp: string
): Promise<{ success: boolean }> {
  // Extract from nested payload or flat format
  const providerMessageId = payload.payload?.messageId || payload.payload?.id || payload.messageId || payload.id;
  const ack = payload.payload?.ack || payload.payload?.status || payload.ack;

  if (!providerMessageId || !ack) {
    console.log('[Webhook] Missing providerMessageId or ack in message.ack');
    return { success: false };
  }

  // Map Nabda ack to our status
  let status = 'unknown';
  if (ack === 'delivered') status = 'delivered';
  else if (ack === 'read') status = 'read';
  else if (ack === 'failed') status = 'failed';
  else if (ack === 'sent') status = 'sent';

  // Update message status
  const updated = await updateMessageStatus(env, providerMessageId, status, timestamp);

  // Log event
  await createMessageEvent(env, null, providerMessageId, 'ack', {
    ack,
    status,
    timestamp
  });

  return { success: updated };
}

// ============================================================================
// MAIN WEBHOOK HANDLER
// ============================================================================

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const startTime = Date.now();
  let payload: WebhookPayload | null = null;
  let logId: string | null = null;

  try {
    payload = await context.request.json() as WebhookPayload;
    
    console.log('[Webhook] Received:', JSON.stringify(payload).substring(0, 500));

    // Extract event type from nested structure
    const event = (payload.event || payload.type || 'unknown').toLowerCase();
    // Timestamp can be in root or nested payload
    const timestamp = payload.timestamp || 
                     (payload.payload?.status && new Date().toISOString()) || 
                     new Date().toISOString();

    // Route to appropriate handler
    let result: { success: boolean; [key: string]: unknown } = { success: false };
    let processed = false;
    let errorMessage: string | undefined;

    switch (event) {
      case 'message.sent':
      case 'sent':
        result = await handleMessageSent(context.env, payload, timestamp);
        processed = result.success;
        break;

      case 'message.received':
      case 'received':
      case 'message':
        result = await handleMessageReceived(context.env, payload, timestamp);
        processed = result.success;
        break;

      case 'message.ack':
      case 'ack':
        result = await handleMessageAck(context.env, payload, timestamp);
        processed = result.success;
        break;

      default:
        console.log(`[Webhook] Unknown event type: ${event}`);
        errorMessage = `Unknown event type: ${event}`;
        break;
    }

    // Log webhook
    logId = await logWebhook(
      context.env,
      payload,
      event,
      processed,
      result,
      errorMessage,
      context.request.headers
    );

    const duration = Date.now() - startTime;
    console.log(`[Webhook] Processed ${event} in ${duration}ms, log: ${logId}`);

    // Always return 200 to acknowledge receipt
    return json({
      received: true,
      processed,
      event,
      log_id: logId,
      ...result
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Webhook] Error:', errorMessage);
    
    // Log error
    if (payload) {
      await logWebhook(
        context.env,
        payload,
        'error',
        false,
        { error: errorMessage },
        errorMessage,
        context.request.headers
      );
    }

    // Still return 200 to prevent retries
    return json({
      received: true,
      processed: false,
      error: errorMessage
    });
  }
};

// Health check and info
export const onRequestGet: PagesFunction<Env> = async (context) => {
  return json({
    status: 'ok',
    service: 'whatsapp-crm-webhook',
    strategy: 'B',
    endpoints: {
      post: '/api/webhook - Receive WhatsApp webhooks',
    },
    env: {
      supabase: !!context.env.SUPABASE_URL,
      nabda: !!context.env.NABDA_TOKEN,
    },
  });
};

// Handle OPTIONS for CORS
export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
