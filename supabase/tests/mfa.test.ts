import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { addUser, as, createDb, type Actor } from "./harness";

/**
 * Two-factor authentication is enforced by the database: once a user has a verified factor, a session that only
 * passed the password step (aal1) sees no organization data and cannot change anything, even through the Data API.
 */

const ids = {
  alice: "00000000-0000-4000-8000-0000000000a1",
  bob: "00000000-0000-4000-8000-0000000000b1",
};

let db: PGlite;
let alice: Actor, bob: Actor;
let orgA: string, orgB: string;

const factor = (user: string, status: "verified" | "unverified", id: string) =>
  db.query("insert into auth.mfa_factors (id, user_id, status) values ($1, $2, $3)", [id, user, status]);

beforeAll(async () => {
  db = await createDb();
  alice = await addUser(db, ids.alice, "alice@mfa.test");
  bob = await addUser(db, ids.bob, "bob@mfa.test");
  orgA = (await as(db, alice, (q) => q<{ id: string }>("select public.create_org('Org A', 'mfa-a') as id")))[0]!.id;
  orgB = (await as(db, bob, (q) => q<{ id: string }>("select public.create_org('Org B', 'mfa-b') as id")))[0]!.id;
});

describe("MFA enforced by RLS", () => {
  it("without a factor, a password-only session works as before", async () => {
    const orgs = await as(db, alice, (q) => q("select id from public.orgs"));
    expect(orgs.map((o) => o.id)).toEqual([orgA]);
    expect((await as(db, alice, (q) => q<{ r: boolean }>("select public.mfa_required() as r")))[0]!.r).toBe(false);
  });

  it("with a verified factor, an aal1 session sees nothing and changes nothing", async () => {
    await factor(ids.alice, "verified", "00000000-0000-4000-8000-00000000f001");
    expect((await as(db, alice, (q) => q<{ r: boolean }>("select public.mfa_required() as r")))[0]!.r).toBe(true);
    for (const table of ["orgs", "memberships", "policies", "receipts", "devices", "locks", "audit_log"]) {
      expect(await as(db, alice, (q) => q(`select 1 from public.${table}`))).toEqual([]);
    }
    // teammates' profiles are hidden too; the user's own profile stays readable
    expect((await as(db, alice, (q) => q<{ id: string }>("select id from public.profiles"))).map((p) => p.id)).toEqual([ids.alice]);
    await expect(as(db, alice, (q) => q("select public.create_device_enrollment($1)", [orgA]))).rejects.toThrow(/two-factor authentication required/);
    await expect(as(db, alice, (q) => q("select public.publish_policy($1, '{}'::jsonb, 'x')", [orgA]))).rejects.toThrow(/two-factor authentication required/);
    await expect(as(db, alice, (q) => q("select public.org_stats($1)", [orgA]))).rejects.toThrow(/permission denied/);
  });

  it("after the second step (aal2), everything is back", async () => {
    const aal2 = { ...alice, aal: "aal2" as const };
    expect((await as(db, aal2, (q) => q<{ r: boolean }>("select public.mfa_required() as r")))[0]!.r).toBe(false);
    expect((await as(db, aal2, (q) => q("select id from public.orgs"))).map((o) => o.id)).toEqual([orgA]);
    const code = await as(db, aal2, (q) => q<{ c: string }>("select public.create_device_enrollment($1) as c", [orgA]));
    expect(code[0]!.c).toMatch(/^atle_[0-9a-f]{64}$/);
  });

  it("an unverified (abandoned) enrollment does not lock anyone out", async () => {
    await factor(ids.bob, "unverified", "00000000-0000-4000-8000-00000000f002");
    expect((await as(db, bob, (q) => q("select id from public.orgs"))).map((o) => o.id)).toEqual([orgB]);
  });

  it("a forged aal claim cannot be set by the client: only the signed JWT carries it", async () => {
    // In production PostgREST takes request.jwt.claims from the verified JWT; this test documents that the check
    // reads exactly that claim and nothing a client could send separately.
    const def = await db.query<{ src: string }>("select prosrc as src from pg_proc where proname = 'mfa_ok'");
    expect(def.rows[0]!.src).toContain("auth.jwt() ->> 'aal'");
  });
});
