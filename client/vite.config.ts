import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png'],
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
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^\/assets\/.*\.(js|css|woff2?|ttf|otf)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'dr-assets',
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // الصور العامة الثابتة (شعار/رموز) — بدون مصادقة
            urlPattern: /^\/logo\.png$|^\/login-hero\.png$|^\/owner\.png$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'dr-public-img',
              expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
  base: '/',
  server: {
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
