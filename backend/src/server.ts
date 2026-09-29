import 'express-async-errors';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './env';
import type { EmailSender } from './email/sender';
import { ResendEmailSender } from './email/resendSender';
import { createAuthRouter } from './routes/auth';
import { createTasksRouter } from './routes/tasks';

export function createServer(emailSender: EmailSender = new ResendEmailSender()) {
  const app = express();

  // Managed hosts (Render/Fly/Railway) put the app behind a reverse proxy, so
  // req.ip would otherwise resolve to the proxy's address instead of the real
  // client, breaking per-IP rate limiting. Trust a single hop when enabled.
  app.set('trust proxy', env.TRUST_PROXY === 'true' ? 1 : false);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS.split(',')
        .map(o => o.trim())
        .filter(Boolean),
    }),
  );
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/auth', createAuthRouter(emailSender));
  app.use('/tasks', createTasksRouter());

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(
    (
      err: Record<string, unknown>,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      // Log only the safe, diagnostic-relevant fields. Never log `err` itself
      // (or e.g. body-parser's `.body` property on parse errors) since it can
      // carry raw request body content such as a plaintext login password.
      console.error('Unhandled error:', {
        name: err?.name,
        message: err?.message,
        stack: err?.stack,
      });

      const rawStatus = err?.status ?? err?.statusCode;
      const status = typeof rawStatus === 'number' ? rawStatus : 500;

      if (status >= 400 && status < 500) {
        res.status(status).json({ error: 'Invalid request' });
        return;
      }

      res.status(500).json({ error: 'Internal server error' });
    },
  );

  return app;
}

if (require.main === module) {
  const app = createServer();
  app.listen(env.PORT, () => {
    console.log(`Backend listening on port ${env.PORT}`);
  });
}
