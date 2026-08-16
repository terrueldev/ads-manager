import { describe, expect, it } from 'vitest';
import { ApiError } from '@/services';
import type { ConnectedAccount } from '@/types';
import {
  accountNeedsReconnect,
  accountStatusBadgeVariant,
  disconnectConfirmReducer,
  formatConnectedAt,
  initialDisconnectConfirmState,
  mapDisconnectErrorToMessage,
  sortAccountsByConnectedAtDesc,
} from './contas_model';

const buildAccount = (overrides: Partial<ConnectedAccount> = {}): ConnectedAccount => ({
  id: 'acc-1',
  customer_id: '123-456-7890',
  account_name: 'Minha Loja',
  currency_code: 'BRL',
  timezone: 'America/Sao_Paulo',
  status: 'active',
  connected_at: '2026-01-01T10:00:00.000Z',
  ...overrides,
});

describe('accountNeedsReconnect', () => {
  it('returns true only for needs_reconnect status', () => {
    expect(accountNeedsReconnect(buildAccount({ status: 'needs_reconnect' }))).toBe(true);
    expect(accountNeedsReconnect(buildAccount({ status: 'active' }))).toBe(false);
    expect(accountNeedsReconnect(buildAccount({ status: 'suspended' }))).toBe(false);
  });
});

describe('accountStatusBadgeVariant', () => {
  it('maps each status to its badge variant', () => {
    expect(accountStatusBadgeVariant('active')).toBe('secondary');
    expect(accountStatusBadgeVariant('needs_reconnect')).toBe('warning');
    expect(accountStatusBadgeVariant('suspended')).toBe('outline');
  });
});

describe('sortAccountsByConnectedAtDesc', () => {
  it('orders accounts from most to least recently connected without mutating the input', () => {
    const older = buildAccount({ id: 'a', connected_at: '2026-01-01T00:00:00.000Z' });
    const newer = buildAccount({ id: 'b', connected_at: '2026-02-01T00:00:00.000Z' });
    const input = [older, newer];

    const sorted = sortAccountsByConnectedAtDesc(input);

    expect(sorted.map((account) => account.id)).toEqual(['b', 'a']);
    expect(input.map((account) => account.id)).toEqual(['a', 'b']);
  });
});

describe('formatConnectedAt', () => {
  it('formats a valid ISO date differently from the raw string', () => {
    expect(formatConnectedAt('2026-01-01T10:00:00.000Z')).not.toBe('2026-01-01T10:00:00.000Z');
  });

  it('falls back to the raw string for an invalid date', () => {
    expect(formatConnectedAt('not-a-date')).toBe('not-a-date');
  });
});

describe('mapDisconnectErrorToMessage', () => {
  it('maps ACCOUNT_NOT_FOUND to the SPEC.md message', () => {
    expect(mapDisconnectErrorToMessage(new ApiError('ACCOUNT_NOT_FOUND', 'not found'))).toBe('Conta não encontrada');
  });

  it('falls back to a generic retry message for anything else', () => {
    expect(mapDisconnectErrorToMessage(new ApiError('GOOGLE_ADS_API_ERROR', 'boom'))).toBe(
      'Não foi possível desconectar a conta. Tente novamente.',
    );
    expect(mapDisconnectErrorToMessage(new Error('network down'))).toBe(
      'Não foi possível desconectar a conta. Tente novamente.',
    );
  });
});

describe('disconnectConfirmReducer', () => {
  it('starts with no account confirming', () => {
    expect(initialDisconnectConfirmState).toEqual({ confirmingAccountId: null });
  });

  it('request sets the confirming account', () => {
    const state = disconnectConfirmReducer(initialDisconnectConfirmState, { type: 'request', accountId: 'acc-1' });
    expect(state).toEqual({ confirmingAccountId: 'acc-1' });
  });

  it('request for a different account replaces the previous one (only one row confirms at a time)', () => {
    const first = disconnectConfirmReducer(initialDisconnectConfirmState, { type: 'request', accountId: 'acc-1' });
    const second = disconnectConfirmReducer(first, { type: 'request', accountId: 'acc-2' });
    expect(second).toEqual({ confirmingAccountId: 'acc-2' });
  });

  it('cancel and confirmed both clear the confirming account', () => {
    const confirming = disconnectConfirmReducer(initialDisconnectConfirmState, {
      type: 'request',
      accountId: 'acc-1',
    });
    expect(disconnectConfirmReducer(confirming, { type: 'cancel' })).toEqual({ confirmingAccountId: null });
    expect(disconnectConfirmReducer(confirming, { type: 'confirmed' })).toEqual({ confirmingAccountId: null });
  });
});
