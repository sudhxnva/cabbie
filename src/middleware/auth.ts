import { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';

dotenv.config();

// Get API keys from environment (comma-separated)
const getApiKeys = (): string[] => {
  const keys = process.env.API_KEYS;
  if (!keys) return [];
  return keys.split(',').map(k => k.trim()).filter(Boolean);
};

const API_KEYS = getApiKeys();

/**
 * Authentication middleware
 * Checks for valid API key in X-API-Key header
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth if no API keys are configured
  if (API_KEYS.length === 0) {
    return next();
  }

  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (!apiKey) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing X-API-Key header',
    });
    return;
  }

  if (!API_KEYS.includes(apiKey)) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key',
    });
    return;
  }

  next();
}
