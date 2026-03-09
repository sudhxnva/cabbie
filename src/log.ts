import pino from 'pino';
import dotenv from 'dotenv';

dotenv.config();

// Configure pino based on environment
const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isProduction
    ? undefined // JSON in production
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
});

// Create a child logger with common attributes
export const createLogger = (component: string) => {
  return logger.child({ component });
};

// Simple timestamp function for inline logs
export function ts(): string {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}
