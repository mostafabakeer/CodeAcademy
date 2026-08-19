const SUPABASE_URL = 'https://hgeugcmockvnfenhljlc.supabase.co';
const ANON_KEY = 'sb_publishable_Ti1GcC1f7aM41NP-m-Ioaw_EFsx2TAC';

const r = await fetch(`${SUPABASE_URL}/functions/v1/api/bootstrap`, {
  headers: { apikey: ANON_KEY }
});
console.log('Status:', r.status);
const text = await r.text();
console.log('Body:', text.slice(0, 500));
