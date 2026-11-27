import { ApiError } from '../api/client';

/**
 * أنواع الأخطاء الموحدة
 */
export enum ErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  SESSION_REVOKED = 'SESSION_REVOKED',
  UNKNOWN = 'UNKNOWN',
}

/**
 * واجهة الخطأ الموحدة
 */
export interface AppError extends Error {
  code: ErrorCode;
  status?: number;
  detail?: string;
  originalError?: Error;
  context?: Record<string, unknown>;
}

/**
 * إنشاء خطأ موحد من ApiError
 */
export function createAppError(error: unknown, context?: Record<string, unknown>): AppError {
  // إذا كان خطأ ApiError بالفعل
  if (error instanceof ApiError) {
    return {
      name: 'ApiError',
      message: error.message,
      code: mapStatusToCode(error.status),
      status: error.status,
      detail: error.detail,
      originalError: error,
      context,
    };
  }

  // إذا كان خطأ عادي
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      code: ErrorCode.UNKNOWN,
      originalError: error,
      context,
    };
  }

  // أخطاء غير معروفة
  return {
    name: 'UnknownError',
    message: String(error) || 'حدث خطأ غير معروف',
    code: ErrorCode.UNKNOWN,
    context,
  };
}

/**
 * تحويل HTTP status code إلى ErrorCode
 */
function mapStatusToCode(status: number): ErrorCode {
  switch (status) {
    case 0:
      return ErrorCode.NETWORK_ERROR;
    case 401:
      return ErrorCode.UNAUTHORIZED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 400:
    case 422:
      return ErrorCode.VALIDATION_ERROR;
    case 408:
    case 504:
      return ErrorCode.TIMEOUT;
    case 500:
    case 502:
    case 503:
      return ErrorCode.SERVER_ERROR;
    default:
      return status >= 500 ? ErrorCode.SERVER_ERROR : ErrorCode.UNKNOWN;
  }
}

/**
 * تسجيل الخطأ في الكونسول مع تنسيق موحد
 */
export function logError(error: AppError, prefix = '[AppError]'): void {
  console.error(`${prefix} [${error.code}]`, {
    message: error.message,
    status: error.status,
    detail: error.detail,
    context: error.context,
    stack: error.originalError?.stack,
  });
}

/**
 * التحقق من كون الخطأ يتطلب إعادة تسجيل دخول
 */
export function isAuthError(error: AppError): boolean {
  return error.code === ErrorCode.UNAUTHORIZED || error.code === ErrorCode.SESSION_REVOKED;
}

/**
 * التحقق من كون خطأ شبكة
 */
export function isNetworkError(error: AppError): boolean {
  return error.code === ErrorCode.NETWORK_ERROR || error.code === ErrorCode.TIMEOUT;
}

/**
 * التحقق من كون خطأ خادم
 */
export function isServerError(error: AppError): boolean {
  return error.code === ErrorCode.SERVER_ERROR;
}

/**
 * الحصول على رسالة خطأ ودية للمستخدم
 */
export function getUserFriendlyMessage(error: AppError, t?: (key: string) => string): string {
  // إذا كان هناك دالة ترجمة
  if (t) {
    switch (error.code) {
      case ErrorCode.NETWORK_ERROR:
        return t('errors.network') || 'تعذر الاتصال بالخادم، تحقق من اتصالك بالإنترنت';
      case ErrorCode.TIMEOUT:
        return t('errors.timeout') || 'انتهت مهلة الاتصال، حاول مجدداً';
      case ErrorCode.UNAUTHORIZED:
        return t('errors.unauthorized') || 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً';
      case ErrorCode.FORBIDDEN:
        return t('errors.forbidden') || 'ليس لديك صلاحية لهذا الإجراء';
      case ErrorCode.NOT_FOUND:
        return t('errors.notFound') || 'المورد غير موجود';
      case ErrorCode.VALIDATION_ERROR:
        return error.detail || t('errors.validation') || 'بيانات غير صحيحة';
      case ErrorCode.SERVER_ERROR:
        return t('errors.server') || 'حدث خطأ في الخادم، حاول لاحقاً';
      case ErrorCode.SESSION_REVOKED:
        return t('errors.sessionRevoked') || 'تم تسجيل الدخول من جهاز آخر';
      default:
        return error.message;
    }
  }

  // رسائل افتراضية
  switch (error.code) {
    case ErrorCode.NETWORK_ERROR:
      return 'تعذر الاتصال بالخادم، تحقق من اتصالك بالإنترنت';
    case ErrorCode.TIMEOUT:
      return 'انتهت مهلة الاتصال، حاول مجدداً';
    case ErrorCode.UNAUTHORIZED:
      return 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً';
    case ErrorCode.FORBIDDEN:
      return 'ليس لديك صلاحية لهذا الإجراء';
    case ErrorCode.NOT_FOUND:
      return 'المورد غير موجود';
    case ErrorCode.VALIDATION_ERROR:
      return error.detail || 'بيانات غير صحيحة';
    case ErrorCode.SERVER_ERROR:
      return 'حدث خطأ في الخادم، حاول لاحقاً';
    case ErrorCode.SESSION_REVOKED:
      return 'تم تسجيل الدخول من جهاز آخر';
    default:
      return error.message;
  }
}

/**
 * Wrapper للـ API calls مع معالجة أخطاء موحدة
 */
export async function withErrorHandling<T>(
  promise: Promise<T>,
  context?: Record<string, unknown>
): Promise<{ data: T | null; error: AppError | null }> {
  try {
    const data = await promise;
    return { data, error: null };
  } catch (error) {
    const appError = createAppError(error, context);
    logError(appError);
    return { data: null, error: appError };
  }
}

/**
 * Retry logic مع exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: AppError) => boolean;
    onRetry?: (error: AppError, attempt: number) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    shouldRetry = (error) => isNetworkError(error) || isServerError(error),
    onRetry,
  } = options;

  let lastError: AppError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = createAppError(error);

      if (attempt === maxRetries || !shouldRetry(lastError)) {
        throw lastError;
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      if (onRetry) onRetry(lastError, attempt + 1);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

export default {
  createAppError,
  logError,
  isAuthError,
  isNetworkError,
  isServerError,
  getUserFriendlyMessage,
  withErrorHandling,
  withRetry,
  ErrorCode,
};