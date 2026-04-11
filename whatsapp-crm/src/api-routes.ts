/**
 * API Routes for WhatsApp CRM Backend
 * Express routes for frontend integration
 */

import { Router, Request, Response } from 'express';
import { 
  createContact, 
  getContacts, 
  getContactById, 
  updateContact, 
  deleteContact,
  getContactByPhone,
  createCampaign,
  getCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  addContactsToCampaign,
  getCampaignContacts,
  createMessage,
  getMessagesByContact,
  getMessageTemplates,
  createMessageTemplate,
  updateMessageTemplate,
  deleteMessageTemplate,
  getConversations,
  getCampaignStatistics,
  getSystemStatus,
  createMessageEvent,
  updateMessageByProviderId
} from './supabase-service';
import { 
  sendWhatsAppMessage, 
  sendBulkMessages, 
  normalizePhoneNumber,
  normalizePhoneNumbers 
} from './nabda';
import { logInfo, logError } from './logger';
import { Contact } from './types';
import { supabase } from './supabase';

const router = Router();

// =====================================================
// HEALTH & STATUS
// =====================================================

router.get('/health', async (req: Request, res: Response) => {
  const status = await getSystemStatus();
  res.json({
    status: 'ok',
    service: 'whatsapp-crm-api',
    timestamp: new Date().toISOString(),
    ...status
  });
});

router.get('/readiness', async (req: Request, res: Response) => {
  const checks = {
    supabase_url: !!process.env.SUPABASE_URL,
    supabase_service_key: !!process.env.SUPABASE_SERVICE_KEY,
    nabda_base_url: !!process.env.NABDA_BASE_URL,
    nabda_token: !!process.env.NABDA_TOKEN,
  };

  const allPassed = Object.values(checks).every(Boolean);
  const statusCode = allPassed ? 200 : 503;

  res.status(statusCode).json({
    ready: allPassed,
    checks,
    timestamp: new Date().toISOString(),
  });
});

// =====================================================
// CONTACTS API
// =====================================================

