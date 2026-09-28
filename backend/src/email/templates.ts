export function verificationEmail(
  appBaseUrl: string,
  token: string,
): { subject: string; html: string } {
  const link = `${appBaseUrl}/verify-email?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Verify your email',
    html: `<p>Welcome! Click the link below to verify your email address.</p><p><a href="${link}">${link}</a></p><p>This link expires in 24 hours.</p>`,
  };
}

export function passwordResetEmail(
  appBaseUrl: string,
  token: string,
): { subject: string; html: string } {
  const link = `${appBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Reset your password',
    html: `<p>We received a request to reset your password. Click the link below to choose a new one.</p><p><a href="${link}">${link}</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
  };
}
