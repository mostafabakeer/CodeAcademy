import { supabase } from '../lib/supabase';

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

async function errorMessage(context: unknown, status: number): Promise<string> {
  if (context && typeof (context as { text?: () => Promise<string> }).text === 'function') {
    try {
      const raw = await (context as { text: () => Promise<string> }).text();
      const parsed = JSON.parse(raw) as { error?: string };
      if (parsed?.error) return parsed.error;
    } catch {
      /* ignore */
    }
  }
  return status >= 500 ? 'تعذر الاتصال بالخادم، حاول مجدداً' : `Request failed (${status})`;
}

export async function api<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, headers } = options;
  const route = path.startsWith('/api') ? path.slice(4) || '/' : path || '/';

  const invokeHeaders: Record<string, string> = { 'x-path': route, ...headers };
  const token = getToken();
  if (token) invokeHeaders.Authorization = `Bearer ${token}`;

  const { data, error, response } = await supabase.functions.invoke<T>('api', {
    method,
    headers: invokeHeaders,
    body: body === undefined ? undefined : normalizeBody(body),
  });

  if (error) {
    const err = error as { context?: Response } & { status?: number };
    const status = err?.context?.status ?? response?.status ?? 500;
    throw new ApiError(await errorMessage(err?.context ?? response, status), status);
  }
  return data as T;
}
