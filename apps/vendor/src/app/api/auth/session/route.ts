import { NextRequest } from "next/server";
import { session } from "@/lib/server-session";

export async function GET(req: NextRequest) {
  const blocked = session.csrfReject(req);
  if (blocked) return blocked;
  return session.sessionProbe();
}

export async function DELETE(req: NextRequest) {
  const blocked = session.csrfReject(req);
  if (blocked) return blocked;
  return session.sessionLogout();
}
