import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/server-session";

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  if (!path?.length) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  // Block path traversal and internal-only segments
  if (path.some((p) => p.includes("..") || p === "" || p.includes("\\"))) {
    return Response.json({ error: "bad path" }, { status: 400 });
  }
  return proxyToBackend(req, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
