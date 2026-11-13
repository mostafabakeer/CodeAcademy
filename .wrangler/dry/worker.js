var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/worker.js
var SUPABASE_FN_BASE = "https://hgeugcmockvnfenhljlc.supabase.co/functions/v1/api";
var API_TIMEOUT_MS = 2e4;
var RETRY_DELAY_MS = 250;
var MAX_ATTEMPTS = 3;
function normalizeSetCookie(cookie) {
  return cookie.replace(/;\s*domain=[^;]*/gi, "").replace(/;\s*samesite=none/i, "; SameSite=Lax");
}
__name(normalizeSetCookie, "normalizeSetCookie");
function isRelayableCookie(cookie) {
  return !/^\s*__cf/i.test(cookie);
}
__name(isRelayableCookie, "isRelayableCookie");
async function proxyApi(request, url) {
  const route = url.pathname.replace(/^\/api(?=\/|$)/, "") || "/";
  const target = new URL(SUPABASE_FN_BASE + route);
  target.search = url.search;
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("x-path", route + url.search);
  headers.set("x-forwarded-host", url.host);
  const init = {
    method: request.method,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(API_TIMEOUT_MS)
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }
  const idempotent = request.method === "GET" || request.method === "HEAD";
  const attempts = idempotent ? MAX_ATTEMPTS : 1;
  let upstream;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      upstream = await fetch(target.toString(), init);
      lastError = void 0;
      break;
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
    }
  }
  if (!upstream) {
    console.warn(
      `[api-proxy] ${request.method} ${target.pathname} \u0641\u0634\u0644 \u0628\u0639\u062F ${attempts} \u0645\u062D\u0627\u0648\u0644\u0629:`,
      lastError?.message || lastError
    );
    return new Response(
      JSON.stringify({ error: "\u062A\u0639\u0630\u0651\u0631 \u0627\u0644\u0648\u0635\u0648\u0644 \u0644\u0644\u062E\u0627\u062F\u0645\u060C \u062D\u0627\u0648\u0644 \u0645\u062C\u062F\u062F\u0627\u064B" }),
      { status: 502, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }
  const outHeaders = new Headers(upstream.headers);
  outHeaders.delete("set-cookie");
  outHeaders.delete("content-encoding");
  outHeaders.delete("content-length");
  const allCookies = typeof upstream.headers.getSetCookie === "function" ? upstream.headers.getSetCookie() : [];
  const cookies = allCookies.filter(isRelayableCookie);
  for (const c of cookies) outHeaders.append("set-cookie", normalizeSetCookie(c));
  outHeaders.set("vary", "Cookie, Origin");
  if (cookies.length) outHeaders.set("cache-control", "private, no-store");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders
  });
}
__name(proxyApi, "proxyApi");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return proxyApi(request, url);
    }
    const staticPaths = [
      "/assets/",
      "/sw.js",
      "/workbox-",
      "/manifest.webmanifest",
      "/logo.png",
      "/favicon.ico",
      "/pwa-192.png",
      "/pwa-512.png",
      "/pwa-maskable-512.png",
      "/login-hero.png",
      "/owner.png",
      "/pyodide/"
    ];
    if (staticPaths.some((p) => pathname.startsWith(p))) {
      return env.ASSETS.fetch(request);
    }
    const hasExtension = /\.[a-z0-9]+$/i.test(pathname);
    if (hasExtension) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) return assetResponse;
    } else {
      const candidates = pathname === "/" ? ["/index.html"] : [`${pathname}/index.html`, `${pathname}.html`];
      for (const candidate of candidates) {
        const candidateRequest = new Request(new URL(candidate, url.origin).toString(), {
          method: "GET",
          headers: request.headers
        });
        const candidateResponse = await env.ASSETS.fetch(candidateRequest);
        if (candidateResponse.status !== 404) return candidateResponse;
      }
    }
    const indexRequest = new Request(new URL("/index.html", url.origin).toString(), {
      method: "GET",
      headers: request.headers
    });
    return env.ASSETS.fetch(indexRequest);
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
