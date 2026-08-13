import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';

const includeCredentialsFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  return fetch(input, { ...init, credentials: 'include' });
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: includeCredentialsFetch },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
