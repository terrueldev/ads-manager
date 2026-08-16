/**
 * @spec changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/google-ads-connection/SPEC.md
 * test_refresh_token_encryption_roundtrip
 */
import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptRefreshToken, decryptRefreshToken } from './token_crypto';

const testKey = (): string => randomBytes(32).toString('base64');

describe('token_crypto', () => {
  describe('test_refresh_token_encryption_roundtrip', () => {
    it('decrypts back to the original plaintext refresh token', () => {
      // Arrange
      const key = testKey();
      const plainRefreshToken = '1//0gExampleGoogleRefreshTokenValue';

      // Act
      const encrypted = encryptRefreshToken(key, plainRefreshToken);
      const decrypted = decryptRefreshToken(key, encrypted);

      // Assert
      expect(decrypted).toBe(plainRefreshToken);
    });

    it('never stores the refresh token in plain text', () => {
      const key = testKey();
      const plainRefreshToken = '1//0gExampleGoogleRefreshTokenValue';

      const encrypted = encryptRefreshToken(key, plainRefreshToken);

      expect(encrypted).not.toContain(plainRefreshToken);
    });

    it('produces different ciphertext on each call (random IV) but both decrypt correctly', () => {
      const key = testKey();
      const plainRefreshToken = 'same-token-value';

      const first = encryptRefreshToken(key, plainRefreshToken);
      const second = encryptRefreshToken(key, plainRefreshToken);

      expect(first).not.toBe(second);
      expect(decryptRefreshToken(key, first)).toBe(plainRefreshToken);
      expect(decryptRefreshToken(key, second)).toBe(plainRefreshToken);
    });

    it('fails to decrypt with the wrong key', () => {
      const encrypted = encryptRefreshToken(testKey(), 'a-refresh-token');

      expect(() => decryptRefreshToken(testKey(), encrypted)).toThrow();
    });

    it('rejects a key that is not exactly 32 bytes', () => {
      const shortKey = Buffer.from('too-short').toString('base64');

      expect(() => encryptRefreshToken(shortKey, 'plain')).toThrow(/32 bytes/);
    });
  });
});
