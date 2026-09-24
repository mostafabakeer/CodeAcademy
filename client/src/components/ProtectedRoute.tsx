import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useSession } from '../store/authStore';
import ReconnectScreen from './ReconnectScreen';

export default function ProtectedRoute({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, loading, offline } = useSession();
  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="relative h-14 w-14">
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-fire-500/25 border-t-fire-500" />
          <div className="absolute inset-0 m-auto h-7 w-7 animate-flame rounded-full bg-gradient-to-br from-fire-500 to-ember-500" />
        </div>
        <p className="text-sm text-gray-400">DR Code</p>
      </div>
    );
  }
  // فشل مؤقت (شبكة/خادم) — لا نُظهر "تسجيل خروج" بل شاشة إعادة محاولة نقية.
  if (!user && offline) return <ReconnectScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}
