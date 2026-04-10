import fetch from 'node-fetch';
import { NabdaResponse } from './types';

const NABDA_BASE_URL =
  process.env.NABDA_BASE_URL ||
  'https://api.nabdaotp.com/inst/84cf1e71-6f8d-4411-9e58-de6a18e6007c';
const NABDA_TOKEN = process.env.NABDA_TOKEN || '';

if (!NABDA_TOKEN) {
  throw new Error('Missing NABDA_TOKEN in environment variables');
}

function cleanPhoneNumber(phone: string): string {
  // Remove +, spaces, dashes
  return phone.replace(/\+/g, '').replace(/\s/g, '').replace(/-/g, '');
}

export async function sendWhatsAppMessage(
  phone: string,
  message: string
): Promise<NabdaResponse> {
  const cleanPhone = cleanPhoneNumber(phone);

  // Validate Iraqi format
  if (!cleanPhone.startsWith('964')) {
    return {
      success: false,
      error: `Invalid phone number: ${phone}. Must start with 964`,
    };
  }

  if (cleanPhone.length < 10 || cleanPhone.length > 15) {
    return {
      success: false,
      error: `Invalid phone number length: ${phone}`,
    };
  }

  try {
    const response = await fetch(`${NABDA_BASE_URL}/message/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NABDA_TOKEN}`,
      },
      body: JSON.stringify({
        phone: cleanPhone,
        message: message,
      }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${JSON.stringify(responseData)}`,
      };
    }

    return {
      success: true,
      messageId: responseData.messageId || responseData.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function sendTypingIndicator(phone: string): Promise<void> {
  const cleanPhone = cleanPhoneNumber(phone);

  try {
    await fetch(`${NABDA_BASE_URL}/typing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NABDA_TOKEN}`,
      },
      body: JSON.stringify({
        phone: cleanPhone,
      }),
    });
  } catch (error) {
    // Typing indicator is optional, don't fail on error
  }
}

export function validatePhoneNumber(phone: string): { valid: boolean; error?: string } {
  const cleanPhone = cleanPhoneNumber(phone);

  if (!phone || phone.trim() === '') {
    return { valid: false, error: 'Phone number is empty' };
  }

  if (!cleanPhone.startsWith('964')) {
    return { valid: false, error: 'Phone number must start with 964' };
  }

  if (cleanPhone.length < 10 || cleanPhone.length > 15) {
    return { valid: false, error: 'Phone number length invalid' };
  }

  return { valid: true };
}
