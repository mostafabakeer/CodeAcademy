import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TelegramClient, chunkText } from '../telegram/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const CACHE_FILE = path.join(DATA_DIR, 'db.json');

interface TgMeta {
  msgId?: number;
  chunkIds?: number[];
}

interface CacheFileShape {
  records: Record<string, any>;
  meta: Record<string, TgMeta>;
}

const SEND_DELAY_MS = 250;

/**
 * مخزن البيانات الأساسي
 * - الكاش المحلي (JSON) هو مصدر القراءة الدائم
 * - تلجرام نسخة احتياطية خارجية (write-through + إعادة محاولة تلقائية)
 * - الكتابة المحلية ذرّية (temp + rename) حتى لا يتلف الملف
 */
export class AppStore {
  private records = new Map<string, any>();
  private meta: Record<string, TgMeta> = {};
  private dirty = false;
  private writeTimer: NodeJS.Timeout | null = null;
  private pending = new Set<string>(); // مفاتيح بانتظار المزامنة مع تلجرام
  private syncing = false;
  readonly telegram: TelegramClient | null;

  constructor(telegram: TelegramClient | null) {
    this.telegram = telegram;
  }

  async init(): Promise<void> {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(CACHE_FILE)) {
      try {
        const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as CacheFileShape;
        if (raw?.records) this.records = new Map(Object.entries(raw.records));
        if (raw?.meta) this.meta = raw.meta;
        console.log(`[store] تم تحميل الكاش المحلي (${this.records.size} سجل)`);
      } catch (e) {
        console.error('[store] فشل قراءة الكاش، سيبقى فارغاً:', (e as Error).message);
      }
    } else {
      console.log('[store] لا يوجد كاش محلي — بدء جديد');
    }
    // إعادة مزامنة كل السجلات على تلجرام عند الطلب
    if (process.env.RESYNC_ON_START === 'true') {
      for (const key of this.records.keys()) this.pending.add(key);
    }
    this.startRetryLoop();
  }

  private flushSync(): void {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      const payload: CacheFileShape = { records: Object.fromEntries(this.records), meta: this.meta };
      const tmp = CACHE_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(payload));
      fs.renameSync(tmp, CACHE_FILE);
    } catch (e) {
      console.error('[store] فشل كتابة الكاش:', (e as Error).message);
      this.dirty = true;
    }
  }

  private scheduleFlush(): void {
    this.dirty = true;
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => this.flushSync(), 250);
  }

  async get<T = any>(key: string): Promise<T | undefined> {
    return this.records.get(key) as T | undefined;
  }

  async has(key: string): Promise<boolean> {
    return this.records.has(key);
  }

  async keys(prefix = ''): Promise<string[]> {
    return [...this.records.keys()].filter((k) => k.startsWith(prefix));
  }

  async all<T = any>(prefix = ''): Promise<{ key: string; value: T }[]> {
    const out: { key: string; value: T }[] = [];
    for (const [key, value] of this.records) {
      if (key.startsWith(prefix)) out.push({ key, value: value as T });
    }
    return out;
  }

  async set(key: string, value: any): Promise<void> {
    this.records.set(key, value);
    this.scheduleFlush();
    this.pending.add(key);
    this.syncPending().catch(() => {});
  }

  async remove(key: string): Promise<void> {
    const had = this.records.has(key);
    this.records.delete(key);
    const m = this.meta[key];
    delete this.meta[key];
    this.scheduleFlush();
    if (had && this.telegram && (m?.msgId != null || m?.chunkIds?.length)) {
      this.deleteOnTelegram(key, m).catch((e) => console.warn('[store] فشل حذف من تلجرام:', (e as Error).message));
    }
  }

  async nextId(): Promise<number> {
    const seq = (await this.get<number>('seq')) ?? 0;
    const id = seq + 1;
    await this.set('seq', id);
    return id;
  }

  private async deleteOnTelegram(key: string, meta?: TgMeta): Promise<void> {
    if (!this.telegram) return;
    const m = meta ?? this.meta[key];
    if (m?.msgId != null) {
      await this.telegram.deleteMessage(m.msgId);
      delete this.meta[key];
    } else if (m?.chunkIds?.length) {
      for (const id of m.chunkIds) {
        await this.telegram.deleteMessage(id).catch(() => {});
        await sleep(SEND_DELAY_MS);
      }
      delete this.meta[key];
    }
  }

  /**
   * مزامنة سجل واحد مع تلجرام (رسالة / رسائل متعددة حسب الحجم)
   */
  private async syncOne(key: string): Promise<void> {
    if (!this.telegram) return;
    const value = this.records.get(key);
    const m = this.meta[key] ?? {};
    if (value === undefined) {
      // سجل محذوف — حذف من تلجرام
      await this.deleteOnTelegram(key);
      return;
    }
    const json = JSON.stringify(value);
    const chunks = chunkText(json);

    if (chunks.length === 1) {
      if (m.msgId != null) {
        await this.telegram.editMessageText(json, m.msgId);
      } else {
        const sent = await this.telegram.sendMessage(json);
        m.msgId = sent.message_id;
      }
      m.chunkIds = undefined;
    } else {
      const have = m.chunkIds?.length ?? 0;
      if (have === chunks.length) {
        for (let i = 0; i < chunks.length; i++) {
          await this.telegram.editMessageText(chunks[i], m.chunkIds![i]);
          await sleep(SEND_DELAY_MS);
        }
      } else {
        if (m.chunkIds?.length) {
          for (const id of m.chunkIds) {
            await this.telegram.deleteMessage(id).catch(() => {});
            await sleep(SEND_DELAY_MS);
          }
        }
        m.msgId = undefined;
        m.chunkIds = [];
        for (const c of chunks) {
          const sent = await this.telegram.sendMessage(c);
          m.chunkIds.push(sent.message_id);
          await sleep(SEND_DELAY_MS);
        }
      }
      m.msgId = undefined;
    }
    this.meta[key] = m;
    this.scheduleFlush();
  }

  private async syncPending(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    try {
      while (this.pending.size > 0) {
        const keys = [...this.pending];
        this.pending.clear();
        for (const key of keys) {
          try {
            await this.syncOne(key);
          } catch (e) {
            console.warn(`[store] فشلت مزامنة '${key}' مع تلجرام:`, (e as Error).message);
            this.pending.add(key);
            // إيقاف الدورة الحالية — سنعيد المحاولة في الدورة القادمة
            break;
          }
        }
      }
    } finally {
      this.syncing = false;
    }
  }

  private startRetryLoop(): void {
    setInterval(() => {
      if (this.pending.size > 0) this.syncPending().catch(() => {});
    }, 30_000);
  }

  async flushNow(): Promise<void> {
    this.flushSync();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

process.on('beforeExit', () => {
  // آخر فرصة لكتابة الكاش
  const store = (globalThis as any).__store as AppStore | undefined;
  if (store) {
    try {
      const payload: CacheFileShape = { records: Object.fromEntries((store as any).records), meta: (store as any).meta };
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(payload));
    } catch {}
  }
});
