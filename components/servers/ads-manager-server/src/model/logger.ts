// Model definitions: Logger contract (function-only, so `interface` per typescript-standards).
// Structurally compatible with a pino child logger (`logger.info(obj, msg)`), so Controller can
// pass a pino child logger straight through without an adapter.
export interface Logger {
  readonly info: (obj: Record<string, unknown>, msg: string) => void;
  readonly warn: (obj: Record<string, unknown>, msg: string) => void;
  readonly error: (obj: Record<string, unknown>, msg: string) => void;
}
