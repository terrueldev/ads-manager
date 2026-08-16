// Model layer: thin fetch wrappers around the ads-manager-api contract's 5 endpoints
// (contracts/ads-manager-api/openapi.yaml). Every function takes `baseUrl` as an explicit
// parameter (sourced by callers from useAppConfig().apis['ads-manager-api'].base_url) rather than
// reading config itself — services stay plain, context-free functions; config access is a
// ViewModel/hook concern per frontend-standards.
import type { components } from '@ads-manager/contract';

const API_PREFIX = '/api/v1';

// Thrown for any non-2xx response that carries the contract's ErrorResponse shape, so callers
// (ViewModels/Models) can branch on `.code` — the same machine-readable code the server derived
// from SPEC.md's Error Handling table.
export class ApiError extends Error {
  readonly code: components['schemas']['Error']['code'];

  constructor(code: components['schemas']['Error']['code'], message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

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

export const startGoogleAdsOAuth = async (
  baseUrl: string
): Promise<components['schemas']['StartOAuthResponse']> => {
  const response = await fetch(`${baseUrl}${API_PREFIX}/oauth/google-ads/start`);
  return parseJsonOrThrow(response);
};

export type OAuthCallbackParams = Readonly<{
  readonly code?: string;
  readonly state?: string;
  readonly error?: string;
}>;

export const fetchOAuthCallback = async (
  baseUrl: string,
  params: OAuthCallbackParams
): Promise<components['schemas']['OAuthCallbackResponse']> => {
  const query = new URLSearchParams();
  if (params.code) query.set('code', params.code);
  if (params.state) query.set('state', params.state);
  if (params.error) query.set('error', params.error);

  const response = await fetch(`${baseUrl}${API_PREFIX}/oauth/google-ads/callback?${query.toString()}`);
  return parseJsonOrThrow(response);
};

export const listConnectedAccounts = async (
  baseUrl: string
): Promise<components['schemas']['ListAccountsResponse']> => {
  const response = await fetch(`${baseUrl}${API_PREFIX}/accounts`);
  return parseJsonOrThrow(response);
};

export const connectAccounts = async (
  baseUrl: string,
  customerIds: readonly string[]
): Promise<components['schemas']['ConnectAccountsResponse']> => {
  const requestBody: components['schemas']['ConnectAccountsRequest'] = { customer_ids: [...customerIds] };
  const response = await fetch(`${baseUrl}${API_PREFIX}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  return parseJsonOrThrow(response);
};

export const disconnectAccount = async (baseUrl: string, id: string): Promise<void> => {
  const response = await fetch(`${baseUrl}${API_PREFIX}/accounts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errorBody = await readErrorBody(response);
    if (errorBody?.error) {
      throw new ApiError(errorBody.error.code, errorBody.error.message);
    }
    throw new Error(`Request failed with status ${String(response.status)}`);
  }
};
