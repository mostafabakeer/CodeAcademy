import { StrictMode, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { LanguageProvider } from './i18n';
import { AuthBootstrap } from './store/authStore';
import ErrorBoundary from './components/ErrorBoundary';
import App from './App';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <MotionConfig reducedMotion="user">
          <LanguageProvider>
            <Fragment>
              <AuthBootstrap />
              <App />
            </Fragment>
          </LanguageProvider>
        </MotionConfig>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>
);
