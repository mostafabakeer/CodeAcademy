export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Paths that should be served as static assets (not SPA routes)
    const staticPaths = [
      '/assets/',
      '/api/',
      '/sw.js',
      '/workbox-',
      '/manifest.webmanifest',
      '/logo.png',
      '/favicon.ico',
      '/pwa-192.png',
      '/pwa-512.png',
      '/pwa-maskable-512.png',
      '/login-hero.png',
      '/owner.png',
    ];

    const isStaticPath = staticPaths.some(p => pathname.startsWith(p));

    // Try to serve the asset first
    const assetResponse = await env.ASSETS.fetch(request);

    // If asset found (not 404), return it
    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    // If it's a static path but not found, return the 404
    if (isStaticPath) {
      return assetResponse;
    }

    // For all other paths (SPA routes), serve index.html
    const indexUrl = new URL('/index.html', request.url);
    const indexRequest = new Request(indexUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: request.redirect,
    });
    return env.ASSETS.fetch(indexRequest);
  },
};