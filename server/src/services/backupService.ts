import { getSupabase } from '../db/supabase';
import { loadEnv } from '../config/env';
import { getPublicUrl } from './uploadService';

export interface BackupResult {
  url: string;
  size: number;
  fileName: string;
}

const TABLES = [
  'users',
  'courses',
  'lessons',
  'exams',
  'questions',
  'notes',
  'top_students',
  'progress',
  'exam_results',
  'code_files',
  'app_config',
] as const;

/**
 * يصدّر كل الجداول إلى JSON ويرفعه إلى bucket backups باسم مؤرخ.
 */
export async function exportAll(): Promise<BackupResult> {
  const sb = getSupabase();
  const snapshot: Record<string, any> = {
    exportedAt: new Date().toISOString(),
    tables: {} as Record<string, any>,
  };

  for (const table of TABLES) {
    const { data } = await sb.from(table).select('*');
    snapshot.tables[table] = data ?? [];
  }

  const json = JSON.stringify(snapshot, null, 2);
  const fileName = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const { error } = await sb.storage
    .from(loadEnv().bucketBackups)
    .upload(fileName, Buffer.from(json, 'utf8'), { contentType: 'application/json', upsert: false });
  if (error) throw new Error(`فشل رفع النسخة الاحتياطية: ${error.message}`);

  return { url: getPublicUrl(loadEnv().bucketBackups, fileName), size: json.length, fileName };
}
