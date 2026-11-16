import { getLocal, setLocal } from './storage';
import { clearAllFiles } from './localFileSystem';
import { clearAllDrafts, clearAllVideoProgress, clearExamReviews, clearOfflineQueue } from './localStore';
import { forgetPushEndpoint } from './pushNotifications';

/**
 * مالك البيانات المحلية على هذا الجهاز.
 *
 * الملفات المحلية (IndexedDB) وتقدّم المشاهدة والمسودات كانت غير مرتبطة
 * بأي حساب، فطالب يدخل بعد طالب آخر على نفس الموبايل كان يرى تقدّم الأول
 * وترفع مزامنة الأكواد ملفات الأول إلى حساب الثاني. نخزّن هنا آخر مستخدم
 * امتلك الجهاز، ونمسح البيانات فقط عندما يدخل مستخدم **مختلف** — فيبقى
 * عمل المستخدم نفسه (حتى قبل أول تسجيل دخول) محفوظاً عند عودته.
 */
const OWNER_KEY = 'localOwnerId';

export function getLocalOwnerId(): number | null {
  const raw = getLocal(OWNER_KEY);
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** يربط البيانات المحلية بالمستخدم الحالي. يعيد true إذا مُسحت بيانات مستخدم آخر. */
export async function claimLocalData(userId: number): Promise<boolean> {
  const owner = getLocalOwnerId();
  if (owner === userId) return false;

  const differentUser = owner !== null && owner !== userId;
  if (differentUser) {
    await clearAllFiles();
    clearAllVideoProgress();
    clearAllDrafts();
    clearExamReviews();
    clearOfflineQueue();
    // اشتراك الإشعارات يخص الحساب السابق؛ يجب أن يُعاد تسجيله للحساب الجديد.
    forgetPushEndpoint();
  }

  setLocal(OWNER_KEY, String(userId));
  return differentUser;
}
