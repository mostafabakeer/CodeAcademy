import { getSupabase } from '../db/supabase';
import { mirrorCodeFile, deleteMirror, type TelegramMeta } from './telegramService';

export interface CodeFile {
  id: number;
  userId: number;
  name: string;
  language: string;
  code: string;
  versions: { at: number; code: string }[];
  telegramMeta?: TelegramMeta;
  createdAt: number;
  updatedAt: number;
}

const MAX_VERSIONS = 20;

function fromRow(r: any): CodeFile {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name ?? 'ملف جديد',
    language: r.language ?? 'javascript',
    code: r.code ?? '',
    versions: Array.isArray(r.versions) ? r.versions : [],
    telegramMeta: r.telegram_meta ?? undefined,
    createdAt: r.created_at ?? 0,
    updatedAt: r.updated_at ?? 0,
  };
}

function toRow(f: Partial<CodeFile>): Record<string, any> {
  const row: Record<string, any> = {};
  if (f.userId !== undefined) row.user_id = f.userId;
  if (f.name !== undefined) row.name = f.name;
  if (f.language !== undefined) row.language = f.language;
  if (f.code !== undefined) row.code = f.code;
  if (f.versions !== undefined) row.versions = f.versions;
  if (f.telegramMeta !== undefined) row.telegram_meta = f.telegramMeta ?? null;
  if (f.createdAt !== undefined) row.created_at = f.createdAt;
  if (f.updatedAt !== undefined) row.updated_at = f.updatedAt;
  return row;
}

export async function listByUser(userId: number): Promise<CodeFile[]> {
  const { data } = await getSupabase()
    .from('code_files')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  return (data ?? []).map(fromRow);
}

export async function getByUser(userId: number, id: number): Promise<CodeFile | null> {
  const { data } = await getSupabase()
    .from('code_files')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  return data ? fromRow(data) : null;
}

export async function create(userId: number, input: { name: string; language: string; code: string }): Promise<CodeFile> {
  const now = Date.now();
  const file: Omit<CodeFile, 'id'> = {
    userId,
    name: input.name,
    language: input.language,
    code: input.code,
    versions: [{ at: now, code: input.code }],
    createdAt: now,
    updatedAt: now,
  };
  // مرآة تيليجرام قبل الحفظ (إن توفرت) — إن فشلت لا يمنع الحفظ
  const telegramMeta = await mirrorCodeFile({
    name: file.name,
    language: file.language,
    code: file.code,
    versions: file.versions,
    updatedAt: now,
  });
  file.telegramMeta = telegramMeta;

  const { data } = await getSupabase().from('code_files').insert(toRow(file)).select().single();
  return fromRow(data);
}

export async function updateCode(userId: number, id: number, code: string): Promise<CodeFile | null> {
  const file = await getByUser(userId, id);
  if (!file) return null;
  if (code === file.code) return file;

  const now = Date.now();
  const versions = [...(file.versions ?? []).slice(-(MAX_VERSIONS - 1)), { at: now, code }];
  const updated: CodeFile = { ...file, code, versions, updatedAt: now };
  await mirrorFile(updated);
  const { data } = await getSupabase()
    .from('code_files')
    .update(toRow({ code, versions, telegramMeta: updated.telegramMeta, updatedAt: now }))
    .eq('id', id)
    .select()
    .maybeSingle();
  return data ? fromRow(data) : null;
}

export async function patch(userId: number, id: number, patch: { name?: string; language?: string }): Promise<CodeFile | null> {
  const file = await getByUser(userId, id);
  if (!file) return null;
  const updated: CodeFile = { ...file, ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.language !== undefined ? { language: patch.language } : {}) };
  if (updated.name === file.name && updated.language === file.language) return file;
  await mirrorFile(updated);
  const { data } = await getSupabase()
    .from('code_files')
    .update(toRow({ name: updated.name, language: updated.language, telegramMeta: updated.telegramMeta }))
    .eq('id', id)
    .select()
    .maybeSingle();
  return data ? fromRow(data) : null;
}

export async function remove(userId: number, id: number): Promise<void> {
  const file = await getByUser(userId, id);
  if (file?.telegramMeta) {
    await deleteMirror(file.telegramMeta);
  }
  await getSupabase().from('code_files').delete().eq('id', id).eq('user_id', userId);
}

/** يعيد عكس مرآة كل ملفات الكود (تُستخدم من /admin/sync). */
export async function resyncAll(): Promise<number> {
  const { data } = await getSupabase().from('code_files').select('*');
  let synced = 0;
  for (const row of data ?? []) {
    const file = fromRow(row);
    await mirrorFile(file);
    await getSupabase()
      .from('code_files')
      .update(toRow({ telegramMeta: file.telegramMeta }))
      .eq('id', file.id);
    synced++;
  }
  return synced;
}

async function mirrorFile(file: CodeFile): Promise<void> {
  file.telegramMeta = await mirrorCodeFile(
    {
      name: file.name,
      language: file.language,
      code: file.code,
      versions: file.versions,
      updatedAt: file.updatedAt,
    },
    file.telegramMeta
  );
}