router.get('/contacts', async (req: Request, res: Response) => {
  try {
    const { status, governorate, category, search, limit, offset } = req.query;
    const result = await getContacts({
      status: status as string,
      governorate: governorate as string,
      category: category as string,
      search: search as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    logError('API', 'GET /contacts', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to fetch contacts' });
  }
});

router.get('/contacts/:id', async (req: Request, res: Response) => {
  try {
    const contact = await getContactById(req.params.id);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }
    res.json({ success: true, data: contact });
  } catch (error) {
    logError('API', 'GET /contacts/:id', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to fetch contact' });
  }
});

router.post('/contacts', async (req: Request, res: Response) => {
  try {
    const { business_name, raw_phone, governorate, category } = req.body;
    
    if (!business_name || !raw_phone) {
      return res.status(400).json({ success: false, error: 'business_name and raw_phone are required' });
    }

    // Normalize the phone number
    const validation = normalizePhoneNumber(raw_phone);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    // Check for duplicate
    const existing = await getContactByPhone(validation.normalized);
    if (existing) {
      return res.status(409).json({ 
        success: false, 
        error: 'Contact with this phone number already exists',
        data: existing 
      });
    }

    const contact = await createContact({
      business_name,
      raw_phone,
      normalized_phone: validation.normalized,
      governorate,
      category,
      whatsapp_status: 'pending'
    });

    if (!contact) {
      return res.status(500).json({ success: false, error: 'Failed to create contact' });
    }

    res.status(201).json({ success: true, data: contact });
  } catch (error) {
    logError('API', 'POST /contacts', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to create contact' });
  }
});

router.patch('/contacts/:id', async (req: Request, res: Response) => {
  try {
    const contact = await updateContact(req.params.id, req.body);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }
    res.json({ success: true, data: contact });
  } catch (error) {
    logError('API', 'PATCH /contacts/:id', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to update contact' });
  }
});

router.delete('/contacts/:id', async (req: Request, res: Response) => {
  try {
    const success = await deleteContact(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }
    res.json({ success: true });
  } catch (error) {
    logError('API', 'DELETE /contacts/:id', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to delete contact' });
  }
});

// =====================================================
// MESSAGING API
// =====================================================

router.post('/send-message', async (req: Request, res: Response) => {
  try {
    const { phone, message, contact_id, campaign_id } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ success: false, error: 'phone and message are required' });
    }

    logInfo(`[API] Sending message to ${phone}`);

    // Send via Nabda
    const result = await sendWhatsAppMessage(phone, message);

    if (!result.success) {
      logError('API', 'POST /send-message', result.error || 'Unknown error');
      return res.status(502).json({ 
        success: false, 
        error: result.error,
        raw_phone: result.rawPhone,
        normalized_phone: result.normalizedPhone
      });
    }

    // Store in database
    let contactId = contact_id;
    
    // If no contact_id provided, try to find by phone
    if (!contactId && result.normalizedPhone) {
      const contact = await getContactByPhone(result.normalizedPhone);
      if (contact) {
        contactId = contact.id;
      }
    }

    if (contactId) {
      // Create message record
      await createMessage({
        contact_id: contactId,
        campaign_id,
        message_text: message,
        direction: 'outbound',
        message_type: 'text',
        provider_message_id: result.messageId,
        provider_status: 'sent',
        sent_at: new Date().toISOString()
      });

      // Update contact status
      await updateContact(contactId, { 
        whatsapp_status: 'sent',
        whatsapp_sent_at: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: {
        message_id: result.messageId,
        normalized_phone: result.normalizedPhone,
        contact_id: contactId
      }
    });
  } catch (error) {
    logError('API', 'POST /send-message', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

router.post('/send-bulk', async (req: Request, res: Response) => {
  try {
    const { contacts, message, campaign_id, delay_seconds = 3, batch_size = 20 } = req.body;

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ success: false, error: 'contacts array is required' });
    }

    if (!message) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    // Validate and normalize all phone numbers
    const normalized = normalizePhoneNumbers(contacts.map((c: any) => c.phone || c));
    
    if (normalized.valid.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid phone numbers found',
        stats: normalized.stats,
        invalid: normalized.invalid
      });
    }

    // Create campaign if not provided
    let campaignId = campaign_id;
    if (!campaignId) {
      const campaign = await createCampaign({
        name: `Bulk send ${new Date().toISOString()}`,
        status: 'running',
        message_text: message,
        delay_seconds,
        total_contacts: normalized.valid.length,
        sent_count: 0,
        failed_count: 0,
        started_at: new Date().toISOString()
      });
      if (campaign) {
        campaignId = campaign.id;
      }
    }

    // Prepare send items
    const sendItems = normalized.valid.map(v => ({
      phone: v.normalized,
      message,
      contactId: undefined as string | undefined
    }));

    // Start bulk send (non-blocking response)
    res.json({
      success: true,
      data: {
        campaign_id: campaignId,
        stats: normalized.stats,
        message: 'Bulk send started'
      }
    });

    // Continue sending in background
    (async () => {
      const results = await sendBulkMessages(sendItems, {
        campaignId,
        delayMs: delay_seconds * 1000,
        batchSize: batch_size,
        onProgress: async (completed, total, result) => {
          logInfo(`[Bulk] Progress: ${completed}/${total} - ${result.success ? 'sent' : 'failed'}`);
        }
      });

      // Update campaign status
      if (campaignId) {
        await updateCampaign(campaignId, {
          status: 'completed',
          sent_count: results.sent,
          failed_count: results.failed,
          completed_at: new Date().toISOString()
        });
      }

      logInfo(`[Bulk] Complete: ${results.sent} sent, ${results.failed} failed`);
    })();

  } catch (error) {
    logError('API', 'POST /send-bulk', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to start bulk send' });
  }
});

// =====================================================
// CAMPAIGNS API
// =====================================================

router.get('/campaigns', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const campaigns = await getCampaigns(status as string);
    res.json({ success: true, data: campaigns });
  } catch (error) {
    logError('API', 'GET /campaigns', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to fetch campaigns' });
  }
});

router.get('/campaigns/:id', async (req: Request, res: Response) => {
  try {
    const campaign = await getCampaignById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    res.json({ success: true, data: campaign });
  } catch (error) {
    logError('API', 'GET /campaigns/:id', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to fetch campaign' });
  }
});

router.post('/campaigns', async (req: Request, res: Response) => {
  try {
    const { name, template_id, message_text, delay_seconds = 20 } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const campaign = await createCampaign({
      name,
      status: 'draft',
      template_id,
      message_text,
      delay_seconds,
      total_contacts: 0,
      sent_count: 0,
      delivered_count: 0,
      failed_count: 0,
      replied_count: 0
    });

    if (!campaign) {
      return res.status(500).json({ success: false, error: 'Failed to create campaign' });
    }

    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    logError('API', 'POST /campaigns', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to create campaign' });
  }
});

router.patch('/campaigns/:id', async (req: Request, res: Response) => {
  try {
    const campaign = await updateCampaign(req.params.id, req.body);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    res.json({ success: true, data: campaign });
  } catch (error) {
    logError('API', 'PATCH /campaigns/:id', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to update campaign' });
  }
});

router.delete('/campaigns/:id', async (req: Request, res: Response) => {
  try {
    const success = await deleteCampaign(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    res.json({ success: true });
  } catch (error) {
    logError('API', 'DELETE /campaigns/:id', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to delete campaign' });
  }
});

router.post('/campaigns/:id/contacts', async (req: Request, res: Response) => {
  try {
    const { contact_ids } = req.body;
    if (!Array.isArray(contact_ids)) {
      return res.status(400).json({ success: false, error: 'contact_ids array is required' });
    }

    const success = await addContactsToCampaign(req.params.id, contact_ids);
    if (!success) {
      return res.status(500).json({ success: false, error: 'Failed to add contacts to campaign' });
    }

    res.json({ success: true, message: `${contact_ids.length} contacts added to campaign` });
  } catch (error) {
    logError('API', 'POST /campaigns/:id/contacts', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to add contacts to campaign' });
  }
});

router.get('/campaigns/:id/contacts', async (req: Request, res: Response) => {
  try {
    const contacts = await getCampaignContacts(req.params.id);
    res.json({ success: true, data: contacts });
  } catch (error) {
    logError('API', 'GET /campaigns/:id/contacts', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to fetch campaign contacts' });
  }
});

// =====================================================
// TEMPLATES API
// =====================================================

router.get('/templates', async (req: Request, res: Response) => {
  try {
    const { active } = req.query;
    const templates = await getMessageTemplates(active !== 'false');
    res.json({ success: true, data: templates });
  } catch (error) {
    logError('API', 'GET /templates', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to fetch templates' });
  }
});

router.post('/templates', async (req: Request, res: Response) => {
  try {
    const { name, body, template_type = 'text', variables = [] } = req.body;

    if (!name || !body) {
      return res.status(400).json({ success: false, error: 'name and body are required' });
    }

    const template = await createMessageTemplate({
      name,
      body,
      template_type,
      variables,
      is_active: true
    });

    if (!template) {
      return res.status(500).json({ success: false, error: 'Failed to create template' });
    }

    res.status(201).json({ success: true, data: template });
  } catch (error) {
    logError('API', 'POST /templates', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to create template' });
  }
});

router.patch('/templates/:id', async (req: Request, res: Response) => {
  try {
    const template = await updateMessageTemplate(req.params.id, req.body);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true, data: template });
  } catch (error) {
    logError('API', 'PATCH /templates/:id', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to update template' });
  }
});

router.delete('/templates/:id', async (req: Request, res: Response) => {
  try {
    const success = await deleteMessageTemplate(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true });
  } catch (error) {
    logError('API', 'DELETE /templates/:id', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to delete template' });
  }
});

// =====================================================
// INBOX / MESSAGES API
// =====================================================

router.get('/inbox', async (req: Request, res: Response) => {
  try {
    const { limit } = req.query;
    const conversations = await getConversations(limit ? parseInt(limit as string) : 50);
    res.json({ success: true, data: conversations });
  } catch (error) {
    logError('API', 'GET /inbox', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to fetch inbox' });
  }
});

router.get('/contacts/:id/messages', async (req: Request, res: Response) => {
  try {
    const { limit } = req.query;
    const messages = await getMessagesByContact(
      req.params.id,
      limit ? parseInt(limit as string) : 50
    );
    res.json({ success: true, data: messages });
  } catch (error) {
    logError('API', 'GET /contacts/:id/messages', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to fetch messages' });
  }
});

// =====================================================
// STATISTICS API
// =====================================================

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await getCampaignStatistics();
    res.json({ success: true, data: stats });
  } catch (error) {
    logError('API', 'GET /stats', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to fetch statistics' });
  }
});

// =====================================================
// PHONE VALIDATION API
// =====================================================

router.post('/validate-phones', async (req: Request, res: Response) => {
  try {
    const { phones } = req.body;
    
    if (!Array.isArray(phones)) {
      return res.status(400).json({ success: false, error: 'phones array is required' });
    }

    const result = normalizePhoneNumbers(phones);
    res.json({ success: true, data: result });
  } catch (error) {
    logError('API', 'POST /validate-phones', error instanceof Error ? error.message : String(error));
    res.status(500).json({ success: false, error: 'Failed to validate phones' });
  }
});

// =====================================================
// NABDA DASHBOARD API - Simple HTML/JS dashboard endpoints
// =====================================================

// GET /api/nabda-dashboard/logs - Get recent webhook events
router.get('/nabda-dashboard/logs', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    
    const { data, error } = await supabase
      .from('webhook_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json({ 
      success: true, 
      data: data || [],
      count: data?.length || 0 
    });
  } catch (err) {
    console.error('Error fetching webhook logs:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch webhook logs',
      data: [] 
    });
  }
});

// POST /api/nabda-dashboard/send - Send single message
router.post('/nabda-dashboard/send', async (req: Request, res: Response) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        error: 'Phone and message are required'
      });
    }

    // Validate phone
    const validation = normalizePhoneNumber(phone);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error || 'Invalid phone number'
      });
    }

    // Send via Nabda
    const result = await sendWhatsAppMessage(phone, message);

    // Log to database
    await supabase.from('messages').insert({
      direction: 'outbound',
      provider: 'nabda',
      phone: validation.normalized,
      body: message,
      status: result.success ? 'sent' : 'failed',
      sent_at: result.success ? new Date().toISOString() : null
    });

    res.json({
      success: result.success,
      data: result,
      error: result.error
    });
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send message' 
    });
  }
});

