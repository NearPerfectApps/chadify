// Tracks whether a sign-in with a real provider (Apple/Google) is in flight.
// RootNavigator uses this to suppress its anonymous auto-sign-in fallback
// during the brief unauthenticated window between signOut() and signIn(...).
let inFlight = 0;

export const providerSignInFlow = {
  begin: () => { inFlight += 1; },
  end: () => { inFlight = Math.max(0, inFlight - 1); },
  isActive: () => inFlight > 0,
};
