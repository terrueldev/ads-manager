// Design decision — OAuth callback -> account-selection handoff:
//
// The OpenAPI contract's GET /oauth/google-ads/callback (contracts/ads-manager-api/openapi.yaml)
// is implemented, per components/servers/ads-manager-server/src/controller/http_handlers/oauth.ts,
// as a plain JSON-returning GET endpoint: it validates `state`, exchanges `code` for tokens, lists
// accessible Google Ads accounts, and returns `{ accessible_accounts: [...] }` (200) or an
// ErrorResponse (400/502). It never redirects anywhere itself — it was designed to be called like
// any other REST endpoint, not as a page a browser lands on.
//
// Google, however, performs a full browser navigation (302) to whatever `redirect_uri` was used to
// build the authorization URL (GET /oauth/google-ads/start). If that URI pointed at the server's
// own callback route (as the original scaffolded config had it), the user's browser would land
// directly on a bare JSON response with no SPA around it — no router, no React, no way back into
// the account-selection UI required by FR2/AC1.
//
// The fix applied here avoids inventing any new endpoint or changing the frozen contract:
// `googleOAuth.redirectUri` in components/config/envs/default/config.yaml now points at this
// webapp route (`/contas/callback`) instead of the server. Google therefore redirects the browser
// HERE, appending `?code=...&state=...` (or `?error=...` on denial) as plain query params — see
// routes.tsx's `validateSearch` for `/contas/callback`, and use_contas_callback_view_model.ts.
// This page's ViewModel then makes a normal same-origin `fetch` call to the UNCHANGED
// `GET /oauth/google-ads/callback?code=...&state=...` endpoint (services/accounts_api.ts's
// fetchOAuthCallback) to complete the exchange and obtain the `accessible_accounts` list — the
// exact same server code path, just invoked via XHR from the SPA instead of via a raw browser
// navigation.
//
// No refresh token ever reaches this page or any other frontend code: the callback response only
// ever carries the AccessibleAccount metadata the contract defines (customer_id, account_name,
// currency_code, timezone, already_connected) — tokens stay server-side per Security
// Considerations ("toda chamada... ocorre exclusivamente no ads-manager-server").
import { useSearch } from '@tanstack/react-router';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components';
import { AccountSelectionList } from './account_selection_list';
import { useContasCallbackViewModel } from './use_contas_callback_view_model';

export const ContasCallbackPage = (): React.JSX.Element => {
  const search = useSearch({ from: '/contas/callback' });
  const {
    isLoading,
    loadError,
    accounts,
    selectedCustomerIds,
    isSubmitting,
    submitError,
    canSubmit,
    handleToggleAccount,
    handleConfirm,
    handleRetry,
  } = useContasCallbackViewModel(search);

  return (
    <div className="p-8 space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold">Selecionar contas</h2>
        <p className="text-muted-foreground">Escolha quais contas do Google Ads você quer conectar.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contas acessíveis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && <p className="text-muted-foreground">Carregando contas acessíveis...</p>}

          {!isLoading && loadError && (
            <div className="space-y-4">
              <p role="alert" className="text-sm text-destructive">
                {loadError}
              </p>
              <Button variant="outline" onClick={handleRetry}>
                Voltar para Contas
              </Button>
            </div>
          )}

          {!isLoading && !loadError && accounts.length === 0 && (
            <p className="text-muted-foreground">Nenhuma conta acessível foi encontrada para esta identidade.</p>
          )}

          {!isLoading && !loadError && accounts.length > 0 && (
            <>
              <AccountSelectionList
                accounts={accounts}
                selectedCustomerIds={selectedCustomerIds}
                onToggleAccount={handleToggleAccount}
              />

              {submitError && (
                <p role="alert" className="text-sm text-destructive">
                  {submitError}
                </p>
              )}

              <Button onClick={handleConfirm} disabled={!canSubmit}>
                {isSubmitting ? 'Conectando...' : 'Confirmar'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
