// Use-case: FR1 — start the Google Ads OAuth connection flow.
// Generates a CSRF-protection `state`, stashes it server-side, and returns the Google consent
// screen URL the frontend should redirect the user to (GET /oauth/google-ads/start).
import type { Dependencies } from '../dependencies';

export type StartOAuthFlowResult = Readonly<{
  readonly authorizationUrl: string;
}>;

export const startOAuthFlow = (deps: Dependencies): StartOAuthFlowResult => {
  const state = deps.generateOAuthState();
  deps.saveOAuthState(state);
  const authorizationUrl = deps.buildAuthorizationUrl(state);
  return { authorizationUrl };
};
