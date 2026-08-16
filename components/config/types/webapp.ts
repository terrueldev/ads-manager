// Webapp config type - extend as needed
// Import this type in your webapp component for type-safe config access

export type WebappConfig = Readonly<{
  apis?: Readonly<Record<string, Readonly<{ base_url: string }>>>;
}>;
