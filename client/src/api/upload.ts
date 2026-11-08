import { api } from './client';

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

    // تشغيل صوت تنبيه عند النجاح
    if (data.success) {
      try {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
        audio.volume = 0.5;
        audio.play().catch(() => {
          // المتصفح قد يحجب التشغيل التلقائي حتى يتفاعل المستخدم مع الصفحة
          console.warn('Audio playback blocked by browser');
        });
      } catch (e) {
        console.error('Failed to play notification sound', e);
      }
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const opts = {
        body: data.success
          ? `تم رفع الملف بنجاح: ${data.fileName}`
          : `فشل رفع الملف: ${data.error || 'خطأ محتمل'}`,
        icon: '/pwa-192.png',
        badge: '/pwa-192.png',
        tag: 'upload-notification',
        data: {
          type: data.type,
          fileName: data.fileName,
        },
      } as NotificationOptions & { renotify?: boolean };
      new Notification(data.success ? '✅ رفع ملف ناجح' : '❌ فشل رفع الملف', opts);
    }
  }
}

const notificationService = new NotificationService();

export async function uploadFile(
  bucket: 'videos' | 'images' | 'notes',
  file: File,
  options?: {
    grade?: string;
    courseId?: number;
    noteId?: number;
  }
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

    const res = await fetch(signed.uploadUrl, {
      method: 'PUT',
      headers: {
        'x-upsert': 'true',
        'Content-Type': contentType,
      },
      body: file,
    });

    console.log('[upload] Upload response status:', res.status);

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      console.error('[upload] Storage upload failed:', errorText);
      throw new Error(`فشل رفع الملف إلى المخزن (${res.status}): ${errorText}`);
    }

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
