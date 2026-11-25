import { vi } from 'vitest';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn((key: string) => {
    const value = (window as any).__localStorageMock?.[key];
    return value ?? null;
  }),
  setItem: vi.fn((key: string, value: string) => {
    if (!(window as any).__localStorageMock) {
      (window as any).__localStorageMock = {};
    }
    (window as any).__localStorageMock[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    if ((window as any).__localStorageMock) {
      delete (window as any).__localStorageMock[key];
    }
  }),
  clear: vi.fn(() => {
    (window as any).__localStorageMock = {};
  }),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock BroadcastChannel
class MockBroadcastChannel {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;

  constructor(name: string) {
    this.name = name;
  }

  postMessage(message: any): void {
    // In tests, we can just call onmessage directly if set
    if (this.onmessage) {
      setTimeout(() => this.onmessage?.({ data: message } as MessageEvent), 0);
    }
  }

  close(): void {
    this.onmessage = null;
    this.onmessageerror = null;
  }
}

Object.defineProperty(window, 'BroadcastChannel', {
  value: MockBroadcastChannel,
  writable: true,
});

// Mock ServiceWorker
Object.defineProperty(navigator, 'serviceWorker', {
  value: {
    ready: Promise.resolve({
      showNotification: vi.fn(),
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  writable: true,
});

// Mock Notification
Object.defineProperty(window, 'Notification', {
  value: {
    permission: 'granted',
    requestPermission: vi.fn().mockResolvedValue('granted'),
  },
  writable: true,
});

// Mock crypto for UUID
Object.defineProperty(globalThis, 'crypto', {
  value: {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
    randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9),
  },
  writable: true,
});

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

Object.defineProperty(window, 'ResizeObserver', {
  value: MockResizeObserver,
  writable: true,
});

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
  writable: true,
});

// Mock document.visibilityState
Object.defineProperty(document, 'visibilityState', {
  value: 'visible',
  writable: true,
  configurable: true,
});

// Suppress console.error in tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render is no longer supported') ||
        args[0].includes('act(...)') ||
        args[0].includes('useLayoutEffect'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});