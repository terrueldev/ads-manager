import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { Layout } from '@/components';
import { HomePage, ContasPage, ContasCallbackPage, DashboardPage } from '@/pages';

// Search params Google appends when redirecting the browser back to /contas/callback (see
// pages/contas_callback_page/contas_callback_page.tsx for the full design-decision writeup on why
// this webapp route — not the server — is the OAuth redirect_uri target).
type ContasCallbackSearch = Readonly<{
  readonly code?: string;
  readonly state?: string;
  readonly error?: string;
}>;

const validateContasCallbackSearch = (search: Record<string, unknown>): ContasCallbackSearch => ({
  code: typeof search.code === 'string' ? search.code : undefined,
  state: typeof search.state === 'string' ? search.state : undefined,
  error: typeof search.error === 'string' ? search.error : undefined,
});

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- AppRouter derives via ReturnType<>; explicit annotation would be circular
export const createAppRouter = () => {
  const rootRoute = createRootRoute({
    component: Layout,
  });

  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: HomePage,
  });

  const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    component: DashboardPage,
  });

  const contasRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/contas',
    component: ContasPage,
  });

  const contasCallbackRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/contas/callback',
    validateSearch: validateContasCallbackSearch,
    component: ContasCallbackPage,
  });

  const routeTree = rootRoute.addChildren([homeRoute, dashboardRoute, contasRoute, contasCallbackRoute]);

  return createRouter({ routeTree });
};

export type AppRouter = ReturnType<typeof createAppRouter>;

// Register the router for type-safe route paths in Link, useNavigate, useParams, etc.
declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
