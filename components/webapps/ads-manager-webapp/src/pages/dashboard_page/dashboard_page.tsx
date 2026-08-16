import { Link } from '@tanstack/react-router';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components';
import { AccountSelector } from './account_selector';
import { CampaignsTable } from './campaigns_table';
import { DateRangeSelector } from './date_range_selector';
import { staleBannerMessage } from './dashboard_model';
import { useDashboardViewModel } from './use_dashboard_view_model';

export const DashboardPage = (): React.JSX.Element => {
  const {
    accounts,
    isLoadingAccounts,
    accountsErrorMessage,
    selectedAccountId,
    selectedAccount,
    needsReconnect,
    dateRange,
    customRangeError,
    campaigns,
    fetchedAt,
    isStale,
    isLoadingCampaigns,
    isEmpty,
    campaignsErrorMessage,
    isRefreshing,
    handleSelectAccount,
    handleSelectPreset,
    handleSelectCustomRange,
    handleCustomStartChange,
    handleCustomEndChange,
    handleRefreshClick,
  } = useDashboardViewModel();

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-muted-foreground">Performance das campanhas da conta selecionada.</p>
        </div>
      </div>

      {isLoadingAccounts && <p className="text-muted-foreground">Carregando contas...</p>}

      {!isLoadingAccounts && accountsErrorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {accountsErrorMessage}
        </p>
      )}

      {!isLoadingAccounts && !accountsErrorMessage && accounts.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              {'Nenhuma conta conectada ainda. Conecte uma conta na tela '}
              <Link to="/contas" className="underline">
                Contas
              </Link>
              {' para ver o dashboard.'}
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoadingAccounts && !accountsErrorMessage && accounts.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Campanhas</CardTitle>
            <div className="flex items-center gap-3">
              <AccountSelector
                accounts={accounts}
                selectedAccountId={selectedAccountId}
                onSelectAccount={handleSelectAccount}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshClick}
                disabled={needsReconnect || isRefreshing || customRangeError !== null}
              >
                {isRefreshing ? 'Atualizando...' : 'Atualizar'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <DateRangeSelector
              dateRange={dateRange}
              customRangeError={customRangeError}
              onSelectPreset={handleSelectPreset}
              onSelectCustomRange={handleSelectCustomRange}
              onCustomStartChange={handleCustomStartChange}
              onCustomEndChange={handleCustomEndChange}
            />

            {needsReconnect && (
              <p role="alert" className="text-sm text-amber-600">
                {'Esta conta precisa ser reconectada antes de ver os dados. '}
                <Link to="/contas" className="underline">
                  Reconectar em Contas
                </Link>
              </p>
            )}

            {!needsReconnect && isStale && fetchedAt && (
              <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-700">
                {staleBannerMessage(fetchedAt)}
              </p>
            )}

            {!needsReconnect && isLoadingCampaigns && <p className="text-muted-foreground">Carregando campanhas...</p>}

            {!needsReconnect && !isLoadingCampaigns && campaignsErrorMessage && (
              <p role="alert" className="text-sm text-destructive">
                {campaignsErrorMessage}
              </p>
            )}

            {!needsReconnect && !isLoadingCampaigns && !campaignsErrorMessage && isEmpty && (
              <p className="text-muted-foreground">Nenhuma campanha encontrada para o período selecionado.</p>
            )}

            {!needsReconnect && !isLoadingCampaigns && !campaignsErrorMessage && !isEmpty && campaigns.length > 0 && (
              <CampaignsTable campaigns={campaigns} currencyCode={selectedAccount?.currency_code ?? 'USD'} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
