# خطة توسيع السعة (Scaling Plan) - منصة DR Code

## 📊 تحليل نتائج اختبار الحمل الحالي

### النتائج المحققة (10 مستخدمين متزامنين، 15 ثانية):

| Endpoint | RPS | Avg Latency | P95 | معدل الخطأ |
|----------|-----|-------------|-----|-----------|
| GET /health | **51.7** | 175ms | 239ms | 0% ✅ |
| POST /auth/login | **17.7** | 556ms | 915ms | 0% ✅ |
| GET /auth/me | **43.0** | 228ms | 341ms | 0% ✅ |
| GET /progress | **71.0** | 130ms | 294ms | **96.5%** ❌ (429 rate limit) |
| POST /progress/sync | **عالق** | - | - | **Rate limited** ❌ |

### العقبات الرئيسية:

1. **Rate Limit مفرط الصرامة** على `/progress` (60/دقيقة) - يفشل عند 10 مستخدمين
2. **عدم وجود كاش لـ /progress/sync** - كل طلب يذهب لقاعدة البيانات
3. **Supabase Free Plan Limits** - 500K invocations/شهر، 500 concurrent connections
4. **Edge Function Cold Starts** - latency عالي في أول طلب

---

## 🎯 السعة الحالية المقدرة (Supabase Free Plan)

| السيناريو | السعة القصوى |
|------------|--------------|
| مستخدمون متزامنون (bootstrap كل 30ث) | **~166 مستخدم** |
| مستخدمون نشطون يومياً (10 صفحات/يوم) | **~1,666 مستخدم/يوم** |
| استدعاءات دالة/شهر (bootstrap) | **~500,000** (حد الخطة المجانية) |
| عرض النطاق الترددي/شهر | **~2GB** (حد الخطة المجانية) |

---

## 🚀 خطة التوسع - 3 مراحل

---

### المرحلة 1: تحسينات فورية (أسبوع واحد) — **هدف: 500 مستخدم متزامن**

| التحسين | الأثر المتوقع | الجهد |
|-----------|--------------|-------|
| **رفع Rate Limits للمسارات غير الحساسة** | +300% RPS | منخفض |
| - `/progress`: 12 → 60/دقيقة | | |
| - `/progress/sync`: 10 → 50/دقيقة | | |
| - `/bootstrap`: 12 → 30/دقيقة | | |
| **تفعيل كاش Edge لـ /progress** | -80% DB calls | متوسط |
| (Cache-Control: max-age=10, stale-while-revalidate=30) | | |
| **دمج /auth/me + /progress في طلب واحد** | -50% requests | متوسط |
| **بناء فهارس DB مركبة** (024_performance_indexes.sql) | -60% query time | تم ✅ |
| **Pressure Test مع متغيرات بيئة** | التحقق من الاستقرار | منخفض |
| `LOAD_TEST=1` لضرب الحدود 50x | | |

**التكلفة**: $0 (Supabase Free Plan)

---

### المرحلة 2: ترقية البنية التحتية (شهر واحد) — **هدف: 5,000 مستخدم متزامن**

| التحسين | الأثر المتوقع | التكلفة/شهر |
|-----------|--------------|-------------|
| **Supabase Pro Plan** | +10x invocations, +5x connections | $25 |
| - 2M invocations/شهر | | |
| - 2000 concurrent connections | | |
| - 8GB bandwidth | | |
| **Cloudflare Workers Paid** | +CPU time, +routes | $5 |
| - 10M requests/شهر | | |
| - 30s CPU time | | |
| **Realtime/WebSockets** | -95% polling requests | مشمول في Pro |
| استبدال polling بـ Supabase Realtime | | |
| **CDN للكاش العام** | -70% bandwidth | $0-20 |
| Cloudflare Cache Rules لـ `/public/*` | | |
| **PgBouncer (Supabase)** | +500 connections | مشمول في Pro |

**الإجمالي**: ~$30-50/شهر

---

### المرحلة 3: هندسة للمليون مستخدم (3 شهور) — **هدف: 50,000+ مستخدم متزامن**

| التحسين | الوصف |
|-----------|--------|
| **Database Read Replicas** | فصل القراءة عن الكتابة |
| **Redis Cache Layer** | كاش مركزي لـ bootstrap, progress, sessions |
| **Horizontal Scaling** | عدة Edge Functions regions |
| **Queue System** | للعمليات الثقيلة (video processing, PDF generation) |
| **Observability** | Datadog/Grafana للـ metrics, tracing, alerts |
| **Auto-scaling** | Cloudflare Workers + Supabase auto-scale |
| **Multi-region Deployment** | تقليل latency عالمياً |

**التكلفة التقديرية**: $200-500/شهر

---

## 📈 خارطة طريق السعة

