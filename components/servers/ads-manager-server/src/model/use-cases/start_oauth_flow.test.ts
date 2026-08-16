/**
 * @spec changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/google-ads-connection/SPEC.md
 * @issue N/A
 */
import { describe, it, expect, vi } from 'vitest';
import { startOAuthFlow } from './start_oauth_flow';
import { createMockDependencies } from './test_helpers/mock_dependencies';

describe('startOAuthFlow', () => {
  describe('AC: FR1 - inicia fluxo OAuth', () => {
    it('generates a state, saves it, and returns the Google authorization URL', () => {
      const saveOAuthState = vi.fn();
      const buildAuthorizationUrl = vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?state=abc');
      const deps = createMockDependencies({
        generateOAuthState: () => 'abc',
        saveOAuthState,
        buildAuthorizationUrl,
      });

      const result = startOAuthFlow(deps);

      expect(saveOAuthState).toHaveBeenCalledWith('abc');
      expect(buildAuthorizationUrl).toHaveBeenCalledWith('abc');
      expect(result.authorizationUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth?state=abc');
    });
  });
});
