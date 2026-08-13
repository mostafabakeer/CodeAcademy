import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { supabaseUrl, serviceRoleKey } from './env.ts';

/**
 * عميل Supabase بمفتاح الخدمة — يُستخدم داخل الـ Edge Functions فقط
 * (لا يُكشف للمتصفح أبداً). يتجاوز RLS لأنه service role.
 */
export const sb: SupabaseClient = createClient(supabaseUrl(), serviceRoleKey(), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { headers: { 'x-application-name': 'dr-code-functions' } },
});
