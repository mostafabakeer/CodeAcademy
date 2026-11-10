# 🧪 دليل الاختبار اليدوي لنظام التنفيذ المحلي

## المتطلبات:
- Chrome / Edge / Firefox
- السيرفر يعمل على `http://localhost:5173`

---

## ✅ اختبارات يجب إجراؤها يدوياً

### 1. اختبار JavaScript المحلي (الأهم)
1. افتح: `http://localhost:5173/codelab`
2. اضغط `+ New File` → اسم: `test.js` → اللغة: JavaScript
3. اكتب الكود:
```javascript
console.log("Hello World");
for(let i=0; i<3; i++) console.log(i);
```
4. افتح **DevTools (F12)** → تبويب **Network**
5. اضغط **▶ Run**
6. **النتيجة المتوقعة:**
   - Network Tab **فارغ** (لا XHR، لا Fetch)
   - Console يظهر: `0, 1, 2` أو في لوحة Output
   - لا طلبات للخادم!

### 2. اختبار Python المحلي
1. ملف جديد: `test.py` → اللغة: Python
2. اكتب:
```python
print("Hello Python")
x = [1, 2, 3]
print(sum(x))
```
3. ▶ Run
4. **النتيجة:**
   - أول تشغيل: رسالة "جارِ تحميل Python..." (~10MB)
   - التنفيذ التالي: فوري
   - لا طلبات شبكة في Network Tab

### 3. اختبار HTML/CSS مع ربط الملفات
1. أنشئ 3 ملفات:
   - `index.html`:
   ```html
   <link rel="stylesheet" href="style.css">
   <script src="main.js"></script>
   <h1 id="title">Hello</h1>
   <button onclick="changeColor()">Change</button>
   ```
   - `style.css`: `h1 { color: red; }`
   - `main.js`: `function changeColor() { document.getElementById('title').style.color = 'blue'; }`

3. افتح `index.html` في المحرر
4. ▶ Run
5. **النتيجة:** المعاينة تظهر في iframe مع CSS و JS مدمجين محلياً

### 4. اختبار حفظ الجلسة
1. اكتب كود في أي ملف
2. أغلق المتصفح تماماً
3. أعد فتح `http://localhost:5173/codelab`
4. **النتيجة:** نفس الملف يفتح مع نفس الكود!

### 5. اختبار الإشعارات
1. اذهب إلى `/profile`
2. اضغط "تفعيل الإشعارات"
3. وافق على إذن المتصفح
4. اضغط "إرسال إشعار تجريبي"
5. **النتيجة:** إشعار يظهر حتى لو الموقع مغلق

### 6. اختبار العمل دون اتصال (Offline)
1. بعد اختبار كل شيء أعلاه:
2. DevTools → Application → Service Workers → ✅ Offline
3. أعد تحميل الصفحة
6. **النتيجة:** التطبيق يعمل بالكامل!

---

## 🔍 ما تبحث عنه في Network Tab

| العملية | طلبات متوقعة | طلبات غير مقبولة |
|---------|--------------|-------------------|
| فتح الموقع | GET /, GET /api/auth/me | - |
| أول Pyodide | GET /pyodide/pyodide.js | - |
| Run JS | **لا شيء** | POST /api/code, GET /api/... |
| Run Python | **لا شيء** | POST /api/execute |
| حفظ تلقائي | **لا شيء** | PUT /api/code/:id |

---

## ⚠️ مشاكل معروفة وحلولها

| المشكلة | الحل |
|----------|-------|
| "Python Loading..." طويل | أول مرة فقط (~10MB)، بعدها فوري |
| زر Run لا يعمل | تأكد من اختيار ملف أولاً |
| الكود لا يحفظ | IndexedDB محظور؟ تحقق من إعدادات الخصوصية |
| إشعارات لا تظهر | HTTPS مطلوب للـ PWA / أو Localhost يعمل |

---

## 📊 النتيجة المتوقعة عند النجاح

```
✅ JavaScript يعمل محلياً - 0 طلبات شبكة
✅ Python يعمل محلياً - 0 طلبات شبكة  
✅ HTML/CSS/JS يربط الملفات محلياً
✅ المشاريع تحفظ في IndexedDB
✅ استرجاع الجلسة بعد إغلاق المتصفح
✅ إشعارات تعمل في الخلفية
✅ يعمل دون اتصال (Offline)
```

---

**ملاحظة:** إذا واجهت أي مشكلة، يرجى توثيق الخطأ وسأقوم بإصلاحه فوراً.
