/**
 * @spec changes/2026/08/15/plxeiy-google-ads-manager/01-google-ads-manager/changes/google-ads-connection/SPEC.md
 * test_oauth_state_validation_rejects_invalid
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOAuthSessionStore } from './create_oauth_session_store';

describe('createOAuthSessionStore', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('test_oauth_state_validation_rejects_invalid', () => {
    it('rejects an undefined state', () => {
      const store = createOAuthSessionStore();

      expect(store.consumeState(undefined)).toBe(false);
    });

    it('rejects a state that was never saved (forged/unknown)', () => {
      const store = createOAuthSessionStore();

      expect(store.consumeState('never-issued-state')).toBe(false);
    });

    it('accepts a state exactly once, then rejects on reuse (single-use)', () => {
      const store = createOAuthSessionStore();
      store.saveState('issued-state');

      expect(store.consumeState('issued-state')).toBe(true);
      expect(store.consumeState('issued-state')).toBe(false);
    });

    it('rejects a state after its TTL has elapsed', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T10:00:00Z'));
      const store = createOAuthSessionStore();
      store.saveState('expiring-state');

      vi.setSystemTime(new Date('2026-01-15T10:11:00Z')); // 11 minutes later, TTL is 10

      expect(store.consumeState('expiring-state')).toBe(false);
    });
  });

  describe('AC2/FR2: callback→connect pending token handoff', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-15T10:00:00Z'));
    });

    it('returns undefined for a customer_id with no stashed tokens', () => {
      const store = createOAuthSessionStore();

      expect(store.getPendingTokens('123-456-7890')).toBeUndefined();
    });

    it('returns the stashed tokens for a customer_id until cleared', () => {
      const store = createOAuthSessionStore();
      const tokens = {
        refreshToken: 'r',
        grantedScopes: 'https://www.googleapis.com/auth/adwords',
        accountName: 'Minha Loja',
        currencyCode: 'BRL',
        timezone: 'America/Sao_Paulo',
      };

      store.savePendingTokens('123-456-7890', tokens);
      expect(store.getPendingTokens('123-456-7890')).toEqual(tokens);

      store.clearPendingTokens('123-456-7890');
      expect(store.getPendingTokens('123-456-7890')).toBeUndefined();
    });

    it('expires stashed tokens after their TTL', () => {
      const store = createOAuthSessionStore();
      store.savePendingTokens('123-456-7890', {
        refreshToken: 'r',
        grantedScopes: 'scope',
        accountName: 'name',
        currencyCode: 'BRL',
        timezone: 'America/Sao_Paulo',
      });

      vi.setSystemTime(new Date('2026-01-15T10:11:00Z'));

      expect(store.getPendingTokens('123-456-7890')).toBeUndefined();
    });
  });
});
