import pino from 'pino';

export type LogContext = {
  vendorId?: string;
  userId?: string;
  requestId?: string;
  [key: string]: unknown;
};

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

class Logger {
  private logger: pino.Logger;

  constructor() {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const logLevel = (process.env.LOG_LEVEL as LogLevel) || (isDevelopment ? 'debug' : 'info');

    this.logger = pino({
      level: logLevel,
      transport: isDevelopment
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname'
            }
          }
        : undefined,
      formatters: {
        level: (label) => {
          return { level: label.toUpperCase() };
        }
      },
      timestamp: pino.stdTimeFunctions.isoTime
    });
  }

  private addContext(context?: LogContext): Record<string, unknown> {
    const baseContext: Record<string, unknown> = {};
    
    if (context?.vendorId) {
      baseContext.vendor_id = context.vendorId;
    }
    if (context?.userId) {
      baseContext.user_id = context.userId;
    }
    if (context?.requestId) {
      baseContext.request_id = context.requestId;
    }

    // Add any additional context fields
    if (context) {
      Object.keys(context).forEach((key) => {
        if (key !== 'vendorId' && key !== 'userId' && key !== 'requestId') {
          baseContext[key] = context[key];
        }
      });
    }

    return baseContext;
  }

  trace(message: string, context?: LogContext): void {
    this.logger.trace(this.addContext(context), message);
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(this.addContext(context), message);
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(this.addContext(context), message);
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(this.addContext(context), message);
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext = this.addContext(context);
    
    if (error instanceof Error) {
      errorContext.error = {
        message: error.message,
        stack: error.stack,
        name: error.name
      };
    } else if (error) {
      errorContext.error = error;
    }

    this.logger.error(errorContext, message);
  }

  fatal(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext = this.addContext(context);
    
    if (error instanceof Error) {
      errorContext.error = {
        message: error.message,
        stack: error.stack,
        name: error.name
      };
    } else if (error) {
      errorContext.error = error;
    }

    this.logger.fatal(errorContext, message);
  }

  child(context: LogContext): Logger {
    const childLogger = new Logger();
    childLogger.logger = this.logger.child(this.addContext(context));
    return childLogger;
  }
}

// Singleton instance
let loggerInstance: Logger | null = null;

/**
 * Gets the global logger instance.
 * Creates a new instance if one doesn't exist.
 */
export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger();
  }
  return loggerInstance;
}

/**
 * Creates a child logger with additional context.
 * Useful for request-scoped logging.
 */
export function createLogger(context: LogContext): Logger {
  return getLogger().child(context);
}

// Export default logger for convenience
export const logger = getLogger();

