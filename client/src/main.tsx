import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { LanguageProvider } from './i18n';
import { AuthInitializer } from './components/AuthInitializer';
import ErrorBoundary from './components/ErrorBoundary';
import App from './App';
// خطوط مستضافة محلياً (variable) — تلغي طلب Google Fonts الخارجي الحاجب للعرض.
import '@fontsource-variable/cairo/wght.css';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './styles/index.css';

/**
 * عند تفعيل نسخة جديدة من الـ service worker نعيد تحميل الصفحة مرة واحدة.
 * بدون ذلك قد يبقى الطالب على حزمة قديمة (تشير إلى مسارات لم تعد موجودة) حتى
 * يغلق كل التبويبات — وهو ما سبّب ظهور خطأ محرك Python بعد نقل مساره.
 * لا نُعيد التحميل في أول زيارة (حين لا يكون هناك controller سابق).
 */
if ('serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <ErrorBoundary>
        <MotionConfig reducedMotion="user">
          <LanguageProvider>
            <AuthInitializer>
              <App />
            </AuthInitializer>
          </LanguageProvider>
        </MotionConfig>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>
);
