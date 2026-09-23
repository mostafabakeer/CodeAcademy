import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * حدود أخطاء عامة — تعرض رسالة ودية مع زر إعادة تحميل بدلاً من شاشة بيضاء
 * عند فشل أي جزء من الواجهة أثناء التصيير.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  private reload = (): void => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-950 px-6 text-center">
        <div className="text-5xl">⚠️</div>
        <h1 className="text-2xl font-black">حصل خطأ غير متوقع</h1>
        <p className="max-w-md text-sm text-gray-400">نعتذر عن ذلك. أعد تحميل الصفحة، أو جرّب العودة مرة أخرى.</p>
        <button onClick={this.reload} className="btn-fire rounded-xl px-6 py-3 font-bold text-white">
          إعادة تحميل
        </button>
      </div>
    );
  }
}