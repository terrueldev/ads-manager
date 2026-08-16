// Model layer for the Dashboard page — pure, framework-free helpers plus the date-range selection
// state machine. Kept here (not inline in the ViewModel or a component's useState) so it is
// directly unit-testable without rendering; see dashboard_model.test.ts.
import { ApiError } from '@/services';
import type { Campaign, CampaignDateRangePreset, CampaignStatus, ConnectedAccount } from '@/types';

// Duplicated from pages/contas_page/use_contas_view_model.ts's CONNECTED_ACCOUNTS_QUERY_KEY rather
// than imported across pages, to keep page modules decoupled (see that file's callback-page
// sibling for the same convention already established).
export const CONNECTED_ACCOUNTS_QUERY_KEY = ['connected-accounts'] as const;

// SPEC.md FR1 constraint: a needs_reconnect account is never queried for campaigns; checked via the
// same accounts list contas_page already reads (GET /accounts), not a separate call.
export const accountNeedsReconnect = (account: ConnectedAccount): boolean => account.status === 'needs_reconnect';

// Belt-and-braces: even though the ViewModel gates the campaigns query on accountNeedsReconnect,
// the campaigns endpoint can itself return 409 ACCOUNT_NEEDS_RECONNECT (e.g. the account flips to
// needs_reconnect between the accounts list load and the campaigns fetch). Both paths should render
// the same reconnect banner.
export const isAccountNeedsReconnectError = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'ACCOUNT_NEEDS_RECONNECT';

// ---------------------------------------------------------------------------------------------
// Date range selection (FR2)
// ---------------------------------------------------------------------------------------------

export type DateRangePresetOption = '7d' | '30d' | '90d';

export const DATE_RANGE_PRESET_LABELS: Readonly<Record<DateRangePresetOption, string>> = {
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
};

export type DateRangeState = Readonly<{
  readonly preset: CampaignDateRangePreset;
  readonly customStart: string;
  readonly customEnd: string;
}>;

// SPEC.md FR2: "30 (padrão)" — 30 days is the default preset.
export const initialDateRangeState: DateRangeState = { preset: '30d', customStart: '', customEnd: '' };

export type DateRangeAction =
  | Readonly<{ readonly type: 'select_preset'; readonly preset: DateRangePresetOption }>
  | Readonly<{ readonly type: 'select_custom' }>
  | Readonly<{ readonly type: 'set_custom_start'; readonly value: string }>
  | Readonly<{ readonly type: 'set_custom_end'; readonly value: string }>;

export const dateRangeReducer = (state: DateRangeState, action: DateRangeAction): DateRangeState => {
  switch (action.type) {
    case 'select_preset':
      return { ...state, preset: action.preset };
    case 'select_custom':
      return { ...state, preset: 'custom' };
    case 'set_custom_start':
      return { ...state, customStart: action.value };
    case 'set_custom_end':
      return { ...state, customEnd: action.value };
    default:
      return state;
  }
};

// SPEC.md > Error Handling: "Data final deve ser depois da data inicial". Also guards against
// submitting an incomplete custom range (only one of the two dates filled in) before the server
// ever sees it.
export const validateCustomRange = (state: DateRangeState): string | null => {
  if (state.preset !== 'custom') return null;
  if (!state.customStart || !state.customEnd) return 'Selecione as duas datas do intervalo customizado';
  if (state.customStart > state.customEnd) return 'Data final deve ser depois da data inicial';
  return null;
};

export type CampaignsQueryParams = Readonly<{
  readonly range: CampaignDateRangePreset;
  readonly start?: string;
  readonly end?: string;
}>;

// Maps UI date-range state to the `?range=&start=&end=` query params the contract defines. Returns
// null when a custom range isn't valid/complete yet — callers use this to gate the fetch (rather
// than firing a request the server would reject with 400 INVALID_DATE_RANGE).
export const mapDateRangeToQueryParams = (state: DateRangeState): CampaignsQueryParams | null => {
  if (state.preset !== 'custom') {
    return { range: state.preset };
  }
  if (validateCustomRange(state) !== null) return null;
  return { range: 'custom', start: state.customStart, end: state.customEnd };
};

// ---------------------------------------------------------------------------------------------
// Campaign table formatting (FR3)
// ---------------------------------------------------------------------------------------------

export const CAMPAIGN_STATUS_LABELS: Readonly<Record<CampaignStatus, string>> = {
  ENABLED: 'Ativa',
  PAUSED: 'Pausada',
  REMOVED: 'Removida',
};

export type CampaignStatusBadgeVariant = 'secondary' | 'outline' | 'destructive';

export const campaignStatusBadgeVariant = (status: CampaignStatus): CampaignStatusBadgeVariant => {
  switch (status) {
    case 'ENABLED':
      return 'secondary';
    case 'REMOVED':
      return 'destructive';
    default:
      return 'outline';
  }
};

export const formatInteger = (value: number): string => new Intl.NumberFormat('pt-BR').format(value);

export const formatPercent = (value: number): string =>
  `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value * 100)}%`;

export const formatCurrency = (value: number, currencyCode: string): string => {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currencyCode }).format(value);
  } catch {
    // Defensive fallback for an unexpected/invalid currency code — never let formatting crash the
    // table (SPEC.md > Non-Functional > Confiabilidade: never a broken screen).
    return `${currencyCode} ${value.toFixed(2)}`;
  }
};

export const formatBudget = (value: number | null, currencyCode: string): string =>
  value === null ? '—' : formatCurrency(value, currencyCode);

export const formatRoas = (value: number): string => `${value.toFixed(2)}x`;

// The server (fetch_campaign_metrics.ts) and the OpenAPI contract both already guarantee
// "Campaigns ordered by cost, descending" — but the contract is the only thing this layer should
// trust blindly, and the contract only documents the *field* it's guaranteed on, not that the
// frontend may skip enforcing it. Re-sorting client-side is cheap and makes the table's order
// correct even if a future server change (or an intermediate cache/proxy) reorders the array.
export const sortCampaignsByCostDescending = (campaigns: readonly Campaign[]): readonly Campaign[] =>
  [...campaigns].sort((a, b) => b.cost - a.cost);

// ---------------------------------------------------------------------------------------------
// Stale cache banner (FR4/FR5, AC4)
// ---------------------------------------------------------------------------------------------

export const formatFetchedAt = (isoDate: string): string => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
};

export const staleBannerMessage = (fetchedAtIso: string): string =>
  `Dados desatualizados desde ${formatFetchedAt(fetchedAtIso)}`;

// ---------------------------------------------------------------------------------------------
// Error mapping (SPEC.md > Error Handling)
// ---------------------------------------------------------------------------------------------

const CAMPAIGNS_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  INVALID_DATE_RANGE: 'Data final deve ser depois da data inicial',
  ACCOUNT_NOT_FOUND: 'Conta não encontrada',
  ACCOUNT_NEEDS_RECONNECT: 'Esta conta precisa ser reconectada antes de ver os dados',
  GOOGLE_ADS_API_ERROR: 'Não foi possível carregar os dados desta conta agora. Tente novamente.',
};

const DEFAULT_CAMPAIGNS_ERROR_MESSAGE = 'Não foi possível carregar os dados desta conta agora. Tente novamente.';

export const mapCampaignsErrorToMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return CAMPAIGNS_ERROR_MESSAGES[error.code] ?? error.message;
  }
  return DEFAULT_CAMPAIGNS_ERROR_MESSAGE;
};
