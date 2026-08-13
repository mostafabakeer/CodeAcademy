# 🚀 رفع موقع DR Code على Oracle Cloud (مجاناً للأبد)

> هذا الدليل يشرح رفع **الموقع كاملاً** (الواجهة + السيرفر + قاعدة البيانات + الصور) على سيرفر Oracle Cloud المجاني.
> الوقت التقريبي: 30–45 دقيقة.

---

## الجزء الأول: إنشاء الحساب والسيرفر

### 1) سجّل حساباً مجانياً على Oracle Cloud
- افتح: https://www.oracle.com/cloud/free/
- اضغط **Start for free** واملأ البيانات (مطلوب بطاقة بنكية للتحقق فقط، **لا يُخصم أي مبلغ**).
- بعد التأكيد ادخل على لوحة التحكم: https://cloud.oracle.com

### 2) أنشئ سيرفراً (Compute Instance)
1. من القائمة: **Compute → Instances → Create instance**
2. **Name:** `drcode`
3. قسم **Image and shape**:
   - **Image:** `Ubuntu 24.04` (أو 22.04)
   - **Shape:** اختر **Ampere A1 (ARM)** — مجاني بقوة كبيرة (4 أنوية + 24GB رام). لو مش متاح في منطقتك، اختر `VM.Standard.E2.1.Micro` (مجاني لكن أخف).
4. قسم **Networking** → اتركه كما هو.
5. قسم **SSH keys**:
   - اختر **Generate a key pair for me**
   - سيتم تنزيل ملفين: `ssh-key-....key` (الخاص) و `ssh-key-....key.pub` (العام)
   - **احتفظ بالملف الخاص في مكان آمن** — ده المفتاح للدخول.
6. اضغط **Create** وانتظر حتى تظهر الحالة **Running**.

### 3) فتح منفذ 4000 في جدار الحماية (OCI)
1. من القائمة: **Networking → Virtual cloud networks** → اضغط على الـ VCN بتاعك.
2. اضغط **Security Lists → Default Security List → Add Ingress Rules**
3. أضف قاعدة:
   - Source CIDR: `0.0.0.0/0`
   - IP Protocol: `TCP`
   - Destination Port Range: `4000`
4. اضغط **Add Ingress Rules**.

> استخدم عنوان IP الخاص بالسيرفر من صفحة الـ Instance (قسم **Reserved public IP** أو Private IP + Public IP).
> لاحظ: أضف 80 و443 لاحقاً لو هتربط دومين (خطوة اختيارية).

---

## الجزء الثاني: الاتصال بالسيرفر

من **Windows PowerShell** على جهازك، اكتب:

```powershell
# خليك في نفس المجلد اللي فيه ملف المفتاح الخاص
ssh -i .\ssh-key-2024-....key ubuntu@IP_SERVER
```

حيث `IP_SERVER` = عنوان IP العام للسيرفر.

> لو ظهرت مشكلة صلاحيات الملف، نفّذ (في PowerShell):
> `icacls .\ssh-key-2024-....key /inheritance:r /grant:r "$env:USERNAME:R"`

---

## الجزء الثالث: تثبيت Docker على السيرفر

