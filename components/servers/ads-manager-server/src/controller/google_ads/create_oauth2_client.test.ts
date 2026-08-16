/**
 * @spec changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/google-ads-connection/SPEC.md
 * test_oauth_code_exchange_success
 * test_oauth_code_exchange_failure_does_not_persist_account
 *
 * These tests exercise the real google-auth-library integration boundary, with the library
 * itself mocked (no real network calls) — complementing handle_oauth_callback.test.ts, which
 * tests the same scenarios one layer up using a fake `exchangeOAuthCode` dependency.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getTokenMock = vi.fn();
const generateAuthUrlMock = vi.fn();

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    getToken: getTokenMock,
    generateAuthUrl: generateAuthUrlMock,
  })),
}));

import { createOAuth2ClientAdapter, GOOGLE_ADS_OAUTH_SCOPE } from './create_oauth2_client';

const CONFIG = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'http://localhost:3000/api/v1/oauth/google-ads/callback',
};

describe('createOAuth2ClientAdapter', () => {
  beforeEach(() => {
    getTokenMock.mockReset();
    generateAuthUrlMock.mockReset();
  });

  describe('test_oauth_code_exchange_success', () => {
    it('returns access + refresh token on a successful exchange', async () => {
      getTokenMock.mockResolvedValue({
        tokens: {
          access_token: 'access-123',
          refresh_token: 'refresh-456',
          scope: GOOGLE_ADS_OAUTH_SCOPE,
        },
      });
      const adapter = createOAuth2ClientAdapter(CONFIG);

      const result = await adapter.exchangeCode('valid-auth-code');

      expect(getTokenMock).toHaveBeenCalledWith('valid-auth-code');
      expect(result).toEqual({
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        scope: GOOGLE_ADS_OAUTH_SCOPE,
      });
    });

    it('builds an authorization URL requesting offline access and the Google Ads scope', () => {
      generateAuthUrlMock.mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?state=xyz');
      const adapter = createOAuth2ClientAdapter(CONFIG);

      const url = adapter.buildAuthorizationUrl('xyz');

      expect(generateAuthUrlMock).toHaveBeenCalledWith(
        expect.objectContaining({
          access_type: 'offline',
          scope: [GOOGLE_ADS_OAUTH_SCOPE],
          state: 'xyz',
        })
      );
      expect(url).toBe('https://accounts.google.com/o/oauth2/v2/auth?state=xyz');
    });
  });

  describe('test_oauth_code_exchange_failure_does_not_persist_account', () => {
    it('propagates a rejection when Google rejects the code (e.g. invalid_grant)', async () => {
      getTokenMock.mockRejectedValue(new Error('invalid_grant'));
      const adapter = createOAuth2ClientAdapter(CONFIG);

      await expect(adapter.exchangeCode('already-used-code')).rejects.toThrow('invalid_grant');
    });

    it('throws when Google returns a response missing refresh_token (nothing to persist)', async () => {
      getTokenMock.mockResolvedValue({
        tokens: { access_token: 'access-only', refresh_token: undefined },
      });
      const adapter = createOAuth2ClientAdapter(CONFIG);

      await expect(adapter.exchangeCode('code-without-offline-consent')).rejects.toThrow(
        /access_token and refresh_token/
      );
    });
  });
});
