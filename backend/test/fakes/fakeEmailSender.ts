import type { EmailSender } from '../../src/email/sender';

export class FakeEmailSender implements EmailSender {
  public sent: { to: string; subject: string; html: string }[] = [];

  async send(to: string, subject: string, html: string): Promise<void> {
    this.sent.push({ to, subject, html });
  }
}
