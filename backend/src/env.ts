import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
  APP_BASE_URL: z.string().min(1),
  CORS_ORIGINS: z.string().default(''),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.string().default('development'),
  TRUST_PROXY: z.string().default('false'),
});

export const env = schema.parse(process.env);
