import { useEffect, useReducer, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppConfig } from '@/hooks';
import { listCampaigns, listConnectedAccounts } from '@/services';
import type { Campaign, ConnectedAccount } from '@/types';
import {
  accountNeedsReconnect,
  CONNECTED_ACCOUNTS_QUERY_KEY,
  dateRangeReducer,
  initialDateRangeState,
  isAccountNeedsReconnectError,
  mapCampaignsErrorToMessage,
  mapDateRangeToQueryParams,
  sortCampaignsByCostDescending,
  validateCustomRange,
} from './dashboard_model';
import type { DateRangePresetOption, DateRangeState } from './dashboard_model';

type DashboardViewModel = Readonly<{
  readonly accounts: readonly ConnectedAccount[];
  readonly isLoadingAccounts: boolean;
  readonly accountsErrorMessage: string | null;
  readonly selectedAccountId: string | null;
  readonly selectedAccount: ConnectedAccount | null;
  readonly needsReconnect: boolean;
  readonly dateRange: DateRangeState;
  readonly customRangeError: string | null;
  readonly campaigns: readonly Campaign[];
  readonly fetchedAt: string | null;
  readonly isStale: boolean;
  readonly isLoadingCampaigns: boolean;
  readonly isEmpty: boolean;
  readonly campaignsErrorMessage: string | null;
  readonly isRefreshing: boolean;
  readonly handleSelectAccount: (accountId: string) => void;
  readonly handleSelectPreset: (preset: DateRangePresetOption) => void;
  readonly handleSelectCustomRange: () => void;
  readonly handleCustomStartChange: (value: string) => void;
  readonly handleCustomEndChange: (value: string) => void;
  readonly handleRefreshClick: () => void;
}>;

export const useDashboardViewModel = (): DashboardViewModel => {
  const config = useAppConfig();
  const baseUrl = config.apis?.['ads-manager-api']?.base_url ?? '';
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: CONNECTED_ACCOUNTS_QUERY_KEY,
    queryFn: () => listConnectedAccounts(baseUrl),
  });
  const accounts = accountsQuery.data?.accounts ?? [];

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // FR1: only one account is viewed at a time; default to the first connected account once the
  // list loads, rather than starting on an empty dashboard. Depends on `accountsQuery.data`
  // (react-query's cached, referentially-stable value) rather than the `accounts` array derived
  // from it below, so this effect doesn't re-run on every render.
  const firstAccountId = accountsQuery.data?.accounts[0]?.id ?? null;
  useEffect(() => {
    if (selectedAccountId === null && firstAccountId !== null) {
      setSelectedAccountId(firstAccountId);
    }
  }, [firstAccountId, selectedAccountId]);

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;
  const needsReconnect = selectedAccount !== null && accountNeedsReconnect(selectedAccount);

  const [dateRange, dispatchDateRange] = useReducer(dateRangeReducer, initialDateRangeState);
  const customRangeError = validateCustomRange(dateRange);
  const queryParams = mapDateRangeToQueryParams(dateRange);

  const campaignsQueryKey = [
    'campaigns',
    selectedAccountId,
    queryParams?.range ?? null,
    queryParams?.start ?? null,
    queryParams?.end ?? null,
  ] as const;

  const campaignsQuery = useQuery({
    queryKey: campaignsQueryKey,
    queryFn: () => {
      if (selectedAccountId === null || queryParams === null) {
        throw new Error('Cannot fetch campaigns without a selected account and a valid date range');
      }
      return listCampaigns(baseUrl, selectedAccountId, { ...queryParams, refresh: false });
    },
    enabled: selectedAccountId !== null && !needsReconnect && queryParams !== null,
  });

  const refreshMutation = useMutation({
    mutationFn: () => {
      if (selectedAccountId === null || queryParams === null) {
        throw new Error('Cannot refresh campaigns without a selected account and a valid date range');
      }
      return listCampaigns(baseUrl, selectedAccountId, { ...queryParams, refresh: true });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(campaignsQueryKey, data);
    },
  });

  const handleSelectAccount = (accountId: string): void => {
    setSelectedAccountId(accountId);
  };

  const handleSelectPreset = (preset: DateRangePresetOption): void => {
    dispatchDateRange({ type: 'select_preset', preset });
  };

  const handleSelectCustomRange = (): void => {
    dispatchDateRange({ type: 'select_custom' });
  };

  const handleCustomStartChange = (value: string): void => {
    dispatchDateRange({ type: 'set_custom_start', value });
  };

  const handleCustomEndChange = (value: string): void => {
    dispatchDateRange({ type: 'set_custom_end', value });
  };

  const handleRefreshClick = (): void => {
    refreshMutation.mutate();
  };

  const campaigns = campaignsQuery.data ? sortCampaignsByCostDescending(campaignsQuery.data.campaigns) : [];
  const effectiveNeedsReconnect = needsReconnect || isAccountNeedsReconnectError(campaignsQuery.error);

  const campaignsErrorMessage =
    campaignsQuery.isError && !effectiveNeedsReconnect ? mapCampaignsErrorToMessage(campaignsQuery.error) : null;

  return {
    accounts,
    isLoadingAccounts: accountsQuery.isLoading,
    accountsErrorMessage: accountsQuery.isError
      ? 'Não foi possível carregar suas contas do Google Ads. Tente novamente.'
      : null,
    selectedAccountId,
    selectedAccount,
    needsReconnect: effectiveNeedsReconnect,
    dateRange,
    customRangeError,
    campaigns,
    fetchedAt: campaignsQuery.data?.fetched_at ?? null,
    isStale: campaignsQuery.data?.stale ?? false,
    isLoadingCampaigns: campaignsQuery.isLoading,
    isEmpty: campaignsQuery.isSuccess && campaigns.length === 0,
    campaignsErrorMessage,
    isRefreshing: refreshMutation.isPending,
    handleSelectAccount,
    handleSelectPreset,
    handleSelectCustomRange,
    handleCustomStartChange,
    handleCustomEndChange,
    handleRefreshClick,
  };
};
