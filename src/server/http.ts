import "server-only";
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ConfigError } from "@/lib/env";
import { clientIp, screen } from "@/lib/shield";
import { log } from "./log";

/** RFC 9457 problem details. Never contains stack traces, SQL or configuration. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public title: string,
    public detail?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(title);
  }
}

export function problem(status: number, code: string, title: string, detail?: string, requestId?: string, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { type: `urn:verfy:problem:${code}`, title, status, code, ...(detail ? { detail } : {}), ...(requestId ? { request_id: requestId } : {}), ...extra },
    {
      status,
      headers: {
        "Content-Type": "application/problem+json",
        "Cache-Control": "no-store",
        ...(requestId ? { "x-request-id": requestId } : {}),
        ...(typeof extra?.retry_after_seconds === "number" ? { "Retry-After": String(extra.retry_after_seconds) } : {}),
      },
    },
  );
}

/** Map a Postgres / PostgREST error from a Verfy function to a safe API error. */
export function fromDbError(error: { code?: string; message?: string } | null | undefined): ApiError {
  const code = error?.code ?? "";
  const msg = (error?.message ?? "").slice(0, 200);
  switch (code) {
    case "28000":
      return new ApiError(401, "unauthenticated", "Sign in first.");
    case "42501":
      return new ApiError(403, "forbidden", "You do not have permission to do that.", safeDetail(msg));
    case "P0002":
      return new ApiError(404, "not_found", "Not found.", safeDetail(msg));
    case "22023":
    case "23514":
    case "22P02":
      return new ApiError(422, "invalid_request", "The request was not valid.", safeDetail(msg));
    case "23505":
      return new ApiError(409, "conflict", "That already exists.", safeDetail(msg));
    case "40001":
    case "55000":
      return new ApiError(409, "conflict", "The resource changed; reload and try again.", safeDetail(msg));
    case "54000":
      return new ApiError(429, "limit_reached", "A limit was reached.", safeDetail(msg));
    default:
      return new ApiError(500, "internal", "Something went wrong on our side.");
  }
}

// Only messages Verfy's own SQL functions raise are passed through; anything else stays generic.
const KNOWN_MESSAGES = [
  /^not signed in$/, /^permission denied( for this organization)?$/, /^[a-z ]+ not found$/, /^not a member$/,
  /^only an owner can change owners$/, /^an organization needs at least one owner$/, /^invite as admin, then transfer ownership$/,
  /^this invitation (is not valid any more|was sent to a different email address)$/, /^too many [a-z ]+$/, /^you already own 10 organizations$/,
  /^this lock was already decided$/, /^the export range must be positive and at most one year$/, /^a policy must be a JSON object under 64 KB$/,
  /^two-factor authentication required$/, /^invalid_enrollment_code$/, /^device_key_exists$/, /^device_not_active$/, /^chain_moved$/, /^chain_broken at seq \d+$/, /^export not pending$/,
];

function safeDetail(msg: string): string | undefined {
  return KNOWN_MESSAGES.some((re) => re.test(msg)) ? msg : undefined;
}

const SHIELD_TITLES = { 404: "Not found.", 405: "Method not allowed.", 414: "The URL is too long.", 429: "Too many requests. Slow down and try again later." } as const;
const SHIELD_CODES = { 404: "not_found", 405: "method_not_allowed", 414: "uri_too_long", 429: "rate_limited" } as const;

export interface RouteContext {
  requestId: string;
}

type Handler<P> = (request: NextRequest, ctx: RouteContext & { params: P }) => Promise<Response>;

/** Wrap a route handler: request id, safe errors, structured logging. */
export function route<P = Record<string, string>>(name: string, handler: Handler<P>) {
  return async (request: NextRequest, context: { params: Promise<P> }) => {
    const requestId = request.headers.get("x-vercel-id") ?? crypto.randomUUID();
    const started = Date.now();
    // the shield runs first: a flood from one address is refused before any database work
    const rejected = screen("api", { method: request.method, url: request.url, pathname: request.nextUrl.pathname, ip: clientIp(request.headers) });
    if (rejected) {
      log("warn", "shield", { route: name, status: rejected.status, reason: rejected.reason, request_id: requestId });
      return problem(rejected.status, SHIELD_CODES[rejected.status], SHIELD_TITLES[rejected.status], undefined, requestId, rejected.retryAfter ? { retry_after_seconds: rejected.retryAfter } : undefined);
    }
    try {
      const params = (await context?.params) ?? ({} as P);
      const res = await handler(request, { requestId, params });
      res.headers.set("x-request-id", requestId);
      log("info", "api", { route: name, method: request.method, status: res.status, ms: Date.now() - started, request_id: requestId });
      return res;
    } catch (e) {
      if (e instanceof ApiError) {
        log(e.status >= 500 ? "error" : "warn", "api", { route: name, method: request.method, status: e.status, code: e.code, request_id: requestId });
        return problem(e.status, e.code, e.title, e.detail, requestId, e.extra);
      }
      if (e instanceof ConfigError) {
        log("error", "config", { route: name, message: e.message, request_id: requestId });
        return problem(503, "not_configured", "This Verfy deployment is not fully configured.", undefined, requestId);
      }
      log("error", "api_unhandled", { route: name, method: request.method, error: e instanceof Error ? e.name : "unknown", request_id: requestId });
      return problem(500, "internal", "Something went wrong on our side.", undefined, requestId);
    }
  };
}

/**
 * CSRF defence for cookie-authenticated, state-changing requests: the browser
 * always sends Origin on cross-site POST/PUT/PATCH/DELETE, so it must match
 * this app's own origin.
 */
export function assertSameOrigin(request: NextRequest, appUrl: string): void {
  const origin = request.headers.get("origin");
  const allowed = new URL(appUrl).origin;
  const self = request.nextUrl.origin;
  if (!origin || (origin !== allowed && origin !== self)) {
    throw new ApiError(403, "bad_origin", "Cross-site request refused.");
  }
}

/** Read and validate a JSON body with a hard byte limit. */
export async function readJson<T extends z.ZodTypeAny>(request: NextRequest, schema: T, maxBytes: number): Promise<z.infer<T>> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "unsupported_media_type", "Send application/json.");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new ApiError(413, "payload_too_large", `The body is larger than ${maxBytes} bytes.`);
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, "payload_too_large", `The body is larger than ${maxBytes} bytes.`);
      }
      chunks.push(value);
    }
  }
  let data: unknown;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "invalid_json", "The body is not valid JSON.");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(422, "invalid_request", "The request was not valid.", `${issue?.path.join(".") || "body"}: ${issue?.message ?? "invalid"}`);
  }
  return parsed.data;
}

/** Validate query parameters. */
export function readQuery<T extends z.ZodTypeAny>(request: NextRequest, schema: T): z.infer<T> {
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(422, "invalid_request", "The query was not valid.", `${issue?.path.join(".") || "query"}: ${issue?.message ?? "invalid"}`);
  }
  return parsed.data;
}

/** A salted hash of the client IP, so rate limits never store raw addresses. */
export function ipHash(request: NextRequest | Headers, salt: string): string {
  const headers = request instanceof Headers ? request : request.headers;
  return createHash("sha256").update(salt + "|" + clientIp(headers)).digest("hex").slice(0, 32);
}

export const uuid = z.string().uuid();
