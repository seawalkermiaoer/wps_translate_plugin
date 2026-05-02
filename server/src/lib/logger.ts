import pino from 'pino';
import { AsyncLocalStorage } from 'async_hooks';

export const asyncLocalStorage = new AsyncLocalStorage<string>();
const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  base: {
    service: process.env.SERVICE_NAME ?? 'wps-translate-server',
    env: process.env.NODE_ENV ?? 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin() {
    const reqId = asyncLocalStorage.getStore();
    return reqId ? { requestId: reqId } : {};
  },
  redact: {
    paths: [
      'password', 'token', 'authorization',
      '*.password', '*.token',
      'req.headers.authorization', 'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});
