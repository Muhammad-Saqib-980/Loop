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
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error(err);
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
