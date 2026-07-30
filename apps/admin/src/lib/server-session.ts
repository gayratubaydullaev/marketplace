import { createSession } from "@gayrat/web-session/server";

export const session = createSession({ prefix: "ga", withGuest: false });
