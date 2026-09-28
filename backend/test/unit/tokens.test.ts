import {
  generateOpaqueToken,
  hashToken,
  refreshTokenExpiry,
  signAccessToken,
  verifyAccessToken,
} from '../../src/auth/tokens';

describe('access tokens', () => {
  it('signs and verifies a token round-trip', () => {
    const token = signAccessToken('user-123');
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('user-123');
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken('user-123');
    expect(() => verifyAccessToken(`${token}x`)).toThrow();
  });
});

describe('opaque tokens', () => {
  it('generates a distinct token each call', () => {
    expect(generateOpaqueToken()).not.toEqual(generateOpaqueToken());
  });

  it('hashes deterministically', () => {
    const token = generateOpaqueToken();
    expect(hashToken(token)).toEqual(hashToken(token));
  });

  it('computes a refresh expiry in the future', () => {
    expect(refreshTokenExpiry().getTime()).toBeGreaterThan(Date.now());
  });
});
