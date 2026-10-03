import type { z } from "zod";

export const API_BASE = "/api/v1";

export class ApiError extends Error {
  readonly status: number;
  readonly requestId: string | null;

  constructor(status: number, message: string, requestId: string | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
  }
}

// FastAPI error bodies: {"detail": "msg"} or {"detail": [{"msg": ...}, ...]} for 422s.
function extractDetail(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("detail" in body)) return null;
  const { detail } = body;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: unknown) => (typeof d === "object" && d !== null && "msg" in d ? String(d.msg) : ""))
      .filter(Boolean)
      .join("; ");
  }
  return null;
}

function newRequestId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

/**
 * fetch + zod validation. Every call sends an X-Request-ID so a failure the user reports
 * (the id is shown in the error message) lines up with the backend log line.
 */
export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const requestId = newRequestId();
  const headers = new Headers(init.headers);
  headers.set("X-Request-ID", requestId);
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const detail = extractDetail(body) ?? res.statusText;
    throw new ApiError(res.status, detail, res.headers.get("X-Request-ID") ?? requestId);
  }
  return schema.parse(body);
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.requestId ? `${err.message} (ref ${err.requestId})` : err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
