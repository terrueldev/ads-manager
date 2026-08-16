// Server config type - extend as needed
// Import this type in your server component for type-safe config access

export type ServerConfig = Readonly<{
  port?: number;
  probesPort?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  database?: Readonly<{
    host?: string;
    port?: number;
    name?: string;
    user?: string;
    passwordSecret?: string;
    pool?: number;
  }>;
  // Google Ads Connection (see changes/.../google-ads-connection/SPEC.md). Placeholders only —
  // real values always come from env vars, read exclusively in src/config/load_config.ts.
  googleOAuth?: Readonly<{
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
  }>;
  googleAds?: Readonly<{
    developerToken?: string;
  }>;
  // tokenEncryptionKey is intentionally NOT part of this yaml-backed shape — it is sourced only
  // from the TOKEN_ENCRYPTION_KEY env var directly in load_config.ts, never from config.yaml.
}>;
