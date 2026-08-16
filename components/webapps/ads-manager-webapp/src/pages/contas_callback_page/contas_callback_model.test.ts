import { describe, expect, it } from 'vitest';
import { ApiError } from '@/services';
import type { AccessibleAccount } from '@/types';
import {
  initialSelectionState,
  isAccountSelectable,
  mapCallbackErrorToMessage,
  selectionReducer,
} from './contas_callback_model';

const buildAccount = (overrides: Partial<AccessibleAccount> = {}): AccessibleAccount => ({
  customer_id: '123-456-7890',
  account_name: 'Minha Loja',
  currency_code: 'BRL',
  timezone: 'America/Sao_Paulo',
  already_connected: false,
  ...overrides,
});

describe('isAccountSelectable', () => {
  it('is selectable when not already connected', () => {
    expect(isAccountSelectable(buildAccount({ already_connected: false }))).toBe(true);
  });

  it('is not selectable when already connected (AC3)', () => {
    expect(isAccountSelectable(buildAccount({ already_connected: true }))).toBe(false);
  });
});

describe('selectionReducer', () => {
  it('starts with an empty selection', () => {
    expect(initialSelectionState.selected.size).toBe(0);
  });

  it('toggles an account into the selection', () => {
    const state = selectionReducer(initialSelectionState, { type: 'toggle', customerId: '123' });
    expect(state.selected.has('123')).toBe(true);
  });

  it('toggling twice removes the account again', () => {
    const once = selectionReducer(initialSelectionState, { type: 'toggle', customerId: '123' });
    const twice = selectionReducer(once, { type: 'toggle', customerId: '123' });
    expect(twice.selected.has('123')).toBe(false);
  });

  it('does not mutate the previous state', () => {
    const state = selectionReducer(initialSelectionState, { type: 'toggle', customerId: '123' });
    expect(initialSelectionState.selected.size).toBe(0);
    expect(state).not.toBe(initialSelectionState);
  });

  it('keeps other selected accounts when toggling one', () => {
    const first = selectionReducer(initialSelectionState, { type: 'toggle', customerId: '123' });
    const both = selectionReducer(first, { type: 'toggle', customerId: '456' });
    expect(both.selected.has('123')).toBe(true);
    expect(both.selected.has('456')).toBe(true);
  });
});

describe('mapCallbackErrorToMessage', () => {
  it('maps known ApiError codes to the SPEC.md user-facing message', () => {
    expect(mapCallbackErrorToMessage(new ApiError('OAUTH_DENIED', 'denied'))).toBe(
      'Conexão cancelada — nenhuma permissão foi concedida',
    );
    expect(mapCallbackErrorToMessage(new ApiError('INVALID_STATE', 'bad state'))).toBe(
      'Sessão de conexão expirada, tente novamente',
    );
    expect(mapCallbackErrorToMessage(new ApiError('GOOGLE_ADS_API_ERROR', 'boom'))).toBe(
      'Não foi possível carregar suas contas do Google Ads. Tente novamente.',
    );
  });

  it('falls back to the ApiError message for an unmapped code', () => {
    expect(mapCallbackErrorToMessage(new ApiError('ACCOUNT_NOT_FOUND', 'custom message'))).toBe('custom message');
  });

  it('falls back to a generic message for a non-ApiError error', () => {
    expect(mapCallbackErrorToMessage(new Error('network down'))).toBe(
      'Não foi possível completar a conexão. Tente novamente.',
    );
  });
});
