process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://todo:todo@localhost:5432/todo_test';
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
process.env.ACCESS_TOKEN_TTL = '15m';
process.env.REFRESH_TOKEN_TTL_DAYS = '30';
process.env.RESEND_API_KEY = 'test-resend-key';
process.env.EMAIL_FROM = 'Loop <test@example.com>';
process.env.APP_BASE_URL = 'http://localhost:3000';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.PORT = '4000';
process.env.NODE_ENV = 'test';
