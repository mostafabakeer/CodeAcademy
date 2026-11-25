import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import compression from 'vite-plugin-compression';

export default defineConfig({
  // esbuild خيار top-level في Vite 6 (ليس build.esbuild ولا build.esbuildOptions).
  // نحذف debugger فقط. لا نحذف console لأن CodeLab يعترض console.error/warn
  // لعرضه للطالب، و ErrorBoundary يعتمدها لتتبّع الأعطال في الإنتاج.
  esbuild: {
    drop: ['debugger'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://hgeugcmockvnfenhljlc.supabase.co/functions/v1/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    compression({ algorithm: 'gzip', ext: '.gz' }),
    compression({ algorithm: 'brotliCompress', ext: '.br' }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png'],
      manifest: {
        name: 'DR Code | موقع البرمجة',
        short_name: 'DR Code',
        description: 'DR Code - منصة احترافية لتعليم البرمجة',
        lang: 'ar',
        dir: 'rtl',
        display: 'standalone',
        start_url: '/',
        background_color: '#08080d',
        theme_color: '#e11d31',
        icons: [
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // أحداث Web Push تُحقن داخل sw.js المولَّد (generateSW لا يدعمها مباشرة).
        importScripts: ['push-sw.js'],
        // لا نُخزّن مسبقاً مجموعات الخطوط غير المستخدمة (لغة عربية + لاتينية فقط).
        // ولا أصول Pyodide (10MB): تُخزَّن عند أول استخدام فقط بدل تحميلها لكل زائر.
        globIgnores: [
          '**/inter-cyrillic*.woff2',
          '**/inter-greek*.woff2',
          '**/inter-vietnamese*.woff2',
          '**/py-engine/**',
          // مكتبات ثقيلة تُحمَّل عند الحاجة فقط (hls لمشغل الدروس، CodeMirror لمحرر
          // الأكواد). تخزينها المسبق كان يُنزّل ~1.2MB لكل زائر جديد بلا فائدة.
          // بديلها runtimeCaching أدناه: تُخزَّن بعد أول استخدام وتبقى متاحة offline.
          '**/hls-*.js',
          '**/vendor-codemirror-*.js',
          // react-markdown يُستخدم في صفحة الملازم فقط — لا نُخزّنه مسبقاً
          // لكل زائر (117KB)، ويُخزَّن عند أول فتح للملازم عبر dr-assets.
          '**/vendor-markdown-*.js',
        ],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // محرك Python: كبير (10MB) ويُحمَّل مرة واحدة عند فتح محرر الأكواد.
            urlPattern: /\/py-engine\/\d[^/]*\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'dr-pyodide',
              // لا نُخزّن إلا الردود الناجحة: بدونها كان أي 404/خطأ يُحفظ
              // ويُعاد للطالب 30 يوماً، فيفشل Python بلا أي إصلاح ممكن.
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /\/assets\/.*\.(js|css|woff2?|ttf|otf)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'dr-assets',
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // الصور العامة الثابتة (شعار/رموز/بطاقة مشاركة) — بدون مصادقة
            urlPattern: /\/logo\.png$|\/login-hero\.png$|\/owner\.png$|\/og-cover\.jpg$|\/favicon-32\.png$|\/apple-touch-icon\.png$|\/.*\.webp$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'dr-public-img',
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
  base: '/',
  build: {
    chunkSizeWarningLimit: 1200,
    cssCodeSplit: true,
    modulePreload: true,
    rollupOptions: {
      output: {
        /**
         * تقسيم يدوي محدود بأسماء ثابتة (نحتاجها أيضاً في globIgnores للـ SW).
         * مهم: jsx-runtime يُنسب صراحةً إلى vendor-react. في الصيغة الكائنية
         * القديمة كان يُنسب إلى أول chunk كسول يستورده (markdown ثم codemirror)،
         * فيستورده الـ entry من هناك وينزّل الزائر مئات الكيلوبايتات قبل أول رسم.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          const inPkg = (re: RegExp) => re.test(id);
          if (
            inPkg(/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/) ||
            inPkg(/[\\/]node_modules[\\/]react[\\/]jsx-(dev-)?runtime/)
          ) {
            return 'vendor-react';
          }
          if (inPkg(/[\\/]node_modules[\\/]motion[\\/]/)) return 'vendor-motion';
          if (
            inPkg(/[\\/]node_modules[\\/](@uiw[\\/]react-codemirror|@codemirror|@lezer|style-mod|w3c-keyname|crelt)[\\/]/)
          ) {
            return 'vendor-codemirror';
          }
          if (
            inPkg(
              /[\\/]node_modules[\\/](react-markdown|remark-[^\\/]+|rehype-[^\\/]+|micromark[^\\/]*|mdast-[^\\/]+|unist-[^\\/]+|hast-[^\\/]+|vfile[^\\/]*|unified|bail|trough|devlop|ccount|character-entities[^\\/]*|decode-named-character-reference|markdown-table|longest-streak|zwitch|property-information|space-separated-tokens|comma-separated-tokens|style-to-object|trim-lines|html-url-attributes|escape-string-regexp)[\\/]/,
            )
          ) {
            return 'vendor-markdown';
          }
        },
      },
    },
  },
});
