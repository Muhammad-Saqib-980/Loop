import { Router } from 'express';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../auth/password';
import {
  generateOpaqueToken,
  hashToken,
  refreshTokenExpiry,
  signAccessToken,
} from '../auth/tokens';
import type { EmailSender } from '../email/sender';
import { verificationEmail } from '../email/templates';
import { env } from '../env';
import {
  createEmailVerificationToken,
  createRefreshToken,
  findRefreshTokenByHash,
  findValidEmailVerificationToken,
  markEmailVerificationTokenUsed,
  revokeAllRefreshTokensForUser,
  revokeRefreshToken,
} from '../db/tokens';
import { createUser, findUserByEmail, markEmailVerified } from '../db/users';
import { authRateLimiter } from '../middleware/rateLimit';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const GENERIC_REGISTER_MESSAGE = {
  message: 'If this email can be registered, check your inbox for a verification link.',
};

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

async function sendVerificationEmail(
  emailSender: EmailSender,
  userId: string,
  email: string,
): Promise<void> {
  const token = generateOpaqueToken();
  await createEmailVerificationToken(
    userId,
    hashToken(token),
    new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
  );
  const { subject, html } = verificationEmail(env.APP_BASE_URL, token);
  await emailSender.send(email, subject, html);
}

export function createAuthRouter(emailSender: EmailSender): Router {
  const router = Router();

  router.post('/register', authRateLimiter, async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid email or password' });
      return;
    }
    const { email, password } = parsed.data;

    const existing = await findUserByEmail(email);
    if (existing) {
      res.status(200).json(GENERIC_REGISTER_MESSAGE);
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser(email, passwordHash);
    await sendVerificationEmail(emailSender, user.id, user.email);

    res.status(200).json(GENERIC_REGISTER_MESSAGE);
  });

  router.post('/verify-email', async (req, res) => {
    const parsed = z.object({ token: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid token' });
      return;
    }
    const record = await findValidEmailVerificationToken(hashToken(parsed.data.token));
    if (!record) {
      res.status(400).json({ error: 'Invalid or expired token' });
      return;
    }
    await markEmailVerified(record.userId);
    await markEmailVerificationTokenUsed(record.id);
    res.status(200).json({ message: 'Email verified' });
  });

  router.post('/resend-verification', authRateLimiter, async (req, res) => {
    const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid email' });
      return;
    }
    const user = await findUserByEmail(parsed.data.email);
    if (user && !user.emailVerified) {
      await sendVerificationEmail(emailSender, user.id, user.email);
    }
    res.status(200).json({
      message: 'If this account exists and is unverified, a new link has been sent.',
    });
  });

  router.post('/login', authRateLimiter, async (req, res) => {
    const parsed = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid email or password' });
      return;
    }
    const { email, password } = parsed.data;
    const user = await findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    if (!user.emailVerified) {
      res.status(403).json({ error: 'Email not verified', code: 'EMAIL_NOT_VERIFIED' });
      return;
    }

    const accessToken = signAccessToken(user.id);
    const refreshToken = generateOpaqueToken();
    await createRefreshToken(user.id, hashToken(refreshToken), refreshTokenExpiry());

    res.status(200).json({ accessToken, refreshToken });
  });

  router.post('/refresh', async (req, res) => {
    const parsed = z.object({ refreshToken: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid refresh token' });
      return;
    }
    const record = await findRefreshTokenByHash(hashToken(parsed.data.refreshToken));
    if (!record || record.expiresAt.getTime() < Date.now()) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }
    if (record.revokedAt) {
      await revokeAllRefreshTokensForUser(record.userId);
      res.status(401).json({ error: 'Refresh token has been revoked' });
      return;
    }

    const newRefreshToken = generateOpaqueToken();
    const newTokenId = await createRefreshToken(
      record.userId,
      hashToken(newRefreshToken),
      refreshTokenExpiry(),
    );
    await revokeRefreshToken(record.id, newTokenId);

    const accessToken = signAccessToken(record.userId);
    res.status(200).json({ accessToken, refreshToken: newRefreshToken });
  });

  router.post('/logout', async (req, res) => {
    const parsed = z.object({ refreshToken: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid refresh token' });
      return;
    }
    const record = await findRefreshTokenByHash(hashToken(parsed.data.refreshToken));
    if (record && !record.revokedAt) {
      await revokeRefreshToken(record.id);
    }
    res.status(200).json({ message: 'Logged out' });
  });

  return router;
}
