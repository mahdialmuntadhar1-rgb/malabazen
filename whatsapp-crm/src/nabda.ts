import fetch from 'node-fetch';
import { SendResult } from './types.js';

export class NabdaClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {}

  async sendMessage(phone: string, message: string): Promise<SendResult> {
    const url = `${this.baseUrl}/message/send`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`
        },
        body: JSON.stringify({ phone, message })
      });

      const body = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        body
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        body: error instanceof Error ? error.message : 'Unknown network error'
      };
    }
  }

  async sendTyping(phone: string): Promise<boolean> {
    const url = `${this.baseUrl}/typing`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`
        },
        body: JSON.stringify({ phone })
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}
