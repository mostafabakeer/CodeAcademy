/**
 * أنواع مشتركة بين صفحة الإدارة ومكوناتها.
 * وجودها هنا يمنع تكرار النوع بين الصفحة (مصدر الحقيقة) والمكونات.
 */

import type { GradeKey } from '../lib/grades';

/** يطابق استجابة GET /admin/password-resets. */
export interface PasswordRequest {
  id: number;
  userId: number;
  status: 'pending' | 'approved' | 'completed' | 'rejected';
  createdAt: number;
  updatedAt: number;
  fullName: string;
  phone: string;
}

/** حالات الطلب — نُصدّرها أيضاً للاستخدام في منطق العرض. */
export type PasswordRequestStatus = PasswordRequest['status'];

/**
 * الإدارة تحذف أي طلب في أي حالة (بما فيها pending و approved) حتى لا تتراكم
 * الأرقام في القائمة. لذلك لا يوجد حارس حالة على زر الحذف — القيد الوحيد
 * هو رسالة التأكيد.
 */

/** فلاتر قائمة الطلاب — تُستخدم في StudentsAdmin و StudentHeader. */
export type StudentFilter = 'all' | 'subscribed' | 'unsubscribed' | 'blocked';

/** فلاتر الصفوف — تُستخدم في StudentsAdmin و StudentHeader. */
export type GradeFilter = 'all' | GradeKey;

/** الحد الأدنى من بيانات المستخدم الذي يحتاجه شارة الحالة. */
export interface BadgeUser {
  blocked: boolean;
  subscription: boolean;
}