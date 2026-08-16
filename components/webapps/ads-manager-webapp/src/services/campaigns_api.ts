// Model layer: thin fetch wrapper around the ads-manager-api contract's
// GET /accounts/{id}/campaigns endpoint (contracts/ads-manager-api/openapi.yaml).
//
// `parseJsonOrThrow`/`readErrorBody` are duplicated from accounts_api.ts rather than imported —
// they are private (non-exported) helpers there, and services/index.ts's barrel only exposes the
// public fetch functions and `ApiError`. Keeping each service file's fetch plumbing self-contained
// mirrors the same "duplicate a small private helper instead of reaching into another module"
// choice already made between pages (see use_contas_callback_view_model.ts's note on
// CONNECTED_ACCOUNTS_QUERY_KEY).
import type { components } from '@ads-manager/contract';
import { ApiError } from './accounts_api';

const API_PREFIX = '/api/v1';

const readErrorBody = async (response: Response): Promise<components['schemas']['ErrorResponse'] | null> => {
  try {
    return (await response.json()) as components['schemas']['ErrorResponse'];
  } catch {
    return null;
  }
};

const parseJsonOrThrow = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const errorBody = await readErrorBody(response);
    if (errorBody?.error) {
      throw new ApiError(errorBody.error.code, errorBody.error.message);
    }
    throw new Error(`Request failed with status ${String(response.status)}`);
  }
  return (await response.json()) as Promise<T>;
};

export type ListCampaignsParams = Readonly<{
  readonly range: components['schemas']['CampaignDateRange'];
  readonly start?: string;
  readonly end?: string;
  readonly refresh?: boolean;
}>;

export const listCampaigns = async (
  baseUrl: string,
  accountId: string,
  params: ListCampaignsParams
): Promise<components['schemas']['ListCampaignsResponse']> => {
  const query = new URLSearchParams();
  query.set('range', params.range);
  if (params.start) query.set('start', params.start);
  if (params.end) query.set('end', params.end);
  if (params.refresh) query.set('refresh', 'true');

  const response = await fetch(
    `${baseUrl}${API_PREFIX}/accounts/${encodeURIComponent(accountId)}/campaigns?${query.toString()}`
  );
  return parseJsonOrThrow(response);
};
