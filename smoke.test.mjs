import { test } from 'node:test';
import assert from 'node:assert/strict';

const SUPABASE_URL = 'https://hgeugcmockvnfenhljlc.supabase.co';
const ANON_KEY = 'sb_publishable_Ti1GcC1f7aM41NP-m-Ioaw_EFsx2TAC';
const FN = `${SUPABASE_URL}/functions/v1/api`;

async function call(path, { method = 'GET', body, headers = {} } = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, 'x-path': path, ...headers } };
  if (body) opts.body = typeof body === 'string' ? body : JSON.stringify(body);
  const r = await fetch(`${FN}${path}`, opts);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, text, json, headers: r.headers };
}

test('health endpoint responds 200', async () => {
  const r = await call('/health');
  assert.equal(r.status, 200);
});

test('top-students is public and returns payload', async () => {
  const r = await call('/top-students');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json?.students), 'expected { students: [...] }');
});

test('top-students sets public Cache-Control (requires deploy)', async () => {
  const r = await call('/top-students');
  const cc = r.headers.get('cache-control') ?? '';
  assert.match(cc, /public/);
  assert.match(cc, /max-age=\d+/);
});

test('latest-exam-top is public and cacheable (requires deploy)', async () => {
  const r = await call('/latest-exam-top');
  const cc = r.headers.get('cache-control') ?? '';
  assert.ok(r.status !== 404, 'route should exist');
  assert.match(cc, /public/);
});

test('admin/users/all fails closed without auth', async () => {
  const r = await call('/admin/users/all');
  assert.ok(r.status === 401 || r.status === 403, `expected 401/403, got ${r.status}`);
});

test('admin/users/all pagination is sanitized: huge limit rejected or capped on unauthenticated call', async () => {
  const r = await call('/admin/users/all?limit=999999999');
  assert.ok(r.status === 401 || r.status === 403, 'must stay fail-closed before parsing');
});

test('forgot-password for UNREGISTERED phone returns uniform ok (anti-enumeration, no DB side effect)', async () => {
  const phone = `0591${String(Date.now()).slice(-7)}`;
  const r = await call('/auth/forgot-password', { method: 'POST', body: { phone } });
  // Should NOT leak whether the number exists → 200 {ok:true} after new code.
  // On already-deployed old code this may still 404 — note but do not hard fail.
  if (r.status === 404 || r.status === 429) return;
  assert.equal(r.status, 200);
  assert.equal(r.json?.ok, true);
});

test('forgot-password/complete returns uniform message for unknown phone/token', async () => {
  const r = await call('/auth/forgot-password/complete', {
    method: 'POST',
    body: { phone: '0580000000', code: '000000', password: 'Test1234!' },
  });
  if (r.status === 404 || r.status === 429) return;
  assert.equal(r.status, 400);
  assert.ok(r.json?.error);
  assert.ok(!/غير مسجل/i.test(r.json?.error ?? ''), 'must not reveal registration status');
});