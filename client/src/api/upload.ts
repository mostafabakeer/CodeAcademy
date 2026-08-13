import { api } from './client';

export interface SignedUpload {
  uploadUrl: string;
  path: string;
  publicUrl: string;
  contentType: string;
}

export async function uploadFile(bucket: 'videos' | 'images', file: File): Promise<string> {
  const signed = await api<SignedUpload>('/api/admin/upload-url', {
    method: 'POST',
    body: {
      bucket,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
    },
  });

  const res = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: {
      'x-upsert': 'true',
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });
  if (!res.ok) throw new Error(`فشل رفع الملف إلى المخزن (${res.status})`);
  return signed.publicUrl;
}
