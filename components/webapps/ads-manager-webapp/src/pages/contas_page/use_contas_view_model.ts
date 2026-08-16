import { useReducer } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppConfig } from '@/hooks';
import { disconnectAccount, listConnectedAccounts, startGoogleAdsOAuth } from '@/services';
import type { ConnectedAccount } from '@/types';
import {
  disconnectConfirmReducer,
  initialDisconnectConfirmState,
  mapDisconnectErrorToMessage,
  sortAccountsByConnectedAtDesc,
} from './contas_model';

// Also read by pages/contas_callback_page (duplicated there rather than imported across pages, to
// keep page modules decoupled — see that file's ViewModel for the note).
export const CONNECTED_ACCOUNTS_QUERY_KEY = ['connected-accounts'] as const;

type ContasViewModel = Readonly<{
  readonly accounts: readonly ConnectedAccount[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly errorMessage: string | null;
  readonly confirmingAccountId: string | null;
  readonly isConnecting: boolean;
  readonly connectError: string | null;
  readonly isDisconnecting: boolean;
  readonly disconnectError: string | null;
  readonly handleConnectClick: () => void;
  readonly handleReconnectClick: () => void;
  readonly handleRequestDisconnect: (accountId: string) => void;
  readonly handleCancelDisconnect: () => void;
  readonly handleConfirmDisconnect: (accountId: string) => void;
}>;

export const useContasViewModel = (): ContasViewModel => {
  const config = useAppConfig();
  const baseUrl = config.apis?.['ads-manager-api']?.base_url ?? '';
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: CONNECTED_ACCOUNTS_QUERY_KEY,
    queryFn: () => listConnectedAccounts(baseUrl),
  });

  const [confirmState, dispatchConfirm] = useReducer(disconnectConfirmReducer, initialDisconnectConfirmState);

  // Also used to (re)trigger a needs_reconnect account's reconnection — SPEC.md FR6 / Out of
  // Scope: reconnection always re-runs the same manual OAuth flow (FR1-FR3); there is no
  // per-account "reconnect" endpoint in the contract.
  const startOAuthMutation = useMutation({
    mutationFn: () => startGoogleAdsOAuth(baseUrl),
    onSuccess: (result) => {
      window.location.assign(result.authorization_url);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (accountId: string) => disconnectAccount(baseUrl, accountId),
    onSuccess: () => {
      dispatchConfirm({ type: 'confirmed' });
      void queryClient.invalidateQueries({ queryKey: CONNECTED_ACCOUNTS_QUERY_KEY });
    },
  });

  const handleConnectClick = (): void => {
    startOAuthMutation.mutate();
  };

  const handleRequestDisconnect = (accountId: string): void => {
    dispatchConfirm({ type: 'request', accountId });
  };

  const handleCancelDisconnect = (): void => {
    dispatchConfirm({ type: 'cancel' });
  };

  const handleConfirmDisconnect = (accountId: string): void => {
    disconnectMutation.mutate(accountId);
  };

  const accounts = accountsQuery.data ? sortAccountsByConnectedAtDesc(accountsQuery.data.accounts) : [];

  return {
    accounts,
    isLoading: accountsQuery.isLoading,
    isError: accountsQuery.isError,
    errorMessage: accountsQuery.isError
      ? 'Não foi possível carregar suas contas do Google Ads. Tente novamente.'
      : null,
    confirmingAccountId: confirmState.confirmingAccountId,
    isConnecting: startOAuthMutation.isPending,
    connectError: startOAuthMutation.isError ? 'Não foi possível iniciar a conexão. Tente novamente.' : null,
    isDisconnecting: disconnectMutation.isPending,
    disconnectError: disconnectMutation.isError ? mapDisconnectErrorToMessage(disconnectMutation.error) : null,
    handleConnectClick,
    handleReconnectClick: handleConnectClick,
    handleRequestDisconnect,
    handleCancelDisconnect,
    handleConfirmDisconnect,
  };
};
