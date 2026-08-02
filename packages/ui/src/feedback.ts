/** Lightweight client helpers for ops panels (no React dependency). */

export type ApiErrorShape = {
  error?: string | { message?: string; code?: string };
  message?: string;
  detail?: string;
};

export function formatApiError(err: unknown, fallback = "Something went wrong"): string {
  if (err == null) return fallback;
  if (typeof err === "string") return err || fallback;
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "object") {
    const o = err as ApiErrorShape & Record<string, unknown>;
    if (typeof o.message === "string" && o.message) return o.message;
    if (typeof o.detail === "string" && o.detail) return o.detail;
    if (typeof o.error === "string" && o.error) return o.error;
    if (o.error && typeof o.error === "object" && typeof o.error.message === "string") {
      return o.error.message;
    }
  }
  return fallback;
}

export async function readApiError(res: Response, fallback = "Request failed"): Promise<string> {
  try {
    const data = await res.json();
    return formatApiError(data, `${fallback} (${res.status})`);
  } catch {
    return `${fallback} (${res.status})`;
  }
}
