// Model layer for the OAuth callback -> account-selection page. See contas_callback_page.tsx for
// the design-decision writeup on the redirect_uri handoff this page depends on.
import { ApiError } from '@/services';
import type { AccessibleAccount } from '@/types';

// SPEC.md > Error Handling — user-facing message per contract Error.code. The server is the single
// source of truth for *which* code applies (including OAUTH_DENIED, which it already derives from
// Google's `error` query param — see handle_oauth_callback.ts); this table only owns translating a
// code into the exact copy SPEC.md prescribes.
const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  INVALID_STATE: 'Sessão de conexão expirada, tente novamente',
  OAUTH_DENIED: 'Conexão cancelada — nenhuma permissão foi concedida',
  GOOGLE_ADS_API_ERROR: 'Não foi possível carregar suas contas do Google Ads. Tente novamente.',
  ALREADY_CONNECTED: 'Esta conta já está conectada',
};

const DEFAULT_ERROR_MESSAGE = 'Não foi possível completar a conexão. Tente novamente.';

// Shown when this route is opened with no code/state/error at all (e.g. direct navigation) — not
// an API error, so it isn't in ERROR_MESSAGES; the ViewModel guards for it before ever querying.
export const NO_ACTIVE_SESSION_MESSAGE =
  'Nenhuma sessão de conexão ativa. Inicie o fluxo por "Conectar conta" na tela de Contas.';

export const mapCallbackErrorToMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return ERROR_MESSAGES[error.code] ?? error.message;
  }
  return DEFAULT_ERROR_MESSAGE;
};

// AC3: an already-connected account is shown but cannot be selected again.
export const isAccountSelectable = (account: AccessibleAccount): boolean => !account.already_connected;

export type SelectionState = Readonly<{ readonly selected: ReadonlySet<string> }>;

export type SelectionAction = Readonly<{ readonly type: 'toggle'; readonly customerId: string }>;

export const initialSelectionState: SelectionState = { selected: new Set() };

export const selectionReducer = (state: SelectionState, action: SelectionAction): SelectionState => {
  const next = new Set(state.selected);
  if (next.has(action.customerId)) {
    next.delete(action.customerId);
  } else {
    next.add(action.customerId);
  }
  return { selected: next };
};