// POST /api/nabda-dashboard/send-bulk - Send bulk messages
router.post('/nabda-dashboard/send-bulk', async (req: Request, res: Response) => {
  try {
    const { phones, message } = req.body;

    if (!phones || !Array.isArray(phones) || phones.length === 0 || !message) {
      return res.status(400).json({
        success: false,
        error: 'phones array and message are required'
      });
    }

    const results: Array<{ phone: string; success: boolean; messageId?: string; error?: string }> = [];
    let success = 0;
    let failed = 0;

    // Process with delay to avoid rate limits
    for (const phone of phones) {
      const validation = normalizePhoneNumber(phone);
      
      if (!validation.valid) {
        results.push({ phone, success: false, error: validation.error });
        failed++;
        continue;
      }

      const result = await sendWhatsAppMessage(phone, message);
      
      // Log to database
      await supabase.from('messages').insert({
        direction: 'outbound',
        provider: 'nabda',
        phone: validation.normalized,
        body: message,
        status: result.success ? 'sent' : 'failed',
        sent_at: result.success ? new Date().toISOString() : null
      });

      results.push({ 
        phone: validation.normalized, 
        success: result.success, 
        messageId: result.messageId, 
        error: result.error 
      });
      
      if (result.success) success++;
      else failed++;

      // Small delay between messages
      await new Promise(r => setTimeout(r, 200));
    }

    res.json({
      success: true,
      stats: { total: phones.length, success, failed },
      results
    });
  } catch (err) {
    console.error('Error in bulk send:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send bulk messages' 
    });
  }
});

// GET /api/nabda-dashboard/status - Check Nabda configuration
router.get('/nabda-dashboard/status', (req: Request, res: Response) => {
  const configured = !!(process.env.NABDA_BASE_URL && process.env.NABDA_TOKEN);
  
  res.json({
    success: true,
    configured,
    baseUrl: process.env.NABDA_BASE_URL ? 'Set' : 'Not set',
    token: process.env.NABDA_TOKEN ? 'Set' : 'Not set'
  });
});

export default router;
