import { describe, expect, it } from 'vitest';
import { ApiError } from '@/services';
import type { Campaign, ConnectedAccount } from '@/types';
import {
  accountNeedsReconnect,
  campaignStatusBadgeVariant,
  dateRangeReducer,
  formatBudget,
  formatCurrency,
  formatFetchedAt,
  formatInteger,
  formatPercent,
  formatRoas,
  initialDateRangeState,
  isAccountNeedsReconnectError,
  mapCampaignsErrorToMessage,
  mapDateRangeToQueryParams,
  sortCampaignsByCostDescending,
  staleBannerMessage,
  validateCustomRange,
} from './dashboard_model';

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

const buildCampaign = (overrides: Partial<Campaign> = {}): Campaign => ({
  campaign_id: '111222333',
  name: 'Campanha Institucional',
  status: 'ENABLED',
  impressions: 12345,
  clicks: 234,
  ctr: 0.019,
  avg_cpc: 1.25,
  cost: 292.5,
  conversions: 8,
  conversion_rate: 0.034,
  cost_per_conversion: 36.56,
  roas: 3.2,
  budget: 50,
  ...overrides,
});

describe('accountNeedsReconnect', () => {
  it('returns true only for needs_reconnect status', () => {
    expect(accountNeedsReconnect(buildAccount({ status: 'needs_reconnect' }))).toBe(true);
    expect(accountNeedsReconnect(buildAccount({ status: 'active' }))).toBe(false);
    expect(accountNeedsReconnect(buildAccount({ status: 'suspended' }))).toBe(false);
  });
});

describe('isAccountNeedsReconnectError', () => {
  it('is true only for an ApiError with code ACCOUNT_NEEDS_RECONNECT', () => {
    expect(isAccountNeedsReconnectError(new ApiError('ACCOUNT_NEEDS_RECONNECT', 'x'))).toBe(true);
    expect(isAccountNeedsReconnectError(new ApiError('GOOGLE_ADS_API_ERROR', 'x'))).toBe(false);
    expect(isAccountNeedsReconnectError(new Error('network down'))).toBe(false);
    expect(isAccountNeedsReconnectError(undefined)).toBe(false);
  });
});

describe('dateRangeReducer', () => {
  it('defaults to the 30-day preset (SPEC.md FR2)', () => {
    expect(initialDateRangeState).toEqual({ preset: '30d', customStart: '', customEnd: '' });
  });

  it('select_preset switches the preset and clears nothing else', () => {
    const state = dateRangeReducer(initialDateRangeState, { type: 'select_preset', preset: '7d' });
    expect(state).toEqual({ preset: '7d', customStart: '', customEnd: '' });
  });

  it('select_custom switches into custom mode without touching existing dates', () => {
    const withDates = { preset: '7d' as const, customStart: '2026-01-01', customEnd: '2026-01-10' };
    const state = dateRangeReducer(withDates, { type: 'select_custom' });
    expect(state).toEqual({ preset: 'custom', customStart: '2026-01-01', customEnd: '2026-01-10' });
  });

  it('set_custom_start and set_custom_end update the respective field independently', () => {
    const afterStart = dateRangeReducer(initialDateRangeState, { type: 'set_custom_start', value: '2026-01-01' });
    expect(afterStart.customStart).toBe('2026-01-01');
    expect(afterStart.customEnd).toBe('');

    const afterEnd = dateRangeReducer(afterStart, { type: 'set_custom_end', value: '2026-01-10' });
    expect(afterEnd.customStart).toBe('2026-01-01');
    expect(afterEnd.customEnd).toBe('2026-01-10');
  });

  it('does not mutate the previous state', () => {
    const state = dateRangeReducer(initialDateRangeState, { type: 'select_preset', preset: '90d' });
    expect(initialDateRangeState.preset).toBe('30d');
    expect(state).not.toBe(initialDateRangeState);
  });
});

describe('validateCustomRange', () => {
  it('is null (no error) for non-custom presets regardless of dates', () => {
    expect(validateCustomRange({ preset: '30d', customStart: '', customEnd: '' })).toBeNull();
  });

  it('requires both dates when preset is custom', () => {
    expect(validateCustomRange({ preset: 'custom', customStart: '', customEnd: '' })).toBe(
      'Selecione as duas datas do intervalo customizado',
    );
    expect(validateCustomRange({ preset: 'custom', customStart: '2026-01-01', customEnd: '' })).toBe(
      'Selecione as duas datas do intervalo customizado',
    );
  });

  it('rejects start > end with the SPEC.md message', () => {
    expect(
      validateCustomRange({ preset: 'custom', customStart: '2026-01-10', customEnd: '2026-01-01' }),
    ).toBe('Data final deve ser depois da data inicial');
  });

  it('accepts a valid complete custom range', () => {
    expect(
      validateCustomRange({ preset: 'custom', customStart: '2026-01-01', customEnd: '2026-01-10' }),
    ).toBeNull();
  });

  it('accepts start === end (single-day range)', () => {
    expect(
      validateCustomRange({ preset: 'custom', customStart: '2026-01-01', customEnd: '2026-01-01' }),
    ).toBeNull();
  });
});

