# =========================================================
#  Dr. Code — نشر تلقائي على Supabase Edge Functions
# =========================================================
#  التشغيل من داخل مجلد المشروع (PowerShell):
#      powershell -ExecutionPolicy Bypass -File .\deploy.ps1
#
#  ستحتاج فقط لشيئين (سيُطلبان منك أثناء التنفيذ):
#    1) تسجيل الدخول: يفتح رابطاً في المتصفح -> انسخ الـ token والصقه هنا
#    2) كلمة مرور قاعدة البيانات عند supabase link
#       لو نسيتها: Dashboard -> Project Settings -> Database -> Reset database password
#
#  لو فشلت خطوة، سيتوقف السكربت وتظهر لك رسالة — انسخها وأرسلها لنا.
#  أمر مفيد عند "already exists":
#      powershell -ExecutionPolicy Bypass -File .\deploy.ps1 -SkipDbPush
# =========================================================

param(
  [string]$ProjectRef = "hgeugcmockvnfenhljlc",
  [switch]$SkipDbPush
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location $Root

Write-Host ""
Write-Host "==> المشروع: $Root" -ForegroundColor Cyan
Write-Host "==> المشروع المستهدف: $ProjectRef" -ForegroundColor Cyan

# ---------- 1) إيجاد أو تنزيل supabase CLI ----------
$cli = Get-Command supabase -ErrorAction SilentlyContinue
if ($cli) {
  $supabase = $cli.Source
  Write-Host "==> تم العثور على supabase CLI: $supabase" -ForegroundColor Green
}
else {
  $BinDir = Join-Path $Root ".bin"
  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  $exe = Join-Path $BinDir "supabase.exe"
  if (-not (Test-Path $exe)) {
    $zip = Join-Path $BinDir "supabase.zip"
    $url = "https://github.com/supabase/cli/releases/latest/download/supabase_windows_amd64.zip"
    Write-Host "==> جاري تنزيل supabase CLI (لأول مرة فقط)..." -ForegroundColor Yellow
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $BinDir -Force
    Remove-Item $zip -Force
    Write-Host "==> تم التنزيل." -ForegroundColor Green
  }
  $supabase = $exe
}

function Run-Step([string]$Title, [scriptblock]$Body) {
  Write-Host ""
  Write-Host "===== $Title =====" -ForegroundColor Cyan
  & $Body
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "!!! فشلت هذه الخطوة (رمز $LASTEXITCODE). انسخ الرسالة أعلاه وأرسلها لنا." -ForegroundColor Red
    exit $LASTEXITCODE
  }
}

# ---------- 2) init (إنشاء config.toml إن لم يوجد) ----------
if (-not (Test-Path (Join-Path $Root "supabase\config.toml"))) {
  Run-Step "supabase init" { & $supabase init }
}

# ---------- 3) تسجيل الدخول ----------
Run-Step "supabase login — افتح الرابط ثم انسخ الـ token والصقه" { & $supabase login }

# ---------- 4) ربط المشروع ----------
Run-Step "supabase link — أدخل كلمة مرور قاعدة البيانات" { & $supabase link --project-ref $ProjectRef }

# ---------- 5) تطبيق المهاجرات ----------
if (-not $SkipDbPush) {
  Write-Host ""
  Write-Host "===== supabase db push (تطبيق الجداول) =====" -ForegroundColor Cyan
  & $supabase db push
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "!!! db push فشل. لو كانت الرسالة تقول already exists فالجداول موجودة مسبقاً،" -ForegroundColor Yellow
    Write-Host "!!! ويمكنك المتابعة بالتشغيل مرة أخرى مع: .\deploy.ps1 -SkipDbPush" -ForegroundColor Yellow
    exit $LASTEXITCODE
  }
}

# ---------- 6) ضبط سر JWT_SECRET إن لم يوجد ----------
$current = (& $supabase secrets list --project-ref $ProjectRef 2>$null) -join "`n"
if ($current -notmatch "JWT_SECRET") {
  $secret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
  Run-Step "ضبط سر JWT_SECRET (مولّد عشوائياً)" { & $supabase secrets set "JWT_SECRET=$secret" --project-ref $ProjectRef }
}
else {
  Write-Host ""
  Write-Host "==> JWT_SECRET موجود مسبقاً — لن يُغيَّر." -ForegroundColor Green
}

# ---------- 7) نشر الدوال ----------
foreach ($fn in @("api", "backup", "cleanup")) {
  Run-Step "functions deploy $fn (بدون verify-jwt)" {
    & $supabase functions deploy $fn --no-verify-jwt --project-ref $ProjectRef
  }
}

# ---------- 8) التحقق النهائي ----------
Write-Host ""
Write-Host "===== التحقق النهائي =====" -ForegroundColor Cyan
$url = "https://$ProjectRef.supabase.co/functions/v1/api/health"
try {
  $r = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 30
  Write-Host "HTTP $($r.StatusCode)" -ForegroundColor Green
  Write-Host $r.Content -ForegroundColor Green
  if ($r.Content -match '"ok":true') {
    Write-Host ""
    Write-Host "تم النشر بنجاح! افتح تطبيقك الآن." -ForegroundColor Green
  }
  else {
    Write-Host ""
    Write-Host "الدالة تعمل لكن القاعدة غير متاحة — راجع المهاجرات." -ForegroundColor Yellow
  }
}
catch {
  Write-Host "فشل الاتصال بالـ health: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "انتهى السكربت. لو ظهرت أي رسالة خطأ، انسخها وأرسلها لنا." -ForegroundColor Cyan
