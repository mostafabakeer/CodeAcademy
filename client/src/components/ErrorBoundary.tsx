import { Component, type ErrorInfo, type ReactNode, useState, useCallback } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  error: Error | null;
  errorId: number;
}

/**
 * حدود أخطاء محسنة — مع retry logic، error reporting، و fallback مخصص
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorId: 0 };

  static getDerivedStateFromError(error: Error): State {
    return { error, errorId: Date.now() };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info.componentStack);
    this.props.onError?.(error, info);
    // يمكن إضافة error reporting service هنا (Sentry, LogRocket, etc.)
  }

  private resetError = (): void => {
    this.setState({ error: null, errorId: this.state.errorId + 1 });
  };

  private reload = (): void => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    // Fallback مخصص إذا تم تمريره
    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 bg-ink-950/80 px-6 text-center rounded-2xl border border-fire-500/20">
        <div className="text-5xl animate-bounce">⚠️</div>
        <h1 className="text-xl font-black text-fire-300">حدث خطأ</h1>
        <p className="max-w-md text-sm text-gray-400">
          {this.state.error.message || 'نعتذر، حدث خطأ غير متوقع'}
        </p>
        <div className="flex gap-3">
          <button 
            onClick={this.resetError} 
            className="btn-fire-rounded inline-flex items-center gap-2 rounded-full px-4 py-2 font-bold fire-shadow"
          >
            ↻ محاولة أخرى
          </button>
          <button 
            onClick={this.reload} 
            className="btn-ghost-fire inline-flex items-center gap-2 rounded-full px-4 py-2 font-bold"
          >
            🔄 إعادة تحميل كاملة
          </button>
        </div>
        <details className="text-xs text-gray-500 mt-2 text-start max-w-md">
          <summary className="cursor-pointer">تفاصيل تقنية</summary>
          <pre className="mt-2 p-2 bg-ink-900 rounded text-start overflow-auto">{this.state.error.stack}</pre>
        </details>
      </div>
    );
  }
}

/**
 * Hook للاستخدام في function components
 */
export function useErrorHandler() {
  const [error, setError] = useState<Error | null>(null);

  const handleError = useCallback((err: Error) => {
    setError(err);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return { error, handleError, clearError };
}

export default ErrorBoundary;