```
┌─────────────────────────────────────────────────────────────────┐
│                    DR Code Scaling Roadmap                      │
├─────────────────────┬───────────────────────────────────────────┤
│ Current (Free)      │ 166 concurrent | 1,666 DAU               │
├─────────────────────┼───────────────────────────────────────────┤
│ Phase 1 (Week 1)    │ 500 concurrent | 5,000 DAU               │
│  - Rate limit tuning│  - Free Plan optimizations               │
│  - Edge caching     │  - $0 cost                                │
├─────────────────────┼───────────────────────────────────────────┤
│ Phase 2 (Month 1)   │ 5,000 concurrent | 50,000 DAU            │
│  - Supabase Pro     │  - $25/mo                                 │
│  - Realtime         │  - Cloudflare Workers $5/mo               │
│  - CDN              │  - Total ~$30-50/mo                       │
├─────────────────────┼───────────────────────────────────────────┤
│ Phase 3 (Quarter)   │ 50,000+ concurrent | 500,000+ DAU        │
│  - Read Replicas    │  - $200-500/mo                            │
│  - Redis Cluster    │  - Multi-region                           │
│  - Auto-scaling     │  - Full observability                     │
└─────────────────────┴───────────────────────────────────────────┘
```

---

## ✅ خطوات التنفيذ الفوري (هذا الأسبوع)

### 1. تطبيق Rate Limits محسّنة
```bash
# في supabase/functions/_shared/rateLimit.ts - تم ✅
# متغير البيئة LOAD_TEST=1 يضرب الحدود 50x للاختبار
```

### 2. إضافة كاش Edge لـ /progress
```typescript
// في supabase/functions/api/index.ts - endpoint /progress
c.header('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');
```

### 3. دمج bootstrap + progress
```typescript
// Endpoint جديد: GET /bootstrap-with-progress
// يعيد bootstrap + آخر progress في طلب واحد
```

### 4. اختبار حمل شامل مع حساب مشترك
```bash
# تعيين متغيرات البيئة
$env:LOAD_TEST_PHONE="01xxxxxxxxx"
$env:LOAD_TEST_PASSWORD="..."
$env:LOAD_TEST=1

# تشغيل الاختبار
node load-test.mjs 50 60
```

### 4. تطبيق فهارس DB (مُنجز ✅)
```bash
supabase db push  # يطبق 024_performance_indexes.sql
```

---

## 📊 مقاييس النجاح (KPIs)

| المقياس | الهدف Phase 1 | الهدف Phase 2 | الهدف Phase 3 |
|----------|---------------|---------------|---------------|
| **Concurrent Users** | 500 | 5,000 | 50,000 |
| **DAU** | 5,000 | 50,000 | 500,000 |
| **Bootstrap P95** | < 500ms | < 200ms | < 100ms |
| **Error Rate** | < 0.1% | < 0.01% | < 0.001% |
| **Monthly Cost** | $0 | $30-50 | $200-500 |
| **Invocations/Month** | 500K | 2M | 50M+ |

---

## 🛠️ أدوات المراقبة المقترحة

| الأداة | الغرض | التكلفة |
|--------|-------|---------|
| **Supabase Dashboard** | DB metrics, function invocations | مجاني |
| **Cloudflare Analytics** | Workers requests, bandwidth, errors | مجاني |
| **Sentry** | Error tracking, performance | $26/mo (Team) |
| **Grafana Cloud** | Metrics, logs, traces | $50/mo (Free tier كافي للبداية) |
| **UptimeRobot** | Uptime monitoring | مجاني |

---

## ⚠️ المخاطر والتخفيف

| المخاطر | الاحتمال | الأثر | التخفيف |
|----------|----------|-------|---------|
| **Supabase Free Plan limit reached** | عالي في النمو السريع | توقف الخدمة | خطة Phase 1 تستعد للترقية المبكرة |
| **Cold starts في Edge Functions** | متوسط | Latency spikes | Warm-up cron job كل 5 دقائق |
| **Rate limits صارمة جداً** | متوسط | تجربة سيئة | متغير `LOAD_TEST` للاختبار، إعدادات مرنة |
| **Single point of failure** | منخفض | انقطاع كامل | Multi-region في Phase 3 |

---

## 📋 قائمة التحقق الأسبوعية

- [ ] تشغيل `node load-test.mjs 20 30` مع `LOAD_TEST=1`
- [ ] مراجعة Supabase Dashboard > Functions > Invocations
- [ ] مراجعة Cloudflare Workers > Analytics > Errors
- [ ] التحقق من P95 latency < 500ms للمسارات الحرجة
- [ ] مراجعة معدل الخطأ < 0.1%

---

**تم إعداد هذه الخطة بناءً على نتائج اختبار الحمل الفعلي والتحليل المعماري للمنصة.**  
**المرحلة 1 جاهزة للتنفيذ فوراً وسترفع السعة 3x دون تكلفة إضافية.**