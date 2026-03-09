import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

// Get rate limit configuration from environment
const getRateLimitOptions = () => {
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
  const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);

  return {
    windowMs,
    max: maxRequests,
    message: {
      error: 'Too Many Requests',
      message: 'Too many requests from this IP, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
  };
};

export const rateLimiter = rateLimit(getRateLimitOptions());

// Additional stricter limiter for booking endpoints
export const bookingRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute for booking endpoints
  message: {
    error: 'Too Many Requests',
    message: 'Too many booking requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
