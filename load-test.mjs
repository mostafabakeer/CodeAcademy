/**
 * DR Code Load Test
 * Usage: node load-test.mjs [concurrency] [duration_seconds]
 *
 * لقياس السيناريو الكامل (bootstrap/courses/exams/notes) استخدم حساباً مشتركاً:
 *   $env:LOAD_TEST_PHONE="01xxxxxxxxx"; $env:LOAD_TEST_PASSWORD="..."; node load-test.mjs 50 30
 * بدونها يُسجَّل حساب اختبار جديد (غير مشترك) وتُتخطى مسارات المحتوى بدل
 * قياس ردود 403 مضلّلة.
 */
const SUPABASE_URL = 'https://hgeugcmockvnfenhljlc.supabase.co';
const ANON_KEY = 'sb_publishable_Ti1GcC1f7aM41NP-m-Ioaw_EFsx2TAC';
const FN = `${SUPABASE_URL}/functions/v1/api`;

const C = Number(process.argv[2]) || 10;
const D = Number(process.argv[3]) || 15;

const hdrs = { 'Content-Type': 'application/json', apikey: ANON_KEY };
let token = null;

const TEST_PHONE = process.env.LOAD_TEST_PHONE || '';
const TEST_PASSWORD = process.env.LOAD_TEST_PASSWORD || '';

function authHdrs() { return { ...hdrs, Authorization: `Bearer ${token}` }; }

async function call(method, path, body, headers) {
  const opts = { method, headers: headers || hdrs };
  if (body) opts.body = JSON.stringify(body);
  const t0 = performance.now();
  try {
    const r = await fetch(`${FN}${path}`, opts);
    const ms = performance.now() - t0;
    const txt = await r.text();
    return { status: r.status, ms, ok: r.ok, size: txt.length, body: txt };
  } catch (e) {
    return { status: 0, ms: performance.now() - t0, ok: false, size: 0, error: e.message };
  }
}

async function bench(name, method, path, body, headers) {
  console.log(`\n--- ${name} ---  concurrency=${C}  duration=${D}s`);
  const results = [];
  const end = Date.now() + D * 1000;
  let inflight = 0, total = 0, done = false;

  function fire() {
    if (done) return;
    inflight++;
    call(method, path, body, headers).then(r => {
      total++;
      results.push(r);
      inflight--;
      if (!done && Date.now() < end) fire();
      else if (inflight === 0) done = true;
    });
  }

  for (let i = 0; i < C; i++) fire();
  while (!done) await new Promise(r => setTimeout(r, 100));

  results.sort((a, b) => a.ms - b.ms);
  const len = results.length;
  const p50 = results[Math.floor(len * 0.5)]?.ms ?? 0;
  const p95 = results[Math.floor(len * 0.95)]?.ms ?? 0;
  const p99 = results[Math.floor(len * 0.99)]?.ms ?? 0;
  const avg = results.reduce((s, r) => s + r.ms, 0) / len;
  const rps = total / D;
  const errs = results.filter(r => !r.ok).length;
  const avgKB = results.reduce((s, r) => s + r.size, 0) / len / 1024;
  const codes = {};
  results.forEach(r => { codes[r.status] = (codes[r.status] || 0) + 1; });

  console.log(`  Total: ${total} | Errors: ${errs} | RPS: ${rps.toFixed(1)}`);
  console.log(`  Latency: avg=${avg.toFixed(0)}ms  p50=${p50.toFixed(0)}ms  p95=${p95.toFixed(0)}ms  p99=${p99.toFixed(0)}ms`);
  console.log(`  Avg size: ${avgKB.toFixed(1)}KB | Codes: ${JSON.stringify(codes)}`);
  return { name, total, errs, rps, avg, p50, p95, p99, avgKB, codes };
}

