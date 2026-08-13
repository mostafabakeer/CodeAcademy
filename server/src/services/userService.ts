import { getSupabase } from '../db/supabase';

export interface User {
  id: number;
  fullName: string;
  username?: string;
  phone: string;
  grade: string;
  role: 'student' | 'admin';
  subscription: boolean;
  blocked: boolean;
  passwordHash: string;
  createdAt: number;
}

export type SafeUser = Omit<User, 'passwordHash'>;

export interface UserListParams {
  page?: number;
  limit?: number;
  search?: string;
}

export interface UserListResult {
  users: SafeUser[];
  total: number;
  page: number;
  limit: number;
}

function fromRow(r: any): User {
  return {
    id: r.id,
    fullName: r.full_name ?? '',
    username: r.username ?? undefined,
    phone: r.phone ?? '',
    grade: r.grade ?? 'all',
    role: r.role === 'admin' ? 'admin' : 'student',
    subscription: !!r.subscription,
    blocked: !!r.blocked,
    passwordHash: r.password_hash ?? '',
    createdAt: r.created_at ?? 0,
  };
}

function toRow(u: Partial<User>): Record<string, any> {
  const row: Record<string, any> = {};
  if (u.fullName !== undefined) row.full_name = u.fullName;
  if (u.username !== undefined) row.username = u.username;
  if (u.phone !== undefined) row.phone = u.phone;
  if (u.grade !== undefined) row.grade = u.grade;
  if (u.role !== undefined) row.role = u.role;
  if (u.subscription !== undefined) row.subscription = u.subscription;
  if (u.blocked !== undefined) row.blocked = u.blocked;
  if (u.passwordHash !== undefined) row.password_hash = u.passwordHash;
  if (u.createdAt !== undefined) row.created_at = u.createdAt;
  return row;
}

export function safeUser(u: User): SafeUser {
  const { passwordHash: _omit, ...safe } = u;
  return safe;
}

export async function countUsers(): Promise<number> {
  const { count } = await getSupabase().from('users').select('id', { count: 'exact', head: true });
  return count ?? 0;
}

export async function getById(id: number): Promise<User | null> {
  const { data } = await getSupabase().from('users').select('*').eq('id', id).maybeSingle();
  return data ? fromRow(data) : null;
}

export async function findByPhone(normPhone: string): Promise<User | null> {
  const { data } = await getSupabase().from('users').select('*');
  const rows = data ?? [];
  const found = rows.find((r) => String(r.phone ?? '').replace(/[\s-]/g, '') === normPhone);
  return found ? fromRow(found) : null;
}

/** بحث بالتليفون (بعد التطبيع) أو باسم المستخدم (username). */
export async function findByIdentifier(identifier: string): Promise<User | null> {
  const norm = String(identifier).replace(/[\s-]/g, '');
  const { data } = await getSupabase().from('users').select('*');
  const rows = data ?? [];
  const found = rows.find(
    (r) => String(r.phone ?? '').replace(/[\s-]/g, '') === norm || String(r.username ?? '') === String(identifier)
  );
  return found ? fromRow(found) : null;
}

export async function create(input: Omit<User, 'id'>): Promise<User> {
  const { data } = await getSupabase()
    .from('users')
    .insert(toRow(input))
    .select()
    .single();
  return fromRow(data);
}

export async function update(id: number, patch: Partial<Omit<User, 'id'>>): Promise<User | null> {
  const row = toRow(patch);
  if (Object.keys(row).length === 0) return getById(id);
  const { data } = await getSupabase()
    .from('users')
    .update(row)
    .eq('id', id)
    .select()
    .maybeSingle();
  return data ? fromRow(data) : null;
}

export async function setRole(id: number, role: 'student' | 'admin'): Promise<User | null> {
  return update(id, { role });
}

export async function setSubscription(id: number, subscription: boolean): Promise<User | null> {
  return update(id, { subscription });
}

export async function setBlocked(id: number, blocked: boolean): Promise<User | null> {
  return update(id, { blocked });
}

export async function listAll(): Promise<User[]> {
  const { data } = await getSupabase().from('users').select('*').order('id', { ascending: true });
  return (data ?? []).map(fromRow);
}

export async function listStudents(): Promise<User[]> {
  const { data } = await getSupabase().from('users').select('*').eq('role', 'student').order('id', { ascending: true });
  return (data ?? []).map(fromRow);
}

export async function list(params: UserListParams = {}): Promise<UserListResult> {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(params.limit) || 50));
  const search = params.search?.trim() ?? '';

  let query = getSupabase().from('users').select('*', { count: 'exact' });
  if (search) {
    // تنظيف الأحرف التي تكسر فلتر PostgREST
    const safe = search.replace(/[(),*.]/g, '');
    const like = `%${safe}%`;
    query = query.or(`full_name.ilike.${like},phone.ilike.${like},username.ilike.${like}`) as any;
  }
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data, count } = await query.order('id', { ascending: true }).range(from, to);

  return {
    users: (data ?? []).map((r) => safeUser(fromRow(r))),
    total: count ?? 0,
    page,
    limit,
  };
}
