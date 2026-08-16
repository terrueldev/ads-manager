// HTTP Server: Express application setup and lifecycle
// Isolates all HTTP/Express concerns from app orchestration
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import type { Server } from 'node:http';
import type { Controller } from '../controller';

export type HttpServerDependencies = Readonly<{
  readonly controller: Controller;
}>;

export type HttpServer = Readonly<{
  readonly start: (port: number) => Promise<void>;
  readonly stop: () => Promise<void>;
}>;

export const createHttpServer = (deps: HttpServerDependencies): HttpServer => {
  const { controller } = deps;

  let server: Server | null = null;
  const app: Express = express();

  // Middleware
  app.use(express.json());

  // CORS: the webapp (components/webapps/ads-manager-webapp) calls this API's absolute base_url
  // directly (components/config's apis.ads-manager-api.base_url), from its OWN origin/port — e.g.
  // http://localhost:5173 calling http://localhost:3000 in local dev — so this is a genuine
  // cross-origin request from a real browser, not same-origin. Permissive (reflects any origin,
  // no credentials) is acceptable per SPEC.md's single-user/no-auth model: there is no session
  // cookie or Authorization header this could leak, and every response body is already scoped to
  // "what's safe to hand to any caller" (e.g. never a token — see Security Considerations).
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin ?? '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Mount API routes
  app.use('/api/v1', controller.router);

  // Error handling middleware
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });

  const start = async (port: number): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      server = app.listen(port, () => {
        resolve();
      });
      server.on('error', reject);
    });
  };

  const stop = async (): Promise<void> => {
    if (!server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      server!.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
    server = null;
  };

  return { start, stop };
};
