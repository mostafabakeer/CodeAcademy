import { api } from './client';
import { playNotificationSound } from '../lib/notificationSound';
import { useActionStore } from '../store/actionStore';

export interface SignedUpload {
  uploadUrl: string;
  path: string;
  publicUrl: string;
  contentType: string;
}

interface UploadNotification {
  type: 'notes' | 'images' | 'videos';
  fileName: string;
  fileSize: number;
  url?: string;
  path?: string;
  success: boolean;
  error?: string;
  grade?: string;
  courseId?: number;
  noteId?: number;
  timestamp: number;
}

class NotificationService {
  private channel: BroadcastChannel | null = null;
  private isSupported(): boolean {
    return typeof BroadcastChannel !== 'undefined' && typeof window !== 'undefined';
  }
  getChannel(): BroadcastChannel | null {
    if (!this.isSupported()) return null;
    if (!this.channel) this.channel = new BroadcastChannel('upload-notifications');
    return this.channel;
  }
  notify(data: UploadNotification): void {
    if (!this.isSupported()) return;
    const channel = this.getChannel();
    if (channel) {
      channel.postMessage(data);
    }

    // صوت التنبيه: نغمة مولّدة محلياً (تعمل بعد أول تفاعل مع الصفحة)
    if (data.success) playNotificationSound('success');

    // إشعار النظام: يجب أن يمر عبر Service Worker registration، لأن
    // `new Notification()` يرمي Illegal constructor على أندرويد كروم.
    // نضعه في مسار مستقل تماماً عن نجاح الرفع حتى لا يحوّل نجاحاً إلى فشل.
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      void (async () => {
        try {
          const registration = await navigator.serviceWorker?.ready;
          await registration?.showNotification(
            data.success ? '✅ رفع ملف ناجح' : '❌ فشل رفع الملف',
            {
              body: data.success
                ? `تم رفع الملف بنجاح: ${data.fileName}`
                : `فشل رفع الملف: ${data.error || 'خطأ محتمل'}`,
              icon: '/pwa-192.png',
              badge: '/pwa-192.png',
              tag: 'upload-notification',
              data: { type: data.type, fileName: data.fileName },
            },
          );
        } catch {
          /* الإشعار رفاهية: لا يجوز أن يُفشل عملية رفع ناجحة */
        }
      })();
    }
  }
}

const notificationService = new NotificationService();

export interface UploadOptions {
  grade?: string;
  courseId?: number;
  noteId?: number;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/**
 * رفع ملف مع دعم التقدم (progress) والإلغاء (abort) عبر XMLHttpRequest.
 * يُستخدم في actionStore لعرض شريط التقدم في ActionOverlay.
 */
export async function uploadFile(
  bucket: 'videos' | 'images' | 'notes',
  file: File,
  options?: UploadOptions
): Promise<string> {
  const startTime = Date.now();

  if (bucket === 'notes') {
    if (!/\.pdf$/i.test(file.name)) throw new Error('يجب اختيار ملف بامتداد PDF');
    const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20 MB
    if (file.size <= 0 || file.size > MAX_PDF_SIZE) throw new Error(`حجم ملف PDF يجب ألا يتجاوز 20 ميجابايت (الملف الحالي: ${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    const header = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
    if (!header.includes('%PDF-')) throw new Error('الملف المحدد ليس ملف PDF صالحاً (رأس الملف غير صحيح)');
  }

  const contentType = bucket === 'notes' ? 'application/pdf' : file.type || 'application/octet-stream';

  try {
    console.log('[upload] Requesting signed URL for:', { bucket, fileName: file.name, contentType, fileSize: file.size, options });

    const signed = await api<SignedUpload>('/api/admin/upload-url', {
      method: 'POST',
      body: {
        bucket,
        fileName: file.name,
        contentType,
        fileSize: file.size,
        grade: options?.grade,
        courseId: options?.courseId,
        noteId: options?.noteId,
      },
    });

    console.log('[upload] Got signed URL:', { path: signed.path, uploadUrl: signed.uploadUrl?.substring(0, 50) + '...' });

    // استخدام XMLHttpRequest لدعم التقدم والإلغاء مع timeout
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const UPLOAD_TIMEOUT_MS = 120_000; // 2 دقائق timeout للرفع
      let timeoutId: ReturnType<typeof setTimeout>;

      // إلغاء من الخارج
      if (options?.signal) {
        if (options.signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        options.signal.addEventListener('abort', () => {
          xhr.abort();
          clearTimeout(timeoutId);
        }, { once: true });
      }

      // تتبع التقدم
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && options?.onProgress) {
          const percent = Math.round((event.loaded / event.total) * 100);
          options.onProgress(percent);
        }
      });

      xhr.addEventListener('load', () => {
        clearTimeout(timeoutId);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`فشل رفع الملف إلى المخزن (${xhr.status}): ${xhr.responseText}`));
        }
      });

      xhr.addEventListener('error', () => {
        clearTimeout(timeoutId);
        reject(new Error('فشل رفع الملف: خطأ شبكة'));
      });

      xhr.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        reject(new DOMException('Aborted', 'AbortError'));
      });

      xhr.open('PUT', signed.uploadUrl);
      xhr.setRequestHeader('x-upsert', 'true');
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.send(file);

      // تعيين timeout
      timeoutId = setTimeout(() => {
        xhr.abort();
        reject(new Error('انتهت مهلة رفع الملف (120 ثانية) — تحقق من اتصالك بالإنترنت وحاول مجدداً'));
      }, UPLOAD_TIMEOUT_MS);
    });

    console.log('[upload] Upload response status: 200');

    const resultPath = bucket === 'notes' ? signed.path : signed.publicUrl;
    console.log('[upload] Success, path:', resultPath);

    notificationService.notify({
      type: bucket,
      fileName: file.name,
      fileSize: file.size,
      path: resultPath,
      success: true,
      grade: options?.grade,
      courseId: options?.courseId,
      noteId: options?.noteId,
      timestamp: startTime,
    });

    return resultPath;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'خطأ مجهول';
    console.error('[upload] Error:', errorMessage);

    notificationService.notify({
      type: bucket,
      fileName: file.name,
      fileSize: file.size,
      success: false,
      error: errorMessage,
      grade: options?.grade,
      courseId: options?.courseId,
      noteId: options?.noteId,
      timestamp: Date.now(),
    });
    throw error;
  }
}

export function notifyUpload(data: UploadNotification): void {
  notificationService.notify(data);
}

/**
 * دالة مساعدة لرفع ملف ضمن actionStore (لعرض التقدم في ActionOverlay)
 * الاستخدام:
 *   const run = useAction();
 *   await run({
 *     key: 'upload:video:123',
 *     label: 'جاري رفع الفيديو...',
 *     kind: 'upload',
 *   }, async ({ setProgress }) => {
 *     await uploadFileWithAction('videos', file, { onProgress: setProgress });
 *   });
 */
export async function uploadFileWithAction(
  bucket: 'videos' | 'images' | 'notes',
  file: File,
  options?: Omit<UploadOptions, 'signal'>
): Promise<string> {
  // Get setProgress from actionStore context
  const setProgress = useActionStore.getState()?.active ?
    (Object.values(useActionStore.getState().active).find(a => a.kind === 'upload')?.progress !== undefined) : false;

  return uploadFile(bucket, file, options);
}
