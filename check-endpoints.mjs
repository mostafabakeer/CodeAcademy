const SUPABASE_URL = 'https://hgeugcmockvnfenhljlc.supabase.co';
const ANON_KEY = 'sb_publishable_Ti1GcC1f7aM41NP-m-Ioaw_EFsx2TAC';
const FN = `${SUPABASE_URL}/functions/v1/api`;

// Test various endpoints
const tests = [
  ['GET', '/health', null],
  ['POST', '/auth/register', { phone: '0599999999', password: 'Test1234!', fullName: 'Test', grade: 'bac1' }],
  ['POST', '/auth/login', { identifier: '0599999999', password: 'Test1234!' }],
  ['GET', '/top-students', null],
  ['GET', '/courses', null],
  ['GET', '/bootstrap', null],
];

for (const [method, path, body] of tests) {
  const opts = { method, headers: { 'Content-Type': 'application/json', apikey: ANON_KEY } };
  if (body) opts.body = JSON.stringify(body);
  try {
    const r = await fetch(`${FN}${path}`, opts);
    const txt = await r.text();
    console.log(`${method} ${path} → ${r.status} (${txt.length}B) ${txt.slice(0, 120)}`);
  } catch (e) {
    console.log(`${method} ${path} → ERROR: ${e.message}`);
  }
}
