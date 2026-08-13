import https from 'node:https';
import { resolve as dnsResolve } from 'node:dns';
import { promisify } from 'node:util';

const dnsResolveAsync = promisify(dnsResolve);
const API_HOST = 'api.telegram.org';
const MAX_CHUNK = 3400;

/**
 * عميل تلجرام يتجاوز حجب DNS بفضل DoH (DNS over HTTPS)
 * - تحليل النطاق عبر dns.google ثم الاتصال مباشرة على الـ IP
 * - fallback إلى نظام DNS العادي لو فشل DoH
 */
export class TelegramClient {
  private token: string;
  private chatId: string;
  private ipCache: { ips: string[]; at: number } | null = null;

  constructor(token: string, chatId: string) {
    this.token = token;
    this.chatId = chatId;
  }

  get channelId(): string {
    return this.chatId;
  }

  private async resolveHost(): Promise<string[]> {
    if (this.ipCache && Date.now() - this.ipCache.at < 60 * 60 * 1000) {
      return this.ipCache.ips;
    }
    const ips: string[] = [];
    try {
      // DoH عبر Google — يتجاوز حجب DNS المحلي
      const url = `https://dns.google/resolve?name=${API_HOST}&type=A`;
      const body = await this.httpsGetJson(url, true);
      if (Array.isArray(body?.Answer)) {
        for (const a of body.Answer) {
          if (a.type === 1 && typeof a.data === 'string') ips.push(a.data);
        }
      }
    } catch (e) {
      console.warn('[telegram] DoH resolution failed, trying system DNS:', (e as Error).message);
    }
    if (ips.length === 0) {
      try {
        const res = await dnsResolveAsync(API_HOST);
        ips.push(...res);
      } catch (e) {
        console.warn('[telegram] system DNS resolution failed:', (e as Error).message);
      }
    }
    this.ipCache = { ips, at: Date.now() };
    return ips;
  }

  private httpsGetJson(url: string, isDoh = false): Promise<any> {
    return new Promise((resolve, reject) => {
      const req = https.get(
        url,
        { headers: isDoh ? { accept: 'application/dns-json' } : { accept: 'application/json' } },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error('Invalid JSON response'));
            }
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(15000, () => req.destroy(new Error('Timeout')));
    });
  }

  /**
   * طلب HTTPS مباشر إلى الـ API مع تثبيت SNI ليتم التحقق من الشهادة
   */
  private request(method: string, params: Record<string, any> = {}): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const path = `/bot${this.token}/${method}`;
      const body = JSON.stringify(params);
      const doRequest = (host: string, ip?: string) =>
        new Promise<any>((res, rej) => {
          const req = https.request(
            {
              hostname: ip ?? host,
              servername: ip ? host : undefined,
              port: 443,
              path,
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                Host: host,
              },
              timeout: 20000,
            },
            (response) => {
              let data = '';
              response.on('data', (c) => (data += c));
              response.on('end', () => {
                try {
                  res(JSON.parse(data));
                } catch {
                  rej(new Error('Telegram returned non-JSON'));
                }
              });
            }
          );
          req.on('timeout', () => req.destroy(new Error('Request timeout')));
          req.on('error', rej);
          req.write(body);
          req.end();
        });

      try {
        // المحاولة الأولى عبر الـ IP المباشر (لتجاوز حجب DNS)
        const ips = await this.resolveHost();
        let lastErr: unknown = null;
        for (const ip of ips) {
          try {
            const result = await doRequest(API_HOST, ip);
            if (result?.ok) return resolve(result.result);
            lastErr = new Error(result?.description ?? `API error (${result?.error_code ?? '?'})`);
            if (result?.error_code === 429) {
              // rate limit - انتظار قصير ثم المحاولة مجدداً
              await new Promise((r) => setTimeout(r, 1500));
              continue;
            }
            break;
          } catch (e) {
            lastErr = e;
          }
        }
        // fallback: DNS النظام العادي
        try {
          const result = await doRequest(API_HOST);
          if (result?.ok) return resolve(result.result);
          throw new Error(result?.description ?? 'API error');
        } catch (e) {
          reject(lastErr ?? e);
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  async sendMessage(text: string, chatId: string = this.chatId): Promise<{ message_id: number }> {
    const res = await this.request('sendMessage', {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    });
    return res as { message_id: number };
  }

  async editMessageText(text: string, messageId: number, chatId: string = this.chatId): Promise<void> {
    await this.request('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      disable_web_page_preview: true,
    });
  }

  async deleteMessage(messageId: number, chatId: string = this.chatId): Promise<void> {
    await this.request('deleteMessage', { chat_id: chatId, message_id: messageId });
  }

  async getMe(): Promise<any> {
    return this.request('getMe');
  }

  async getUpdates(offset?: number): Promise<any[]> {
    const res = await this.request('getUpdates', { offset, timeout: 1 });
    return Array.isArray(res) ? res : [];
  }
}

export function chunkText(text: string): string[] {
  if (text.length <= MAX_CHUNK) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += MAX_CHUNK) {
    chunks.push(text.slice(i, i + MAX_CHUNK));
  }
  return chunks;
}
