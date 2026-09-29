import rateLimit from 'express-rate-limit';

export function createAuthRateLimiter(limit: number, windowMs: number) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });
}
