/**
 * اختبار النظام المحلي (Client-Side Execution)
 */

import { chromium } from 'playwright';
import http from 'http';

const URL = 'http://localhost:5173/codelab';

console.log('=== اختبار نظام التنفيذ المحلي ===\n');

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // تتبع طلبات الشبكة
  const requests = [];
  const responseBodies = [];
  
  page.on('request', req => {
    if (!req.url().includes('localhost:5173')) {
      requests.push(req.url());
    }
  });
  
  page.on('response', async resp => {
    if (resp.request().method() !== 'GET' || !resp.url().includes('/api/')) {
      try {
        const body = await resp.text();
        responseBodies.push({ url: resp.url(), status: resp.status() });
      } catch {}
    }
  });

  console.log('1. فتح صفحة CodeLab...');
  await page.goto(URL);
  await page.waitForLoadState('networkidle');
  await new Promise(r => setTimeout(r, 2000));
  console.log('   ✓ الصفحة محملة\n');

  // التحقق من تحميل Pyodide
  console.log('2. التحقق من وجود Pyodide محلياً...');
  const pyodideExists = await page.evaluate(async () => {
    try {
      const resp = await fetch('/py-engine/0.26.4/pyodide.js');
      return resp.ok;
    } catch {
      return false;
    }
  });
  console.log(`   ${pyodideExists ? '✓' : '✗'} Pyodide محمّل محلياً\n`);

  // انتظار تحميل المحرر
  console.log('3. انتظار تحميل محرر الأكواد...');
  await page.locator('.cm-editor').waitFor({ state: 'visible' });
  console.log('   ✓ المحرر جاهز\n');

  // إنشاء ملف JS جديد واختباره
  console.log('4. اختبار JavaScript محلياً...');
  const initialRequests = [...requests];
  const initialResponses = [...responseBodies];
  
  // كتابة كود JS بسيط
  await page.locator('.cm-editor .cm-content').click({ force: true });
  await page.keyboard.type('console.log("Hello World");');
  await page.waitForTimeout(1000);
  
  // البحث عن زر Run والنقر عليه
  const runBtn = page.locator('button:has-text("Run")').first();
  if (await runBtn.isVisible().catch(() => false)) {
    await runBtn.click();
    await page.waitForTimeout(2000);
    
    // التحقق من النتائج
    const output = await page.locator('pre').innerText().catch(() => '');
    console.log(`   الناتج: "${output}"`);
    
    const newRequests = requests.filter(r => !initialRequests.includes(r));
    const newResponses = responseBodies.filter(r => 
      !initialResponses.some(ir => ir.url === r.url && ir.status === r.status)
    );
    
    if (newRequests.length === 0 && newResponses.length === 0) {
      console.log('   ✓ لا توجد طلبات شبكة أثناء التنفيذ!\n');
    } else {
      console.log('   ⚠ طلبات مكتشفة:', newRequests.length + newResponses.length, '\n');
    }
  } else {
    console.log('   ✗ لم يتم العثور على زر Run\n');
  }

  // اختبار حفظ الملف محلياً
  console.log('5. اختبار الحفظ المحلي...');
  const savedText = await page.evaluate(() => {
    const db = indexedDB.open('drcode-local');
    return new Promise(resolve => {
      db.onsuccess = () => {
        const transaction = db.result.transaction(['files'], 'readonly');
        const store = transaction.objectStore('files');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result?.length || 0);
        request.onerror = () => resolve(-1);
      };
      db.onerror = () => resolve(-1);
    });
  });
  console.log(`   عدد الملفات في IndexedDB: ${savedText}\n`);

  // إعادة تحميل الصفحة للاختبار
  console.log('6. اختبار استرجاع الجلسة بعد إعادة التحميل...');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('.cm-editor', { timeout: 10000 }).catch(() => {});
  
  const afterReloadContent = await page.locator('.cm-content').textContent().catch(() => '');
  console.log(`   محتوى المحرر بعد إعادة التحميل: "${afterReloadContent.substring(0, 50)}..."`);
  
  if (afterReloadContent.includes('Hello World')) {
    console.log('   ✓ الكود تم استعادته بنجاح!\n');
  } else {
    console.log('   ⚠ لم يتم استرجاع الكود تلقائياً\n');
  }

  console.log('=== انتهاء الاختبارات ===');
  
} catch (error) {
  console.error('خطأ في الاختبار:', error.message);
} finally {
  if (browser) {
    await browser.close();
  }
}