اكتب هذه الأوامر في السيرفر (بعد الاتصال):

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo apt install -y docker-compose-plugin
sudo usermod -aG docker $USER
```

سجّل الخروج (`exit`) وأعد الاتصال مرة أخرى حتى يسري صلاحيات docker.

---

## الجزء الرابع: نقل المشروع للسيرفر

اختر إحدى الطريقتين:

### الطريقة أ (الأسهل للتحديثات) — عبر GitHub
1. على جهازك أنشئ مستودع (Repository) جديد على GitHub **خاص (Private)**.
2. في مجلد المشروع على جهازك:
   ```powershell
   git init
   git add .
   git commit -m "first deploy"
   git branch -M main
   git remote add origin https://github.com/اسمك/drcode.git
   git push -u origin main
   ```
3. على السيرفر:
   ```bash
   sudo apt install -y git
   git clone https://github.com/اسمك/drcode.git /opt/drcode
   cd /opt/drcode
   ```

### الطريقة ب — عبر SCP (بدون GitHub)
1. على جهازك، اصنع ملف مضغوط بدون `node_modules` (الأسهل من PowerShell):
   ```powershell
   # من داخل مجلد المشروع
   tar -a -c -f drcode.tar.gz --exclude="*/node_modules" --exclude="client/dist" --exclude="server/data" --exclude="server/uploads" .
   scp -i .\ssh-key-2024-....key .\drcode.tar.gz ubuntu@IP_SERVER:/tmp/
   ```
2. على السيرفر:
   ```bash
   sudo mkdir -p /opt/drcode
   sudo tar -xzf /tmp/drcode.tar.gz -C /opt/drcode
   cd /opt/drcode
   ```

---

## الجزء الخامس: إعداد المتغيرات السرية وتشغيل الموقع

### 1) توليد مفتاح سري قوي
على السيرفر:
```bash
openssl rand -hex 32
```
انسخ الناتج — ده هو `JWT_SECRET`.

### 2) ضبط المتغيرات في docker-compose.yml
عدّل `/opt/drcode/docker-compose.yml`:

```bash
nano /opt/drcode/docker-compose.yml
```

غيّر قيم `JWT_SECRET` و `SUPABASE_URL` و `SUPABASE_SERVICE_ROLE_KEY` إلى قيمك الحقيقية (موجودة في مجلد `server/.env` على جهازك أو من Supabase Dashboard).

احفظ: `Ctrl+X` ثم `Y` ثم `Enter`.

### 3) تشغيل الموقع
```bash
cd /opt/drcode
sudo docker compose up -d --build
```

### 4) فتح المنفذ في جدار حماية السيرفر نفسه
```bash
sudo iptables -I INPUT -p tcp --dport 4000 -j ACCEPT
```

---

## الجزء السادس: تجربة الموقع

افتح في المتصفح: `http://IP_SERVER:4000`

- سجل أول حساب → **سيكون أدمن تلقائياً** (حسب نظام الموقع).
- جرّب صفحة الأوائل `/top-students`.

### أوامر مفيدة
```bash
# مشاهدة الحالة والسجلات
docker compose -f /opt/drcode/docker-compose.yml logs -f

# إيقاف/تشغيل
docker compose -f /opt/drcode/docker-compose.yml down
docker compose -f /opt/drcode/docker-compose.yml up -d

# تحديث الموقع بعد أي تعديل (طريقة GitHub)
cd /opt/drcode && git pull
docker compose up -d --build
```

---

## الجزء السابع (اختياري): ربط دومين مع HTTPS عبر Cloudflare

1. اشترِ دومين وعدّل نيمسيرفرز من مسجل الدومين إلى Cloudflare.
2. في Cloudflare: **DNS → Add record**:
   - Type: `A` — Name: `@` — IPv4 address: `IP_SERVER` (الـ IP بتاع Oracle)
   - فعّل السحابة البرتقالية (Proxy) لتفعيل HTTPS مجاناً.
3. أعد فتح المنافذ 80 و443 في Oracle Security List (كما في الخطوة 3 بالجزء الأول).
4. على السيرفر افتح المنافذ:
   ```bash
   sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
   ```

> الموقع بيتعرض على المنفذ 4000، فإما تعمل ترجمة منفذ (Cloudflare Rules) أو تعدّل في السيرفر `PORT=80`.
> الأسهل: عدّل في `docker-compose.yml` إلى `"80:4000"` و `PORT=4000` وادخل للدومين مباشرة.

---

## ملاحظات مهمة

- **البيانات محفوظة في مجلدات `data` و `uploads`** داخل حاويتي تخزين (volumes) — لا تضيع مع أي إعادة تشغيل أو تحديث.
- **ملف `server/data/db.json`** هو قاعدة البيانات، و`server/uploads` هي الصور والفيديوهات المرفوعة.
- لو عايز نسخة احتياطية: انسخ هذين المجلدين من السيرفر:
  ```bash
  sudo cp -r /var/lib/docker/volumes/drcode_data/_data /root/backup-data
  sudo cp -r /var/lib/docker/volumes/drcode_uploads/_data /root/backup-uploads
  ```
- **لا ترفع أبداً** ملف `server/.env` أو أي مفاتيح سرية إلى GitHub.
