import { describe, expect, it } from "vitest";
import { decodeAttempt, encodeAttempt, googleAuthUrl, newAttempt, sameState, sha256Hex } from "./google-signin";

describe("Google sign-in", () => {
  it("round-trips an attempt through the cookie value", () => {
    const a = newAttempt("/dashboard");
    expect(decodeAttempt(encodeAttempt(a))).toEqual(a);
    expect(a.state).not.toEqual(a.nonce);
  });

  it("rejects missing, oversized or malformed cookie values", () => {
    expect(decodeAttempt(undefined)).toBeNull();
    expect(decodeAttempt("x".repeat(2000))).toBeNull();
    expect(decodeAttempt("not-json")).toBeNull();
    expect(decodeAttempt(Buffer.from(JSON.stringify({ state: 1 })).toString("base64url"))).toBeNull();
  });

  it("compares state exactly", () => {
    expect(sameState("abc", "abc")).toBe(true);
    expect(sameState("abc", "abd")).toBe(false);
    expect(sameState("abc", "abcd")).toBe(false);
  });

  it("sends Google the nonce hash, never the nonce, and returns to this app", () => {
    const a = { state: "s1", nonce: "raw-nonce", next: "/dashboard" };
    const u = new URL(googleAuthUrl("123-abc.apps.googleusercontent.com", "https://app.test", a));
    expect(u.origin).toBe("https://accounts.google.com");
    expect(u.searchParams.get("redirect_uri")).toBe("https://app.test/auth/google");
    expect(u.searchParams.get("response_type")).toBe("id_token");
    expect(u.searchParams.get("response_mode")).toBe("form_post");
    expect(u.searchParams.get("prompt")).toBe("select_account");
    expect(u.searchParams.get("state")).toBe("s1");
    expect(u.searchParams.get("nonce")).toBe(sha256Hex("raw-nonce"));
    expect(u.toString()).not.toContain("raw-nonce");
  });
});
