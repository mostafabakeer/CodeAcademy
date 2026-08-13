# =========================================================
#  Dr. Code — فحص حالة المشروع على Supabase
# =========================================================
#  التشغيل:
#      powershell -ExecutionPolicy Bypass -File .\check.ps1
# =========================================================

$key = 'sb_publishable_Ti1GcC1f7aM41NP-m-Ioaw_EFsx2TAC'
$base = 'https://hgeugcmockvnfenhljlc.supabase.co'
$h = @{ apikey = $key; Authorization = "Bearer $key" }

Write-Host "`n===== 1) دالة api (health) =====" -ForegroundColor Cyan
try {
  $r = Invoke-WebRequest -UseBasicParsing -Uri "$base/functions/v1/api/health" -TimeoutSec 30
  Write-Host "   HTTP $($r.StatusCode) — $($r.Content)" -ForegroundColor Green
}
catch {
  $s = $_.Exception.Response.StatusCode.value__
  Write-Host "   HTTP $s — الدالة غير منشورة بعد أو فشلت" -ForegroundColor Yellow
}

Write-Host "`n===== 2) وجود الجداول والبيانات =====" -ForegroundColor Cyan
Write-Host "   (التفسير: 200 + [] = الجدول موجود لكن RLS يمنع الوصول المباشر [الأمن مطلوب]"
Write-Host "    200 + صفوف = الجدول موجود بلا RLS  |  404 = الجدول غير موجود = المهاجرات لم تُطبق)" -ForegroundColor DarkGray

foreach ($t in @('courses', 'users', 'lessons', 'exams', 'questions', 'notes', 'app_config', 'code_files', 'exam_results', 'progress', 'top_students')) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$base/rest/v1/$t`?select=id&limit=1" -Headers $h -TimeoutSec 30
    Write-Host "   جدول $t : HTTP $($r.StatusCode) — $($r.Content)"
  }
  catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
      $body = $sr.ReadToEnd()
      Write-Host "   جدول $t : HTTP $([int]$resp.StatusCode) — $body"
    }
    else {
      Write-Host "   جدول $t : ERROR — $($_.Exception.Message)"
    }
  }
}

Write-Host "`nانتهى الفحص. انسخ كل الناتج وأرسله لي." -ForegroundColor Cyan
