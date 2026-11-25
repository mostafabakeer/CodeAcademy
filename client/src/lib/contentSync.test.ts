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
import { detectStrategy, signalContentChange } from './contentSync';

describe('contentSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset window mocks
    (window as any).VITE_CONTENT_SYNC = 'polling';
    (window as any).VITE_SUPABASE_ANON_KEY = undefined;
    (window as any).VITE_SUPABASE_URL = undefined;
  });

  it('should detect polling strategy by default', () => {
    expect(detectStrategy()).toBe('polling');
  });

  it('should detect realtime strategy when VITE_SUPABASE_ANON_KEY is present', () => {
    (window as any).VITE_SUPABASE_ANON_KEY = 'test-key';
    (window as any).VITE_SUPABASE_URL = 'https://test.supabase.co';

    expect(detectStrategy()).toBe('realtime');
  });

  it('should detect off strategy when VITE_CONTENT_SYNC=off', () => {
    (window as any).VITE_CONTENT_SYNC = 'off';

    expect(detectStrategy()).toBe('off');
  });

  it('should signal content change via BroadcastChannel', () => {
    const mockPostMessage = vi.fn();
    const originalBC = window.BroadcastChannel;

    // Mock BroadcastChannel
    class MockBroadcastChannel {
      name: string;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;

      constructor(name: string) {
        this.name = name;
      }

      postMessage(message: any): void {
        mockPostMessage(message);
      }

      close(): void {
        this.onmessage = null;
        this.onmessageerror = null;
      }
    }

    Object.defineProperty(window, 'BroadcastChannel', {
      value: MockBroadcastChannel,
      writable: true,
      configurable: true,
    });

    signalContentChange('exams');

    expect(mockPostMessage).toHaveBeenCalledWith({ entity: 'exams' });

    Object.defineProperty(window, 'BroadcastChannel', {
      value: originalBC,
      writable: true,
      configurable: true,
    });
  });

  it('should handle missing BroadcastChannel gracefully', () => {
    const originalBC = window.BroadcastChannel;
    Object.defineProperty(window, 'BroadcastChannel', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    // Should not throw
    expect(() => signalContentChange('exams')).not.toThrow();

    Object.defineProperty(window, 'BroadcastChannel', {
      value: originalBC,
      writable: true,
      configurable: true,
    });
  });
});