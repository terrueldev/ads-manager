// Database: Connection factory using PostgreSQL
import { Pool, type PoolConfig } from 'pg';
import type pino from 'pino';

import type { Config } from '../config';

export type Database = {
  readonly connect: () => Promise<void>;
  readonly query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  readonly close: () => Promise<void>;
};

type DatabaseDependencies = Readonly<{
  readonly config: Config;
  readonly logger: pino.Logger;
}>;

export const createDatabase = (deps: DatabaseDependencies): Database => {
  const logger = deps.logger.child({ component: 'database' });

  // PostgreSQL connection pool, configured from Config (host/port/name/user/password/pool) —
  // see src/config/load_config.ts. The password is the only field sourced from an env var
  // (DB_PASSWORD); everything else comes from config.yaml.
  const poolConfig: PoolConfig = {
    host: deps.config.database.host,
    port: deps.config.database.port,
    database: deps.config.database.name,
    user: deps.config.database.user,
    password: deps.config.database.password,
    max: deps.config.database.pool,
  };

  const pool = new Pool(poolConfig);

  return {
    connect: async () => {
      // Test connection
      const client = await pool.connect();
      client.release();
      logger.info('Database connected');
    },
    query: async <T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> => {
      const result = await pool.query(sql, params);
      return { rows: result.rows as T[] };
    },
    close: async () => {
      await pool.end();
      logger.info('Database connection closed');
    },
  };
};
