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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
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
