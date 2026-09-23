import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * حدود أخطاء للصفحة الحالية فقط — تحبس أي خطأ تصيير/تحميل داخل الصفحة
 * بدلاً من إسقاط الموقع كاملاً عبر الحدود العامة.
 */
export default class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('PageErrorBoundary caught:', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-3xl border border-fire-500/25 bg-ink-950/70 px-6 py-14 text-center">
        <div className="text-4xl">🤖</div>
        <h2 className="text-xl font-black">حدث خطأ أثناء عرض الصفحة</h2>
        <p className="max-w-md text-sm text-gray-400">{this.state.error.message || 'خطأ غير متوقع في هذه الصفحة'}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <button onClick={this.reset} className="btn-fire rounded-xl px-5 py-2.5 text-sm font-bold text-white">
            ⟳ إعادة المحاولة
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl border border-white/20 px-5 py-2.5 text-sm font-bold text-gray-300 transition-colors hover:border-white/40 hover:text-white"
          >
            تحديث الصفحة
          </button>
        </div>
      </div>
    );
  }
}