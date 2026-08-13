import pino from 'pino';

/**
 * سجلات منظمة عبر pino.
 * في الإنتاج: JSON خام (أسهل للجمع في Render/Koyeb).
 * في التطوير: pino-pretty للقراءة البشرية.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss' } },
});
