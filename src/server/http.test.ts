import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError, assertSameOrigin, fromDbError, problem, readJson, route } from "./http";
import { redactForLog } from "./log";
import { isDeviceToken, newDeviceToken, sha256Hex } from "./device-auth";

const req = (body: string, headers: Record<string, string> = {}, url = "https://atls.test/api/v1/x") =>
  new NextRequest(url, { method: "POST", body, headers: { "content-type": "application/json", ...headers } });

describe("error mapping", () => {
  it("maps SQLSTATE codes to safe HTTP problems", () => {
    expect(fromDbError({ code: "42501", message: "permission denied for this organization" })).toMatchObject({ status: 403, detail: "permission denied for this organization" });
    expect(fromDbError({ code: "28000", message: "not signed in" }).status).toBe(401);
    expect(fromDbError({ code: "P0002", message: "lock not found" }).status).toBe(404);
    expect(fromDbError({ code: "54000", message: "too many open enrollment codes" }).status).toBe(429);
    expect(fromDbError({ code: "40001", message: "chain_moved" }).status).toBe(409);
  });

  it("never passes through unknown database messages", () => {
    const e = fromDbError({ code: "42501", message: 'permission denied for table receipts (select * from "receipts" where org_id = 7)' });
    expect(e.detail).toBeUndefined();
    const internal = fromDbError({ code: "XX000", message: "connection to 10.0.0.5 failed: password=hunter2" });
    expect(internal).toMatchObject({ status: 500, detail: undefined });
    expect(internal.title).not.toMatch(/hunter2|10\.0\.0\.5/);
  });

  it("problem responses are RFC 9457 JSON and carry no stack", async () => {
    const res = problem(422, "invalid_request", "Bad", "x", "req-1");
    expect(res.headers.get("content-type")).toBe("application/problem+json");
    const body = await res.json();
    expect(body).toEqual({ type: "urn:atls:problem:invalid_request", title: "Bad", status: 422, code: "invalid_request", detail: "x", request_id: "req-1" });
  });

  it("the route wrapper turns unexpected exceptions into a generic 500", async () => {
    const handler = route("t", async () => {
      throw new Error("SELECT secret FROM vault");
    });
    const res = await handler(req("{}"), { params: Promise.resolve({}) });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toMatch(/SELECT|vault|Error:/);
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("the route wrapper keeps ApiError status and code", async () => {
    const handler = route("t", async () => {
      throw new ApiError(429, "rate_limited", "Too many requests.");
    });
    const res = await handler(req("{}"), { params: Promise.resolve({}) });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("rate_limited");
  });
});

describe("request validation", () => {
  const schema = z.object({ a: z.number() }).strict();

  it("accepts valid JSON within the limit", async () => {
    expect(await readJson(req('{"a":1}'), schema, 100)).toEqual({ a: 1 });
  });

  it("rejects wrong content type, oversize bodies, bad JSON and unknown fields", async () => {
    await expect(readJson(req('{"a":1}', { "content-type": "text/plain" }), schema, 100)).rejects.toMatchObject({ status: 415 });
    await expect(readJson(req(JSON.stringify({ a: 1, pad: "x".repeat(500) })), schema, 100)).rejects.toMatchObject({ status: 413 });
    await expect(readJson(req("{not json"), schema, 100)).rejects.toMatchObject({ status: 400 });
    await expect(readJson(req('{"a":1,"org_id":"other"}'), schema, 100)).rejects.toMatchObject({ status: 422 });
  });

  it("refuses cross-site state changes (CSRF)", () => {
    expect(() => assertSameOrigin(req("{}", { origin: "https://atls.test" }), "https://atls.test")).not.toThrow();
    expect(() => assertSameOrigin(req("{}", { origin: "https://evil.example" }), "https://atls.test")).toThrow(ApiError);
    expect(() => assertSameOrigin(req("{}"), "https://atls.test")).toThrow(ApiError);
  });
});

describe("device tokens and logs", () => {
  it("device tokens are 32 random bytes and only their hash is stored", () => {
    const a = newDeviceToken();
    const b = newDeviceToken();
    expect(isDeviceToken(a.token)).toBe(true);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(sha256Hex(a.token));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(isDeviceToken("atd_short")).toBe(false);
    expect(isDeviceToken(null)).toBe(false);
  });

  it("log redaction removes secrets, tokens and arguments", () => {
    const out = JSON.stringify(
      redactForLog({
        route: "x",
        authorization: "Bearer atd_" + "a".repeat(43),
        nested: { password: "hunter2", note: "token atd_" + "b".repeat(43) + " and sb_secret_abcdef123" },
        arguments: { command: "cat ~/.ssh/id_rsa" },
        email: "a@b.c",
      }),
    );
    expect(out).not.toMatch(/hunter2|atd_a|atd_b|sb_secret_abc|id_rsa|a@b\.c/);
    expect(out).toContain("[REDACTED]");
  });
});
