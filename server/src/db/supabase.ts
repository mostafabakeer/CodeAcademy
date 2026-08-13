import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnv } from '../config/env';

let client: SupabaseClient | null = null;

/**
 * عميل Supabase المفرد (singleton) — يستخدم SERVICE_ROLE_KEY من السيرفر فقط.
 * لا يُكشف هذا المفتاح للعميل أبداً.
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const env = loadEnv();
    client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
