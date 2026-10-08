import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  // Email is optional: leave RESEND_API_KEY / EMAIL_FROM unset to run without
  // an email provider (requires REQUIRE_EMAIL_VERIFICATION=false).
  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default(''),
  REQUIRE_EMAIL_VERIFICATION: z.enum(['true', 'false']).default('true'),
  APP_BASE_URL: z.string().min(1),
  CORS_ORIGINS: z.string().default(''),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.string().default('development'),
  TRUST_PROXY: z.string().default('false'),
});

export const env = schema.parse(process.env);

export const emailEnabled = env.RESEND_API_KEY !== '' && env.EMAIL_FROM !== '';
export const emailVerificationRequired = env.REQUIRE_EMAIL_VERIFICATION === 'true';
