/* =================== Content Synchronization ===================

مكتبة المزامنة الكاملة للمحتوى تدعم استراتيجيتين:
1. Polling (الافتراضي): استطلاع كل 20 ثانية عند ظهور التبويب
2. Realtime: اشتراك في Supabase Realtime (باستخدام VITE_SUPABASE_ANON_KEY)
*/
import { useEffect, useState, useRef, useCallback } from 'react';

const DEFAULT_POLLING_INTERVAL = 20_000; // 20 ثانية

export type ContentSyncStrategy = 'polling' | 'realtime' | 'off';

/**
 * يكتشف استراتيجية المزامنة بناءً على متغيرات البيئة.
 * يمكن استخدامه مباشرة في الاختبارات دون استدعاء хуки React.
 */
export function detectStrategy(): ContentSyncStrategy {
  if (typeof window !== 'undefined') {
    const viteEnv = (window as any).VITE_CONTENT_SYNC;
    if (viteEnv === 'off') return 'off';
    if (viteEnv === 'realtime') return 'realtime';
  }
  if (typeof window !== 'undefined' && (window as any).VITE_SUPABASE_ANON_KEY) {
    return 'realtime';
  }
  return 'polling';
}

/**
 * يبث تغيير محتوى عبر BroadcastChannel للتبويبات الأخرى.
 * يمكن استخدامه مباشرة في الاختبارات دون استدعاء хуки React.
 */
export function signalContentChange(entity: string): void {
  try {
    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      const channel = new BroadcastChannel('dr-content-sync');
      channel.postMessage({ entity });
      channel.close();
    }
  } catch (e) {
    // ignore
  }
}

export interface ContentSyncOptions {
  strategy?: ContentSyncStrategy;
  onChange?: (entity: string) => void;
  pollingInterval?: number;
}

export interface ContentSyncState {
  strategy: ContentSyncStrategy;
  isConnected: boolean;
  lastSyncAt: number | null;
  lastKnownVersion: number | null;
  error?: string | null;
}

