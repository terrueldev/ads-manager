// Model layer for the Contas page — pure, framework-free helpers plus the disconnect-confirmation
// state machine. Kept here (not inline in the ViewModel or a component's useState) so it is
// directly unit-testable without rendering; see contas_model.test.ts.
import { ApiError } from '@/services';
import type { AccountStatus, ConnectedAccount } from '@/types';

export const ACCOUNT_STATUS_LABELS: Readonly<Record<AccountStatus, string>> = {
  active: 'Ativa',
  suspended: 'Suspensa',
  needs_reconnect: 'Precisa reconectar',
};

export type AccountStatusBadgeVariant = 'secondary' | 'warning' | 'outline';

export const accountStatusBadgeVariant = (status: AccountStatus): AccountStatusBadgeVariant => {
  switch (status) {
    case 'active':
      return 'secondary';
    case 'needs_reconnect':
      return 'warning';
    default:
      return 'outline';
  }
};

export const formatConnectedAt = (isoDate: string): string => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

// FR6/AC6: a needs_reconnect account keeps working for the others; this only flags the one row
// that needs the banner + "Reconectar" affordance.
export const accountNeedsReconnect = (account: ConnectedAccount): boolean => account.status === 'needs_reconnect';

export const sortAccountsByConnectedAtDesc = (
  accounts: readonly ConnectedAccount[]
): readonly ConnectedAccount[] =>
  [...accounts].sort((a, b) => new Date(b.connected_at).getTime() - new Date(a.connected_at).getTime());

// SPEC.md > Error Handling: "Desconectar conta inexistente" -> "Conta não encontrada"; anything
// else (network failure, unexpected server error) gets a generic retry message.
export const mapDisconnectErrorToMessage = (error: unknown): string => {
  if (error instanceof ApiError && error.code === 'ACCOUNT_NOT_FOUND') {
    return 'Conta não encontrada';
  }
  return 'Não foi possível desconectar a conta. Tente novamente.';
};

// Disconnect confirmation state machine (FR5: an in-UI confirmation, never `window.confirm`).
// Only one row's confirm affordance can be open at a time — requesting a new one implicitly
// replaces whichever was previously open.
export type DisconnectConfirmState = Readonly<{ readonly confirmingAccountId: string | null }>;

export type DisconnectConfirmAction =
  | Readonly<{ readonly type: 'request'; readonly accountId: string }>
  | Readonly<{ readonly type: 'cancel' }>
  | Readonly<{ readonly type: 'confirmed' }>;

export const initialDisconnectConfirmState: DisconnectConfirmState = { confirmingAccountId: null };

export const disconnectConfirmReducer = (
  state: DisconnectConfirmState,
  action: DisconnectConfirmAction
): DisconnectConfirmState => {
  switch (action.type) {
    case 'request':
      return { confirmingAccountId: action.accountId };
    case 'cancel':
    case 'confirmed':
      return { confirmingAccountId: null };
    default:
      return state;
  }
};
