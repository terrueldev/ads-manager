import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import dotenv from 'dotenv';

// Config type - components should define their own specific types in @{project}/config/types
// and import them via workspace dependency.
//
// All fields are required (non-optional) here: loadConfig() below always fills in a default or
// an env-sourced value, so every other layer can rely on a fully-populated Config without
// `?? default` scattered across the codebase (this also fixes the pre-Phase-4 "possibly
// undefined" typecheck errors on port/probesPort).
export type Config = Readonly<{
  readonly port: number;
  readonly probesPort: number;
  readonly logLevel: string;
  readonly database: Readonly<{
    readonly host: string;
    readonly port: number;
    readonly name: string;
    readonly user: string;
    // Real DB password — sourced from DB_PASSWORD env var only, never from config.yaml (which
    // only carries `passwordSecret`, a reference to where the value is managed, e.g. a k8s Secret
    // name). See backend-standards: Config layer is the only place allowed to read process.env.
    readonly password: string;
    readonly pool: number;
  }>;
  // Google Ads Connection (see changes/2026/08/15/.../google-ads-connection/SPEC.md > Dependencies).
  // These three groups are a pending manual setup prerequisite (Google Cloud project + OAuth
  // client + Google Ads developer token). Until that's done, env vars are unset and these fields
  // are empty strings — the server still starts and typechecks; only the actual OAuth/Google Ads
  // calls fail (with a clear error from Google's own SDKs) until real values are provided.
  readonly googleOAuth: Readonly<{
    readonly clientId: string;
    readonly clientSecret: string;
    readonly redirectUri: string;
  }>;
  readonly googleAds: Readonly<{
    readonly developerToken: string;
  }>;
  // Symmetric key (32 bytes, base64-encoded) used to encrypt OAuth refresh tokens at rest
  // (src/model/token_crypto.ts). Sourced ONLY from TOKEN_ENCRYPTION_KEY — never given a default
  // or placeholder value anywhere, since that would defeat the point of "never hardcode a secret".
  readonly tokenEncryptionKey: string;
  // Test/dev-only escape hatch (Phase 6 — Integration & E2E Testing): when true, the Controller
  // wires in the deterministic mock adapters (src/controller/google_ads/create_mock_*.ts) instead
  // of the real google-auth-library/google-ads-api ones. Exists solely because there is no real
  // Google Cloud OAuth client/developer token yet (pending manual setup, see SPEC.md >
  // Dependencies) — it lets integration/E2E tests exercise the full OAuth → selection →
  // persistence flow deterministically. Sourced ONLY from MOCK_GOOGLE_ADS env var (never from
  // config.yaml, same reasoning as tokenEncryptionKey: a flag this consequential should never be
  // silently committed as "on"). Defaults to false everywhere it isn't explicitly set.
  readonly mockGoogleAds: boolean;
}>;

// Loose shape of whatever the YAML file actually contains for this component's section — every
// field optional, since the yaml may omit any of them (loadConfig fills in defaults/env values).
type RawConfig = Readonly<{
  readonly port?: number;
  readonly probesPort?: number;
  readonly logLevel?: string;
  readonly database?: Readonly<{
    readonly host?: string;
    readonly port?: number;
    readonly name?: string;
    readonly user?: string;
    readonly pool?: number;
  }>;
  readonly googleOAuth?: Readonly<{
    readonly clientId?: string;
    readonly clientSecret?: string;
    readonly redirectUri?: string;
  }>;
  readonly googleAds?: Readonly<{
    readonly developerToken?: string;
  }>;
}>;

const DEFAULT_PORT = 3000;
const DEFAULT_PROBES_PORT = 9090;
const DEFAULT_LOG_LEVEL = 'info';
const DEFAULT_DB_HOST = 'localhost';
const DEFAULT_DB_PORT = 5432;
const DEFAULT_DB_NAME = 'ads_manager';
const DEFAULT_DB_USER = 'app';
const DEFAULT_DB_POOL = 10;

export const loadConfig = (): Config => {
  // dotenv is mandatory per backend-standards and MUST be called inside loadConfig(), not at
  // module load time, so importing this module never has side effects on its own.
  dotenv.config();

  const configPath = process.env.SDD_CONFIG_PATH;
  if (!configPath) {
    throw new Error('SDD_CONFIG_PATH environment variable is required');
  }

  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const raw = parse(readFileSync(configPath, 'utf-8')) as RawConfig;

  // Validate against schema if present (schema placed alongside config by the system CLI)
  const schemaPath = configPath.replace(/\.yaml$/, '.schema.json');
  if (existsSync(schemaPath)) {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf-8')) as object;
    const ajv = new Ajv2020();
    const validate = ajv.compile(schema);
    if (!validate(raw)) {
      throw new Error(`Config validation failed: ${JSON.stringify(validate.errors)}`);
    }
  }

  return {
    port: raw.port ?? DEFAULT_PORT,
    probesPort: raw.probesPort ?? DEFAULT_PROBES_PORT,
    logLevel: raw.logLevel ?? DEFAULT_LOG_LEVEL,
    database: {
      host: raw.database?.host ?? DEFAULT_DB_HOST,
      port: raw.database?.port ?? DEFAULT_DB_PORT,
      name: raw.database?.name ?? DEFAULT_DB_NAME,
      user: raw.database?.user ?? DEFAULT_DB_USER,
      password: process.env.DB_PASSWORD ?? '',
      pool: raw.database?.pool ?? DEFAULT_DB_POOL,
    },
    googleOAuth: {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? raw.googleOAuth?.clientId ?? '',
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? raw.googleOAuth?.clientSecret ?? '',
      redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI ?? raw.googleOAuth?.redirectUri ?? '',
    },
    googleAds: {
      developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? raw.googleAds?.developerToken ?? '',
    },
    tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? '',
    mockGoogleAds: process.env.MOCK_GOOGLE_ADS === 'true',
  };
};
