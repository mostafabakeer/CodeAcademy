import { CORS_ORIGIN } from './env.ts';

function allowedOrigin(req: Request): string | null {
  const origin = req.headers.get('origin');
  if (!origin) return null; // لا Origin = خادم/أداة، لا يحتاج CORS
  const list = CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length || !list.includes(origin)) return null; // fail-closed
  return origin;
}

export function corsHeaders(req: Request): Headers {
  const h = new Headers();
  const origin = allowedOrigin(req);
  if (origin) h.set('Access-Control-Allow-Origin', origin);
  h.set('Access-Control-Allow-Credentials', 'true');
  h.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-path,X-Client-Info');
  return h;
}

export function json(body: unknown, status = 200, req?: Request, extraHeaders?: Record<string, string>): Response {
  const headers = corsHeaders(req ?? new Request('http://local'));
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
  }
  return new Response(JSON.stringify(body), { status, headers });
}
