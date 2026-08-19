/**
 * DR Code Load Test
 * Usage: node load-test.mjs [concurrency] [duration_seconds]
 */
const SUPABASE_URL = 'https://hgeugcmockvnfenhljlc.supabase.co';
const ANON_KEY = 'sb_publishable_Ti1GcC1f7aM41NP-m-Ioaw_EFsx2TAC';
const FN = `${SUPABASE_URL}/functions/v1/api`;

const C = Number(process.argv[2]) || 10;
const D = Number(process.argv[3]) || 15;

const hdrs = { 'Content-Type': 'application/json', apikey: ANON_KEY };
let token = null;

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

  // Register
  const phone = '05' + String(Date.now()).slice(-8);
  const reg = await call('POST', '/auth/register', { phone, password: 'Test1234!', fullName: 'LoadTester', grade: 'bac1' });
  if (!reg.ok) { console.log('Register:', reg.status, reg.body.slice(0, 200)); return; }
  const regJson = JSON.parse(reg.body);
  token = regJson.token;
  console.log(`[+] Registered ${phone}, token obtained`);

  // Warm up
  await call('GET', '/bootstrap', null, authHdrs());

  const R = [];

  // 1. Health (no auth)
  R.push(await bench('GET /health (no auth)', 'GET', '/health'));

  // 2. Login (heaviest auth - computes password)
  R.push(await bench('POST /auth/login', 'POST', '/auth/login', { identifier: '0500000000', password: 'Test1234!' }));

  // 3. Bootstrap (biggest payload)
  R.push(await bench('GET /bootstrap (auth)', 'GET', '/bootstrap', null, authHdrs()));

  // 4. Courses
  R.push(await bench('GET /courses (auth)', 'GET', '/courses', null, authHdrs()));

  // 5. Exams
  R.push(await bench('GET /exams (auth)', 'GET', '/exams', null, authHdrs()));

  // 6. Notes
  R.push(await bench('GET /notes (auth)', 'GET', '/notes', null, authHdrs()));

  // 7. Top students (public)
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
