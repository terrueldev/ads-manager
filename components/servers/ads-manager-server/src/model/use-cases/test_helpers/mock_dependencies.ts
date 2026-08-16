// Shared test fixture: builds a fully-stubbed Dependencies object for use-case unit tests, per
// the unit-testing skill's "Dependency Injection Mocks" pattern. Every field has a safe default
// (no-op / empty result) so tests only need to override what they actually exercise.
import { vi } from 'vitest';
import type { Dependencies } from '../../dependencies';

export const createMockDependencies = (overrides?: Partial<Dependencies>): Dependencies => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },

  generateOAuthState: () => 'mock-state',
  saveOAuthState: vi.fn(),
  consumeOAuthState: () => true,
  savePendingTokens: vi.fn(),
  getPendingTokens: () => undefined,
  clearPendingTokens: vi.fn(),

  buildAuthorizationUrl: (state) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
  exchangeOAuthCode: async () => ({
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    scope: 'https://www.googleapis.com/auth/adwords',
  }),

  listAccessibleCustomerIds: async () => [],
  fetchCustomerMetadata: async () => ({
    accountName: 'Mock Account',
    currencyCode: 'BRL',
    timezone: 'America/Sao_Paulo',
  }),

  encryptRefreshToken: (plain) => `encrypted(${plain})`,

  findConnectedAccountByCustomerId: async () => null,
  findConnectedAccountById: async () => null,
  findAllConnectedAccounts: async () => [],
  createConnectedAccount: async (input) => ({
    id: 'mock-id',
    googleCustomerId: input.googleCustomerId,
    accountName: input.accountName,
    currencyCode: input.currencyCode,
    timezone: input.timezone,
    status: 'active',
    connectedAt: new Date('2026-01-01T00:00:00.000Z'),
  }),
  deleteConnectedAccount: async () => true,
  updateConnectedAccountStatus: async () => null,
  reconnectConnectedAccount: async () => null,

  findCampaignMetricsCache: async () => [],
  upsertCampaignMetricsCache: async () => undefined,
  fetchCampaignMetricsFromGoogleAds: async () => ({ ok: true, campaigns: [] }),
  now: () => new Date('2026-08-16T12:00:00.000Z'),

  ...overrides,
});
