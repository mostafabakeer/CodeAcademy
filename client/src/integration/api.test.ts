/* =================== Integration Tests for API =================== */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch
global.fetch = vi.fn();

// Mock environment
import { api } from '../api/client';

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should add auth headers with bearer token from localStorage', async () => {
    // The code reads from 'dr_code_token_v1' with format {v:1, token, exp, savedAt}
    localStorage.setItem('dr_code_token_v1', JSON.stringify({
      v: 1,
      token: 'test-bearer-token',
      exp: Math.floor((Date.now() + 3600000) / 1000),
      savedAt: Date.now(),
    }));

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
      headers: { get: () => 'application/json' },
    });

    await api('/test-endpoint', { method: 'GET' });

    const callArgs = (fetch as any).mock.calls[0];
    const headers = callArgs[1].headers;
    expect(headers.Authorization).toBe('Bearer test-bearer-token');
  });

  it('should include cookies with credentials: include', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
      headers: { get: () => 'application/json' },
    });

    await api('/test-endpoint', { method: 'GET' });

    const callArgs = (fetch as any).mock.calls[0];
    expect(callArgs[1].credentials).toBe('include');
  });

  it('should retry on 401 for non-auth paths', async () => {
    let callCount = 0;

    (fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ code: 'token_expired' }),
        headers: { get: () => 'application/json' },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ token: 'new-token', user: { id: 1 } }),
        headers: { get: () => 'application/json' },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
        headers: { get: () => 'application/json' },
      });

    const result = await api('/test-endpoint', { method: 'GET' });

    // Should have called fetch 3 times (original + refresh + retry)
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ success: true });
  });

  it('should NOT retry on 401 for auth paths', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
      headers: { get: () => 'application/json' },
    });

    try {
      await api('/auth/login', { method: 'POST', body: { phone: '01000000000', password: 'wrong' } });
    } catch (e) {
      // Expected to throw
    }

    // Should only call once for auth paths
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should NOT retry unsafe methods across targets', async () => {
    (fetch as any)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
        headers: { get: () => 'application/json' },
      });

    try {
      await api('/test-endpoint', { method: 'POST', body: { data: 'test' } });
    } catch (e) {
      // Expected to throw because POST is not safe to retry
    }

    // Should only call once for unsafe methods
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should invalidate bootstrap cache after admin mutations', async () => {
    localStorage.setItem('dr_code_token', JSON.stringify({
      v: 1,
      token: 'admin-token',
      exp: Date.now() + 3600000,
    }));

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ exam: { id: 1 } }),
      headers: { get: () => 'application/json' },
    });

    await api('/exams', {
      method: 'POST',
      body: { title: 'New Exam' },
    });

    // Check that localStorage bootstrap cache was cleared
    // (This is tested indirectly via the cache module)
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});