describe('mapDateRangeToQueryParams', () => {
  it('maps a preset directly, with no start/end', () => {
    expect(mapDateRangeToQueryParams({ preset: '7d', customStart: '', customEnd: '' })).toEqual({ range: '7d' });
    expect(mapDateRangeToQueryParams({ preset: '30d', customStart: '', customEnd: '' })).toEqual({ range: '30d' });
    expect(mapDateRangeToQueryParams({ preset: '90d', customStart: '', customEnd: '' })).toEqual({ range: '90d' });
  });

  it('maps a valid custom range to range=custom with start/end', () => {
    expect(
      mapDateRangeToQueryParams({ preset: 'custom', customStart: '2026-01-01', customEnd: '2026-01-10' }),
    ).toEqual({ range: 'custom', start: '2026-01-01', end: '2026-01-10' });
  });

  it('returns null for an incomplete custom range (gates the fetch instead of hitting 400)', () => {
    expect(mapDateRangeToQueryParams({ preset: 'custom', customStart: '', customEnd: '' })).toBeNull();
    expect(mapDateRangeToQueryParams({ preset: 'custom', customStart: '2026-01-01', customEnd: '' })).toBeNull();
  });

  it('returns null for an invalid custom range (start > end)', () => {
    expect(
      mapDateRangeToQueryParams({ preset: 'custom', customStart: '2026-01-10', customEnd: '2026-01-01' }),
    ).toBeNull();
  });
});

describe('campaignStatusBadgeVariant', () => {
  it('maps each status to its badge variant', () => {
    expect(campaignStatusBadgeVariant('ENABLED')).toBe('secondary');
    expect(campaignStatusBadgeVariant('PAUSED')).toBe('outline');
    expect(campaignStatusBadgeVariant('REMOVED')).toBe('destructive');
  });
});

describe('formatInteger', () => {
  it('formats using pt-BR thousands separators', () => {
    expect(formatInteger(12345)).toBe('12.345');
    expect(formatInteger(0)).toBe('0');
  });
});

describe('formatPercent', () => {
  it('converts a fraction to a percentage with two decimals', () => {
    expect(formatPercent(0.019)).toBe('1,90%');
    expect(formatPercent(0)).toBe('0,00%');
  });
});

describe('formatCurrency', () => {
  it('formats a value in the given currency', () => {
    expect(formatCurrency(292.5, 'BRL')).toContain('292,50');
  });

  it('falls back gracefully for an invalid currency code instead of throwing', () => {
    expect(formatCurrency(10, 'not-a-currency')).toBe('not-a-currency 10.00');
  });
});

describe('formatBudget', () => {
  it('renders an em dash for a null budget (no shared/campaign budget available)', () => {
    expect(formatBudget(null, 'BRL')).toBe('—');
  });

  it('formats a numeric budget as currency', () => {
    expect(formatBudget(50, 'BRL')).toContain('50,00');
  });
});

describe('formatRoas', () => {
  it('formats with two decimals and an "x" suffix', () => {
    expect(formatRoas(3.2)).toBe('3.20x');
    expect(formatRoas(0)).toBe('0.00x');
  });
});

describe('sortCampaignsByCostDescending', () => {
  it('orders campaigns from highest to lowest cost without mutating the input (FR3)', () => {
    const cheap = buildCampaign({ campaign_id: 'a', cost: 10 });
    const expensive = buildCampaign({ campaign_id: 'b', cost: 1000 });
    const mid = buildCampaign({ campaign_id: 'c', cost: 100 });
    const input = [cheap, expensive, mid];

    const sorted = sortCampaignsByCostDescending(input);

    expect(sorted.map((c) => c.campaign_id)).toEqual(['b', 'c', 'a']);
    expect(input.map((c) => c.campaign_id)).toEqual(['a', 'b', 'c']);
  });
});

describe('formatFetchedAt', () => {
  it('formats a valid ISO date differently from the raw string', () => {
    expect(formatFetchedAt('2026-08-16T11:00:00.000Z')).not.toBe('2026-08-16T11:00:00.000Z');
  });

  it('falls back to the raw string for an invalid date', () => {
    expect(formatFetchedAt('not-a-date')).toBe('not-a-date');
  });
});

describe('staleBannerMessage', () => {
  it('builds the SPEC.md-prescribed banner copy including the formatted time', () => {
    const message = staleBannerMessage('2026-08-16T11:00:00.000Z');
    expect(message.startsWith('Dados desatualizados desde ')).toBe(true);
    expect(message).toContain(formatFetchedAt('2026-08-16T11:00:00.000Z'));
  });
});

describe('mapCampaignsErrorToMessage', () => {
  it('maps each documented error code to the SPEC.md user-facing message', () => {
    expect(mapCampaignsErrorToMessage(new ApiError('INVALID_DATE_RANGE', 'x'))).toBe(
      'Data final deve ser depois da data inicial',
    );
    expect(mapCampaignsErrorToMessage(new ApiError('ACCOUNT_NOT_FOUND', 'x'))).toBe('Conta não encontrada');
    expect(mapCampaignsErrorToMessage(new ApiError('ACCOUNT_NEEDS_RECONNECT', 'x'))).toBe(
      'Esta conta precisa ser reconectada antes de ver os dados',
    );
    expect(mapCampaignsErrorToMessage(new ApiError('GOOGLE_ADS_API_ERROR', 'x'))).toBe(
      'Não foi possível carregar os dados desta conta agora. Tente novamente.',
    );
  });

  it('falls back to a generic retry message for a non-ApiError error', () => {
    expect(mapCampaignsErrorToMessage(new Error('network down'))).toBe(
      'Não foi possível carregar os dados desta conta agora. Tente novamente.',
    );
  });
});
