import https from 'node:https';
import { resolve as dnsResolve } from 'node:dns';
import { promisify } from 'node:util';
import { loadEnv } from '../config/env';
import { logger } from '../utils/logger';

const dnsResolveAsync = promisify(dnsResolve);
const API_HOST = 'api.telegram.org';
const MAX_CHUNK = 3400;
const SEND_DELAY_MS = 250;

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
      logger.warn({ err: (e as Error).message }, '[telegram] DoH resolution failed, trying system DNS');
    }
    if (ips.length === 0) {
      try {
        const res = await dnsResolveAsync(API_HOST);
        ips.push(...res);
      } catch (e) {
        logger.warn({ err: (e as Error).message }, '[telegram] system DNS resolution failed');
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

export interface TelegramMeta {
  msgId?: number;
  chunkIds?: number[];
}

/** ما يُعكس إلى تيليجرام من ملف الكود (نسخة احتياطية واحدة الاتجاه) */
export interface CodeMirrorPayload {
  name: string;
  language: string;
  code: string;
  versions: unknown[];
  updatedAt: number;
}

let telegram: TelegramClient | null = null;

/** يُستدعى مرة واحدة عند الإقلاع — ينشئ العميل ويتحقق من الاتصال. */
export async function initTelegram(): Promise<TelegramClient | null> {
  const env = loadEnv();
  if (!env.botToken || !env.channelId) {
    logger.warn('[telegram] لا يوجد TELEGRAM_BOT_TOKEN — يعمل التطبيق بدون مرآة الكود الاحتياطية');
    telegram = null;
    return null;
  }
  const client = new TelegramClient(env.botToken, env.channelId);
  try {
    const me = await client.getMe();
    logger.info(`[telegram] متصل: @${me?.username} → قناة ${env.channelId}`);
    telegram = client;
  } catch (e) {
    logger.warn({ err: (e as Error).message }, '[telegram] غير متصل (سيعمل الموقع بدون مرآة الكود)');
    telegram = null;
  }
  return telegram;
}

export function getTelegram(): TelegramClient | null {
  return telegram;
}

/**
 * يعكس ملف الكود إلى تيليجرام كنسخة احتياطية (رسالة واحدة أو عدة رسائل حسب الحجم).
 * يعيد TelegramMeta المحدِّث (يُحفظ في عمود telegram_meta).
 * لو تيليجرام غير متاح يعيد {} بدون خطأ.
 */
export async function mirrorCodeFile(payload: CodeMirrorPayload, existing?: TelegramMeta): Promise<TelegramMeta> {
  const tg = getTelegram();
  if (!tg) return {};
  const json = JSON.stringify(payload);
  const chunks = chunkText(json);
  const meta = existing ?? {};
  const id = `code:${payload.name}`;

  try {
    if (chunks.length === 1) {
      if (meta.msgId != null) {
        await tg.editMessageText(json, meta.msgId);
      } else {
        const sent = await tg.sendMessage(json);
        meta.msgId = sent.message_id;
      }
      if (meta.chunkIds?.length) {
        for (const cid of meta.chunkIds) {
          await tg.deleteMessage(cid).catch(() => {});
          await sleep(SEND_DELAY_MS);
        }
      }
      meta.chunkIds = undefined;
    } else {
      if (meta.msgId != null) {
        await tg.deleteMessage(meta.msgId).catch(() => {});
        await sleep(SEND_DELAY_MS);
      }
      if (meta.chunkIds?.length === chunks.length) {
        for (let i = 0; i < chunks.length; i++) {
          await tg.editMessageText(chunks[i], meta.chunkIds![i]);
          await sleep(SEND_DELAY_MS);
        }
      } else {
        if (meta.chunkIds?.length) {
          for (const cid of meta.chunkIds) {
            await tg.deleteMessage(cid).catch(() => {});
            await sleep(SEND_DELAY_MS);
          }
        }
        meta.msgId = undefined;
        meta.chunkIds = [];
        for (const c of chunks) {
          const sent = await tg.sendMessage(c);
          meta.chunkIds.push(sent.message_id);
          await sleep(SEND_DELAY_MS);
        }
      }
      meta.msgId = undefined;
    }
  } catch (e) {
    logger.warn({ err: (e as Error).message, id }, '[telegram] فشلت مرآة الكود');
  }
  return meta;
}

/** يحذف رسائل تيليجرام الخاصة بملف محذوف. */
export async function deleteMirror(meta?: TelegramMeta | null): Promise<void> {
  const tg = getTelegram();
  if (!tg || !meta) return;
  try {
    if (meta.msgId != null) {
      await tg.deleteMessage(meta.msgId).catch(() => {});
    }
    if (meta.chunkIds?.length) {
      for (const cid of meta.chunkIds) {
        await tg.deleteMessage(cid).catch(() => {});
        await sleep(SEND_DELAY_MS);
      }
    }
  } catch (e) {
    logger.warn({ err: (e as Error).message }, '[telegram] فشل حذف المرآة');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
