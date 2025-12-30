// Separate export file for logger to avoid pulling in Square SDK
// This can be safely imported in Edge Runtime (middleware)
export { getLogger, createLogger, logger } from './logger';
export type { LogContext, LogLevel } from './logger';

