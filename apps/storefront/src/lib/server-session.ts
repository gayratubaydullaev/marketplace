import { createSession } from "@gayrat/web-session/server";

export const session = createSession({ prefix: "gm", withGuest: true });

export const {
  proxyToBackend,
  sessionProbe,
  sessionLogout,
  clearAuthCookies,
  readSessionCookies,
  applyAuthCookies,
} = session;
