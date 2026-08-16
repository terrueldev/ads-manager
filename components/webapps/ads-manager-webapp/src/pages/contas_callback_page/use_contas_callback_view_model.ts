import { useReducer } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useAppConfig } from '@/hooks';
import { connectAccounts, fetchOAuthCallback } from '@/services';
import type { AccessibleAccount } from '@/types';
import {
  initialSelectionState,
  mapCallbackErrorToMessage,
  NO_ACTIVE_SESSION_MESSAGE,
  selectionReducer,
} from './contas_callback_model';

// Must match use_contas_view_model.ts's CONNECTED_ACCOUNTS_QUERY_KEY. Duplicated (rather than
// imported across pages) to keep page modules decoupled — the @/pages barrel only exposes page
// components, not internal query keys.
const CONNECTED_ACCOUNTS_QUERY_KEY = ['connected-accounts'] as const;

export type ContasCallbackSearch = Readonly<{
  readonly code?: string;
  readonly state?: string;
  readonly error?: string;
}>;

type ContasCallbackViewModel = Readonly<{
  readonly isLoading: boolean;
  readonly loadError: string | null;
  readonly accounts: readonly AccessibleAccount[];
  readonly selectedCustomerIds: ReadonlySet<string>;
  readonly isSubmitting: boolean;
  readonly submitError: string | null;
  readonly canSubmit: boolean;
  readonly handleToggleAccount: (customerId: string) => void;
  readonly handleConfirm: () => void;
  readonly handleRetry: () => void;
}>;

export const useContasCallbackViewModel = (search: ContasCallbackSearch): ContasCallbackViewModel => {
  const config = useAppConfig();
  const baseUrl = config.apis?.['ads-manager-api']?.base_url ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const hasCallbackParams = Boolean(search.code) || Boolean(search.state) || Boolean(search.error);

  // Delegates to the UNCHANGED GET /oauth/google-ads/callback endpoint — see
  // contas_callback_page.tsx for why this is a `fetch` from here rather than a browser redirect
  // straight to the server.
  const callbackQuery = useQuery({
    queryKey: ['oauth-callback', search.code, search.state, search.error],
    queryFn: () => fetchOAuthCallback(baseUrl, search),
    enabled: hasCallbackParams,
    retry: false,
  });

  const [selection, dispatchSelection] = useReducer(selectionReducer, initialSelectionState);

  const confirmMutation = useMutation({
    mutationFn: (customerIds: readonly string[]) => connectAccounts(baseUrl, customerIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CONNECTED_ACCOUNTS_QUERY_KEY });
      void navigate({ to: '/contas' });
    },
  });

  const handleToggleAccount = (customerId: string): void => {
    dispatchSelection({ type: 'toggle', customerId });
  };

  const handleConfirm = (): void => {
    confirmMutation.mutate(Array.from(selection.selected));
  };

  const handleRetry = (): void => {
    void navigate({ to: '/contas' });
  };

  const accounts = callbackQuery.data?.accessible_accounts ?? [];

  const loadError = !hasCallbackParams
    ? NO_ACTIVE_SESSION_MESSAGE
    : callbackQuery.isError
      ? mapCallbackErrorToMessage(callbackQuery.error)
      : null;

  return {
    isLoading: callbackQuery.isLoading,
    loadError,
    accounts,
    selectedCustomerIds: selection.selected,
    isSubmitting: confirmMutation.isPending,
    submitError: confirmMutation.isError ? mapCallbackErrorToMessage(confirmMutation.error) : null,
    canSubmit: selection.selected.size > 0 && !confirmMutation.isPending,
    handleToggleAccount,
    handleConfirm,
    handleRetry,
  };
};
