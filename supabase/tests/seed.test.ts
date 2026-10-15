import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { engine } from "../../src/core/engine";
import { publicKeyFromB64u, verifyChain, type Receipt } from "../../src/core/receipts";
import { as, createDb } from "./harness";

describe("local seed (DEMO data)", () => {
  it("loads, labels everything DEMO and its receipts verify", async () => {
    const db = await createDb();
    await db.exec(readFileSync(path.join(__dirname, "..", "seed.sql"), "utf8"));
    const demo = { role: "authenticated" as const, id: "11111111-1111-4111-8111-111111111111", email: "demo@verfy.local" };
    const orgs = await as(db, demo, (q) => q<{ name: string }>("select name from public.orgs"));
    expect(orgs).toEqual([{ name: "Demo Org (DEMO)" }]);
    const device = (await as(db, demo, (q) => q<{ public_key: string; kid: string }>("select public_key, kid from public.devices")))[0]!;
    const bodies = await as(db, demo, (q) => q<{ body: Receipt }>("select body from public.receipts order by seq"));
    expect(verifyChain(bodies.map((b) => b.body), publicKeyFromB64u(device.public_key)).ok).toBe(true);
    const lock = (await as(db, demo, (q) => q<{ digest: string; definition: Record<string, unknown> }>("select digest, definition from public.locks")))[0]!;
    expect(await engine.toolPin(lock.definition)).toBe(lock.digest);
  });

  it("ships the sourced advisories as published", async () => {
    const db = await createDb();
    const rows = await as(db, { role: "anon" }, (q) => q<{ id: string; review_status: string }>("select id, review_status from public.advisories order by id"));
    expect(rows.map((r) => r.id)).toEqual(["ATLS-2025-0001", "ATLS-2025-0002", "ATLS-2025-0003", "ATLS-2025-0004"]);
    expect(rows.every((r) => r.review_status === "unreviewed")).toBe(true);
  });
});
