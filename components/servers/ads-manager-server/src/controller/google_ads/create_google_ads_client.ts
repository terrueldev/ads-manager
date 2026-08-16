// Controller adapter: wraps the `google-ads-api` package (Opteo's community client) with the two
// operations the Model use-cases need — listAccessibleCustomerIds and fetchCustomerMetadata —
// configured from Config's `googleOAuth` (client id/secret, shared with the OAuth adapter — same
// Google Cloud OAuth app) and `googleAds` (developer token) sections.
//
// The raw `resource_names` → customer_id parsing is delegated to the pure Model helper
// `parseAccessibleCustomerIds` (src/model/use-cases/parse_accessible_customer_ids.ts) so that
// logic stays independently unit-tested without mocking this package at all.
import { GoogleAdsApi } from 'google-ads-api';
import { parseAccessibleCustomerIds, type CustomerMetadata } from '../../model';

export type GoogleAdsClientConfig = Readonly<{
  readonly clientId: string;
  readonly clientSecret: string;
  readonly developerToken: string;
}>;

export type GoogleAdsClientAdapter = Readonly<{
  readonly listAccessibleCustomerIds: (refreshToken: string) => Promise<readonly string[]>;
  readonly fetchCustomerMetadata: (customerId: string, refreshToken: string) => Promise<CustomerMetadata>;
}>;

const CUSTOMER_METADATA_QUERY =
  'SELECT customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1';

export const createGoogleAdsClientAdapter = (config: GoogleAdsClientConfig): GoogleAdsClientAdapter => {
  const client = new GoogleAdsApi({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    developer_token: config.developerToken,
  });

  const listAccessibleCustomerIds = async (refreshToken: string): Promise<readonly string[]> => {
    const response = await client.listAccessibleCustomers(refreshToken);
    return parseAccessibleCustomerIds(response.resource_names ?? []);
  };

  const fetchCustomerMetadata = async (customerId: string, refreshToken: string): Promise<CustomerMetadata> => {
    const rawCustomerId = customerId.replace(/-/g, '');
    const customer = client.Customer({ customer_id: rawCustomerId, refresh_token: refreshToken });
    // NOTE: sub-accounts under an MCC may require `login_customer_id` (the manager account id) to
    // be set on this call for Google to authorize it — not wired here, since exercising it needs a
    // real MCC + approved developer token (pending manual setup, see SPEC.md > Dependencies). If
    // metadata fetches for MCC sub-accounts fail with a permission error once real credentials
    // exist, that's the first place to look.
    const rows = await customer.query(CUSTOMER_METADATA_QUERY);
    const row = rows[0];
    if (!row?.customer) {
      throw new Error(`fetchCustomerMetadata: no customer row returned for ${customerId}`);
    }
    return {
      accountName: row.customer.descriptive_name ?? '',
      currencyCode: row.customer.currency_code ?? '',
      timezone: row.customer.time_zone ?? '',
    };
  };

  return { listAccessibleCustomerIds, fetchCustomerMetadata };
};
