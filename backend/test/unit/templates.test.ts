import { passwordResetEmail, verificationEmail } from '../../src/email/templates';

describe('email templates', () => {
  it('embeds the token in the verification link', () => {
    const { html, subject } = verificationEmail('http://localhost:3000', 'abc123');
    expect(subject).toContain('Verify');
    expect(html).toContain('http://localhost:3000/verify-email?token=abc123');
  });

  it('embeds the token in the reset link', () => {
    const { html } = passwordResetEmail('http://localhost:3000', 'xyz789');
    expect(html).toContain('http://localhost:3000/reset-password?token=xyz789');
  });
});
