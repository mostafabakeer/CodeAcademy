import { SUPABASE_URL } from '../config';

const TOKEN_KEY = 'dr_code_token';
let memoryToken: string | null = null;

export function getToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  memoryToken = token;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearToken(): void {
  memoryToken = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

type InvokeBody = File | Blob | ArrayBuffer | FormData | ReadableStream<Uint8Array> | Record<string, any> | string;

function normalizeBody(body: unknown): InvokeBody {
  if (typeof body === 'string') {
    const t = body.trim();
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try {
        return JSON.parse(t);
      } catch {
        /* keep raw string */
      }
    }
  }
  return body as InvokeBody;
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const parsed = (await res.json()) as { error?: string };
    if (parsed?.error) return parsed.error;
  } catch {
    /* ignore */
  }
  return res.status >= 500 ? 'تعذر الاتصال بالخادم، حاول مجدداً' : `Request failed (${res.status})`;
}

export async function api<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, headers } = options;
  const route = path.startsWith('/api') ? path.slice(4) || '/' : path || '/';

  const requestHeaders: Record<string, string> = { 'x-path': route, ...headers };
  const token = getToken();
  if (token) requestHeaders.Authorization = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    const normalized = normalizeBody(body);
    if (typeof normalized === 'string') {
      payload = normalized;
    } else if (normalized instanceof Blob || normalized instanceof FormData || normalized instanceof ArrayBuffer) {
      payload = normalized;
    } else {
      requestHeaders['Content-Type'] = 'application/json';
      payload = JSON.stringify(normalized);
    }
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/api`, {
    method,
    headers: requestHeaders,
    credentials: 'include',
    body: payload,
  });

  if (!res.ok) {
    throw new ApiError(await errorMessage(res), res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
