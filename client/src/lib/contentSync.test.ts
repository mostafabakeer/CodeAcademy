/* =================== Unit Tests for contentSync =================== */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../api/client', () => ({
  api: vi.fn(),
}));

vi.mock('../store/authStore', () => ({
  useAuthStore: {
    getState: () => ({ user: { id: 1 } }),
  },
}));

vi.mock('../store/toastStore', () => ({
  useToastStore: () => ({
    addToast: vi.fn(),
  }),
}));

import { api } from '../api/client';
import { initiateContentSync } from './contentSync';

describe('contentSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset window mocks
    (window as any).VITE_CONTENT_SYNC = 'polling';
    (window as any).VITE_SUPABASE_ANON_KEY = undefined;
    (window as any).VITE_SUPABASE_URL = undefined;
  });

  it('should detect polling strategy by default', () => {
    const { state } = initiateContentSync();
    expect(state.strategy).toBe('polling');
  });

  it('should detect realtime strategy when VITE_SUPABASE_ANON_KEY is present', () => {
    (window as any).VITE_SUPABASE_ANON_KEY = 'test-key';
    (window as any).VITE_SUPABASE_URL = 'https://test.supabase.co';

    const { state } = initiateContentSync();
    expect(state.strategy).toBe('realtime');
  });

  it('should detect off strategy when VITE_CONTENT_SYNC=off', () => {
    (window as any).VITE_CONTENT_SYNC = 'off';

    const { state } = initiateContentSync();
    expect(state.strategy).toBe('off');
  });

  it('should track version changes via polling', async () => {
    (api as any).mockResolvedValueOnce({ version: 1 });
    (api as any).mockResolvedValueOnce({ version: 2 });

    const { state, refresh } = initiateContentSync({ pollingInterval: 10 });

    // Wait for first poll
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(state.lastKnownVersion).toBe(1);

    // Wait for second poll
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(state.lastKnownVersion).toBe(2);
  });

  it('should call listener when version changes', async () => {
    (api as any).mockResolvedValueOnce({ version: 1 });
    (api as any).mockResolvedValueOnce({ version: 2 });

    const listener = vi.fn();
    const { addListener } = initiateContentSync({
      pollingInterval: 10,
      onChange: listener,
    });

    // Wait for first poll
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Wait for second poll
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(listener).toHaveBeenCalledWith('content');
  });

  it('should stop polling when destroyed', async () => {
    (api as any).mockResolvedValue({ version: 1 });

    const { destroy } = initiateContentSync({ pollingInterval: 10 });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((api as any)).toHaveBeenCalled();

    destroy();
    vi.clearAllMocks();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((api as any)).not.toHaveBeenCalled();
  });

  it('should not poll when tab is hidden', async () => {
    (api as any).mockResolvedValue({ version: 1 });

    const originalVisibility = document.visibilityState;
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });

    const { destroy } = initiateContentSync({ pollingInterval: 10 });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((api as any)).not.toHaveBeenCalled();

    destroy();
    Object.defineProperty(document, 'visibilityState', {
      value: originalVisibility,
      configurable: true,
    });
  });
});