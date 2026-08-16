import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components';
import { ConnectedAccountsTable } from './connected_accounts_table';
import { useContasViewModel } from './use_contas_view_model';

export const ContasPage = (): React.JSX.Element => {
  const {
    accounts,
    isLoading,
    isError,
    errorMessage,
    confirmingAccountId,
    isConnecting,
    connectError,
    isDisconnecting,
    disconnectError,
    handleConnectClick,
    handleReconnectClick,
    handleRequestDisconnect,
    handleCancelDisconnect,
    handleConfirmDisconnect,
  } = useContasViewModel();

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Contas</h2>
          <p className="text-muted-foreground">Conecte e gerencie suas contas do Google Ads.</p>
        </div>
        <Button onClick={handleConnectClick} disabled={isConnecting}>
          {isConnecting ? 'Redirecionando...' : 'Conectar conta'}
        </Button>
      </div>

      {connectError && (
        <p role="alert" className="text-sm text-destructive">
          {connectError}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Contas Conectadas</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-muted-foreground">Carregando contas...</p>}

          {!isLoading && isError && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
          )}

          {!isLoading && !isError && accounts.length === 0 && (
            <p className="text-muted-foreground">
              {'Nenhuma conta conectada ainda. Clique em "Conectar conta" para começar.'}
            </p>
          )}

          {!isLoading && !isError && accounts.length > 0 && (
            <div className="space-y-4">
              {disconnectError && (
                <p role="alert" className="text-sm text-destructive">
                  {disconnectError}
                </p>
              )}
              <ConnectedAccountsTable
                accounts={accounts}
                confirmingAccountId={confirmingAccountId}
                isDisconnecting={isDisconnecting}
                onRequestDisconnect={handleRequestDisconnect}
                onCancelDisconnect={handleCancelDisconnect}
                onConfirmDisconnect={handleConfirmDisconnect}
                onReconnect={handleReconnectClick}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
