import { api } from './client';

export interface SignedUpload {
  uploadUrl: string;
  path: string;
  publicUrl: string;
  contentType: string;
}

export async function uploadFile(bucket: 'videos' | 'images' | 'notes', file: File): Promise<string> {
  if (bucket === 'notes') {
    if (!/\.pdf$/i.test(file.name)) throw new Error('يجب اختيار ملف بامتداد PDF');
    if (file.size <= 0 || file.size > 20 * 1024 * 1024) throw new Error('حجم ملف PDF يجب ألا يتجاوز 20 ميجابايت');
    const header = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
    if (!header.includes('%PDF-')) throw new Error('الملف المحدد ليس ملف PDF صالحاً');
  }

  const contentType = bucket === 'notes' ? 'application/pdf' : file.type || 'application/octet-stream';
  const signed = await api<SignedUpload>('/api/admin/upload-url', {
    method: 'POST',
    body: {
      bucket,
      fileName: file.name,
      contentType,
      fileSize: file.size,
    },
  });

  const res = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: {
      'x-upsert': 'true',
      'Content-Type': contentType,
    },
    body: file,
  });
  if (!res.ok) throw new Error(`فشل رفع الملف إلى المخزن (${res.status})`);
  return bucket === 'notes' ? signed.path : signed.publicUrl;
}