export function initiateContentSync(
  options: ContentSyncOptions = {}
): {
  state: ContentSyncState;
  refresh: () => Promise<void>;
  forceRefresh: () => void;
  destroy: () => void;
  addListener: (listener: (entity: string) => void) => () => void;
  setStrategy: (strategy: ContentSyncStrategy) => void;
} {
  const {
    strategy = detectStrategy(),
    pollingInterval = DEFAULT_POLLING_INTERVAL,
  } = options;

  const [state, setState] = useState<ContentSyncState>(() => ({
    strategy,
    isConnected: false,
    lastSyncAt: null,
    lastKnownVersion: null,
    error: undefined,
  }));

  const abortCtrl = useRef<AbortController | null>(null);
  const pollTimeout = useRef<number | null>(null);
  const realtimeChannel = useRef<any>(null);
  const listenersRef = useRef<Set<(entity: string) => void>>(new Set());

  // pollContent function
  const pollContent = useCallback(async (): Promise<void> => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      pollTimeout.current = window.setTimeout(pollContent, pollingInterval);
      return;
    }

    try {
      // dynamic import to avoid circular dependency
      const apiModule = await import('../api/client');
      const apiClient = apiModule.api;
      const versionResp = await apiClient<{ version: number }>('/api/content-version', {
        signal: abortCtrl.current?.signal,
      });

      if (versionResp?.version !== state.lastKnownVersion) {
        setState((s) => ({
          ...s,
          lastSyncAt: Date.now(),
          lastKnownVersion: versionResp.version,
        }));
        listenersRef.current.forEach((listener) => {
          try {
            listener('content');
          } catch (e) {}
        });
      }
    } catch (err) {
      // ignore poll errors
    } finally {
      if (abortCtrl.current?.signal && !abortCtrl.current.signal.aborted) {
        pollTimeout.current = window.setTimeout(pollContent, pollingInterval);
      }
    }
  }, [pollingInterval, state.lastKnownVersion]);

  // startPolling function
  const startPolling = useCallback((): void => {
    if (pollTimeout.current !== null) {
      clearTimeout(pollTimeout.current);
      pollTimeout.current = null;
    }
    pollContent();
  }, [pollContent]);

  // stopPolling function
  const stopPolling = useCallback((): void => {
    if (pollTimeout.current !== null) {
      clearTimeout(pollTimeout.current);
      pollTimeout.current = null;
    }
  }, []);

  // connectRealtime
  const connectRealtime = useCallback((): void => {
    if (typeof window === 'undefined') return;
    if (state.strategy !== 'realtime') return;

    try {
      const supabase: any = (window as any).supabase?.createClient
        ? (window as any).supabase.createClient(
            (window as any).SUPABASE_URL || '',
            (window as any).VITE_SUPABASE_ANON_KEY || ''
          )
        : null;

      if (!supabase) {
        setState((s) => ({ ...s, isConnected: false, error: 'Supabase client not available' }));
        startPolling();
        return;
      }

      realtimeChannel.current = supabase
        .channel('content')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'content_events',
          },
          (payload: any) => {
            handleContentChange(payload, listenersRef);
          }
        )
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            setState((s) => ({ ...s, isConnected: true, error: undefined }));
          } else {
            setState((s) => ({ ...s, isConnected: false, error: 'Realtime failed' }));
            startPolling();
          }
        });
    } catch (err) {
      console.error('[contentSync] Realtime error:', err);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setState((s) => ({ ...s, isConnected: false, error: msg }));
      startPolling();
    }
  }, [state.strategy, startPolling]);

  function handleContentChange(
    payload: any,
    listenersRef: React.MutableRefObject<Set<(entity: string) => void>>
  ): void {
    try {
      const { kind, entity, entity_id } = payload.new || {};
      if (!entity || entity_id === null) return;

      listenersRef.current.forEach((listener) => {
        try {
          listener(entity);
        } catch (e) {
          // ignore
        }
      });
    } catch (err) {
      console.error('[contentSync] handleContentChange error:', err);
    }
  }

  // setStrategy function
  const setStrategy = useCallback(
    (newStrategy: ContentSyncStrategy): void => {
      setState({ strategy: newStrategy, isConnected: false, lastSyncAt: null, lastKnownVersion: null, error: undefined });

      if (newStrategy === 'realtime') {
        connectRealtime();
      } else if (newStrategy === 'polling') {
        startPolling();
      } else {
        stopPolling();
        if (realtimeChannel.current) {
          try { realtimeChannel.current.unsubscribe(); } catch (e) {}
          realtimeChannel.current = null;
        }
      }
    },
    [connectRealtime, startPolling, stopPolling]
  );

  // refresh function
  const refresh = useCallback(async (): Promise<void> => {
    await pollContent();
  }, [pollContent]);

  // forceRefresh function
  const forceRefresh = useCallback((): void => {
    // Trigger manual refresh
  }, []);

  // Initialize
  useEffect(() => {
    if (strategy === 'realtime') {
      connectRealtime();
    } else if (strategy === 'polling') {
      startPolling();
    }
    // 'off': لا تفعل شيئاً

    return () => {
      stopPolling();
      if (realtimeChannel.current) {
        try { realtimeChannel.current.unsubscribe(); } catch (e) {}
        realtimeChannel.current = null;
      }
      listenersRef.current.clear();
    };
  }, [strategy, pollingInterval, connectRealtime, startPolling, stopPolling]);

  // Return public API
  return {
    state,
    refresh,
    forceRefresh,
    destroy: () => {
      stopPolling();
      if (realtimeChannel.current) {
        try { realtimeChannel.current.unsubscribe(); } catch (e) {}
        realtimeChannel.current = null;
      }
      listenersRef.current.clear();
    },
    addListener: (listener: (entity: string) => void) => {
      listenersRef.current.add(listener);
      return () => listenersRef.current.delete(listener);
    },
    setStrategy,
  };
}