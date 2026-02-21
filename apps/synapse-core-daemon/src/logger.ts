import pino from 'pino';

/**
 * Pino logger with microsecond-precision timestamps for latency profiling.
 */
export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  timestamp: () => `,"time":${process.hrtime.bigint().toString()}`,
  transport:
    process.env['NODE_ENV'] === 'development'
      ? { target: 'pino-pretty' }
      : undefined,
});
