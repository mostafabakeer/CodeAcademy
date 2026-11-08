import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface UploadNotification {
  type: 'pdf' | 'image' | 'video';
  fileName: string;
  fileSize: number;
  url?: string;
  path?: string;
  success: boolean;
  error?: string;
  grade?: string;
  courseId?: number;
  noteId?: number;
  timestamp: number;
}

const gradeLabels: Record<string, string> = {
  bac1: 'البكالوريا 1',
  bac2: 'البكالوريا 2',
  all: 'جميع المراحل',
};

export default function UploadNotifications() {
  const [notifications, setNotifications] = useState<UploadNotification[]>([]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel('upload-notifications');
    channel.onmessage = (event) => {
      const data: UploadNotification = event.data;
      if (data) {
        setNotifications((prev) => [...prev, data]);
        // إخفاء الإشعار بعد 5 ثوانٍ
        setTimeout(() => {
          setNotifications((prev) => prev.filter((n) => n.timestamp !== data.timestamp));
        }, 5000);
      }
    };

    return () => {
      channel.close();
    };
  }, []);

  if (notifications.length === 0) return null;

  return (
    <AnimatePresence>
      {notifications.map((n) => (
        <motion.div
          key={n.timestamp}
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className={`fixed top-4 right-4 z-50 max-w-sm rounded-2xl border p-4 shadow-2xl ${
            n.success
              ? 'border-emerald-500/40 bg-emerald-950/80'
              : 'border-fire-500/40 bg-fire-950/80'
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`flex-shrink-0 rounded-full p-2 ${
                n.success ? 'bg-emerald-500/20' : 'bg-fire-500/20'
              }`}
            >
              {n.success ? (
                <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-fire-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-100">
                {n.success ? 'تم رفع الملف بنجاح' : 'فشل رفع الملف'}
              </p>
              <p className="mt-1 text-xs text-gray-400 truncate">{n.fileName}</p>
              {n.grade && (
                <p className="mt-1 text-xs text-ember-400">
                  الصف: {gradeLabels[n.grade] || n.grade}
                </p>
              )}
              {n.courseId && (
                <p className="mt-1 text-xs text-gray-500">كورس: #{n.courseId}</p>
              )}
              {!n.success && n.error && (
                <p className="mt-1 text-xs text-fire-300">{n.error}</p>
              )}
            </div>
            <button
              onClick={() => {
                setNotifications((prev) => prev.filter((item) => item.timestamp !== n.timestamp));
              }}
              className="flex-shrink-0 text-gray-500 hover:text-gray-200"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mt-2 h-0.5 bg-fire-500/30 overflow-hidden">
            <motion.div
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: 5, ease: 'linear' }}
              className={`h-full ${
                n.success ? 'bg-emerald-400' : 'bg-fire-400'
              }`}
            />
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}