async function main() {
  console.log('=== DR Code Load Test ===');
  console.log(`Target: ${FN}\n`);

  // مصادقة: حساب مشترك موجود (موصى به) أو حساب اختبار جديد غير مشترك.
  // الحساب الجديد لا يرى المحتوى (requireSubscriber) ⇒ نتخطى مسارات المحتوى
  // بدل قياس ردود 403 لا تمثّل أي حمل حقيقي.
  let authPhone = TEST_PHONE;
  let authPassword = TEST_PASSWORD;
  if (TEST_PHONE && TEST_PASSWORD) {
    const login = await call('POST', '/auth/login', { identifier: TEST_PHONE, password: TEST_PASSWORD });
    if (!login.ok) { console.log('Login:', login.status, login.body.slice(0, 200)); return; }
    token = JSON.parse(login.body).token;
    console.log(`[+] Logged in as ${TEST_PHONE}`);
  } else {
    authPhone = '05' + String(Date.now()).slice(-8);
    authPassword = 'Test1234!';
    const reg = await call('POST', '/auth/register', { phone: authPhone, password: authPassword, fullName: 'LoadTester', grade: 'bac1' });
    if (!reg.ok) { console.log('Register:', reg.status, reg.body.slice(0, 200)); return; }
    token = JSON.parse(reg.body).token;
    console.log(`[+] Registered ${authPhone} (غير مشترك — مسارات المحتوى ستُتخطى)`);
  }

  // Warm up + معرفة صلاحية قراءة المحتوى
  let canReadContent = false;
  const meRes = await call('GET', '/auth/me', null, authHdrs());
  if (meRes.ok) {
    const me = JSON.parse(meRes.body);
    canReadContent = me?.user?.role === 'admin' || !!me?.user?.subscription;
  }

  const R = [];

  // 1. Health (no auth)
  R.push(await bench('GET /health (no auth)', 'GET', '/health'));

  // 2. Login (heaviest auth - computes password)
  R.push(await bench('POST /auth/login', 'POST', '/auth/login', { identifier: authPhone, password: authPassword }));

  // 3. الإقلاع الحقيقي: جلسة + تقدّم (متاحان لأي مستخدم مصادَق)
  R.push(await bench('GET /auth/me (auth)', 'GET', '/auth/me', null, authHdrs()));
  R.push(await bench('GET /progress (auth)', 'GET', '/progress', null, authHdrs()));

  // 4. المحتوى (يتطلب اشتراكاً)
  let lessonId = 1;
  if (canReadContent) {
    const boot = await call('GET', '/bootstrap', null, authHdrs());
    if (boot.ok) {
      const bootJson = JSON.parse(boot.body);
      lessonId = bootJson?.lessons?.[0]?.id ?? 1;
      R.push(await bench('GET /bootstrap (auth)', 'GET', '/bootstrap', null, authHdrs()));
      // المسار الأكثر تكراراً في الواقع: المحتوى لم يتغيّر ⇒ notModified صغير
      if (bootJson?.contentVersion) {
        R.push(await bench('GET /bootstrap?v= (auth)', 'GET', `/bootstrap?v=${encodeURIComponent(bootJson.contentVersion)}`, null, authHdrs()));
      }
    }
    R.push(await bench('GET /courses (auth)', 'GET', '/courses', null, authHdrs()));
    R.push(await bench('GET /exams (auth)', 'GET', '/exams', null, authHdrs()));
    R.push(await bench('GET /notes (auth)', 'GET', '/notes', null, authHdrs()));
  } else {
    console.log('\n⚠ الحساب غير مشترك: تم تخطي /bootstrap و/courses و/exams و/notes.');
    console.log('  لقياس السيناريو الكامل: LOAD_TEST_PHONE=... LOAD_TEST_PASSWORD=...');
  }

  // 5. مزامنة التقدّم (الكتابة الوحيدة المتكررة أثناء المشاهدة)
  R.push(await bench('POST /progress/sync (auth)', 'POST', '/progress/sync', { items: [{ lessonId, secondsWatched: 60 }] }, authHdrs()));

  // 6. Top students (public)
  R.push(await bench('GET /top-students (public)', 'GET', '/top-students'));

  // Summary
  console.log('\n\n======================================== SUMMARY ========================================');
  console.log(`${'Endpoint'.padEnd(35)} ${'RPS'.padStart(8)} ${'Avg'.padStart(8)} ${'P50'.padStart(8)} ${'P95'.padStart(8)} ${'P99'.padStart(8)} ${'Size'.padStart(8)} ${'Errs'.padStart(6)}`);
  console.log('-'.repeat(100));
  for (const r of R) {
    console.log(`${r.name.padEnd(35)} ${r.rps.toFixed(1).padStart(8)} ${(r.avg+'ms').padStart(8)} ${(r.p50+'ms').padStart(8)} ${(r.p95+'ms').padStart(8)} ${(r.p99+'ms').padStart(8)} ${(r.avgKB.toFixed(1)+'KB').padStart(8)} ${String(r.errs).padStart(6)}`);
  }

  // Supabase free plan analysis
  const bootRps = R.find(r => r.name.includes('bootstrap'))?.rps ?? 1;
  const loginRps = R.find(r => r.name.includes('login'))?.rps ?? 1;
  const monthly = (m) => m * 60 * 60 * 24 * 30;

  console.log('\n======================================== FREE PLAN ANALYSIS ========================================');
  console.log(`Supabase Free Plan Limits:`);
  console.log(`  - 500,000 Edge Function invocations/month`);
  console.log(`  - 500 concurrent DB connections`);
  console.log(`  - 10s execution timeout per function`);
  console.log(`  - 2GB bandwidth/month`);
  console.log(`  - 500MB database storage\n`);

  const avgRespKB = R.find(r => r.name.includes('bootstrap'))?.avgKB ?? 0;
  const bootMonthlyInvocations = Math.ceil(monthly(bootRps));
  const allMonthlyInvocations = Math.ceil(R.reduce((s, r) => s + r.total / D, 0) * 60 * 60 * 24 * 30);
  const bwGB = (allMonthlyInvocations * avgRespKB / 1024 / 1024).toFixed(2);

  console.log(`Current measured throughput:`);
  console.log(`  Bootstrap: ${bootRps.toFixed(1)} RPS → ~${bootMonthlyInvocations.toLocaleString()} invocations/month`);
  console.log(`  All endpoints combined: ~${(R.reduce((s,r) => s+r.rps, 0)).toFixed(1)} RPS → ~${allMonthlyInvocations.toLocaleString()} invocations/month`);
  console.log(`  Bandwidth estimate: ~${bwGB}GB/month\n`);

  // Real-world estimate: each user visits ~10 pages per session, 1 bootstrap per page load
  const maxUsers30s = Math.floor(500000 / (30 * 24 * 60)); // each user hits bootstrap once per 30s
  const maxUsersDaily = Math.floor(500000 / 30 / 10); // 10 page loads per user per day
  const p95 = R.find(r => r.name.includes('bootstrap'))?.p95 ?? 0;

  console.log(`Estimated capacity (free plan):`);
  console.log(`  If each user hits bootstrap once per 30s → ~${maxUsers30s} concurrent users`);
  console.log(`  If each user loads 10 pages/day → ~${maxUsersDaily} daily active users`);
  console.log(`  Bootstrap P95 latency: ${p95.toFixed(0)}ms`);
  if (p95 > 3000) console.log(`  ⚠ P95 > 3s — heavy for real users`);
  else if (p95 > 1000) console.log(`  ⚠ P95 > 1s — acceptable but could be better`);
  else console.log(`  ✓ P95 < 1s — good`);
}

main().catch(console.error);
