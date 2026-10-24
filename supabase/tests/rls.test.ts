import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import vectors from "../../verfy-cli/tests/fixtures/receipts.json";
import { planIngest, type ReceiptRow } from "../../src/core/ingest";
import { publicKeyFromB64u } from "../../src/core/receipts";
import { addUser, anon, as, createDb, service, type Actor } from "./harness";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const ids = {
  alice: "00000000-0000-4000-8000-00000000000a",
  bob: "00000000-0000-4000-8000-00000000000b",
  carol: "00000000-0000-4000-8000-00000000000c",
  dave: "00000000-0000-4000-8000-00000000000d",
  erin: "00000000-0000-4000-8000-00000000000e",
};

let db: PGlite;
let alice: Actor, bob: Actor, carol: Actor, dave: Actor, erin: Actor;
let orgA: string, orgB: string, deviceA: string;
let rows: ReceiptRow[];

async function expectDenied(p: Promise<unknown>, pattern: RegExp = /permission denied|violates row-level security|append-only|not allowed/i) {
  await expect(p).rejects.toThrow(pattern);
}

beforeAll(async () => {
  db = await createDb();
  alice = await addUser(db, ids.alice, "alice@a.test");
  bob = await addUser(db, ids.bob, "bob@b.test");
  carol = await addUser(db, ids.carol, "carol@a.test");
  dave = await addUser(db, ids.dave, "dave@a.test");
  erin = await addUser(db, ids.erin, "erin@a.test");
  orgA = (await as(db, alice, (q) => q<{ id: string }>("select public.create_org('Org A', 'org-a') as id")))[0]!.id;
  orgB = (await as(db, bob, (q) => q<{ id: string }>("select public.create_org('Org B', 'org-b') as id")))[0]!.id;

  // Alice enrolls a device; the server (service_role) redeems the code.
  const code = (await as(db, alice, (q) => q<{ c: string }>("select public.create_device_enrollment($1) as c", [orgA])))[0]!.c;
  const enrolled = await as(db, service, (q) =>
    q<{ r: { device_id: string } }>("select public.enroll_device($1, 'laptop', 'test', $2, $3, $4) as r", [sha(code), vectors.kid, vectors.public_key, sha("atd_token_a")]),
  );
  deviceA = enrolled[0]!.r.device_id;
  const plan = planIngest({ lastSeq: -1, lastHash: null }, new Map(), vectors.receipts, publicKeyFromB64u(vectors.public_key), new Date("2026-10-11T10:00:00Z"));
  if (!plan.ok) throw new Error(plan.detail);
  rows = plan.rows;
  await as(db, service, (q) => q("select public.ingest_receipts($1, -1, $2::jsonb)", [deviceA, JSON.stringify(rows.slice(0, 2))]));
  await as(db, service, (q) => q("select public.propose_lock($1, 'github', 'create_issue', $2, $3::jsonb)", [deviceA, "sha256:" + "a".repeat(64), JSON.stringify({ name: "create_issue" })]));

  // Carol joins org A as auditor, Dave as member.
  for (const [user, role] of [[carol, "auditor"], [dave, "member"]] as const) {
    const token = (await as(db, alice, (q) => q<{ t: string }>("select public.create_invitation($1, $2, $3) as t", [orgA, user.email, role])))[0]!.t;
    await as(db, user, (q) => q("select public.accept_invitation($1)", [token]));
  }
});

describe("tenant isolation", () => {
  it("each user sees only their own organization", async () => {
    expect(await as(db, alice, (q) => q("select id from public.orgs"))).toEqual([{ id: orgA }]);
    expect(await as(db, bob, (q) => q("select id from public.orgs"))).toEqual([{ id: orgB }]);
  });

  it("other organizations' receipts, devices, policies, locks and audit rows are invisible by id", async () => {
    for (const table of ["receipts", "devices", "policies", "locks", "audit_log", "chains", "memberships", "exports"]) {
      const seen = await as(db, bob, (q) => q(`select count(*)::int as n from public.${table} where org_id = $1`, [orgA]));
      expect(seen, table).toEqual([{ n: 0 }]);
    }
    expect((await as(db, alice, (q) => q<{ n: number }>("select count(*)::int as n from public.receipts where org_id = $1", [orgA])))[0]!.n).toBe(2);
  });

  it("functions refuse to act on another organization", async () => {
    await expectDenied(as(db, bob, (q) => q("select public.publish_policy($1, '{}'::jsonb, 'x')", [orgA])));
    await expectDenied(as(db, bob, (q) => q("select public.revoke_device($1)", [deviceA])));
    await expectDenied(as(db, bob, (q) => q("select public.create_device_enrollment($1)", [orgA])));
    await expectDenied(as(db, bob, (q) => q("select public.org_stats($1)", [orgA])));
    await expectDenied(as(db, bob, (q) => q("select public.start_export($1, now() - interval '1 day', now(), '{}')", [orgA])));
    const lock = (await as(db, alice, (q) => q<{ id: string }>("select id from public.locks limit 1")))[0]!.id;
    await expectDenied(as(db, bob, (q) => q("select public.decide_lock($1, true, null)", [lock])));
  });

  it("device tokens and rate-limit rows are never readable by clients", async () => {
    await expectDenied(as(db, alice, (q) => q("select * from public.device_tokens")));
    await expectDenied(as(db, alice, (q) => q("select * from public.rate_limits")));
  });

  it("the waitlist is written by the server only, and checks what it stores", async () => {
    await expectDenied(as(db, anon, (q) => q("select * from public.waitlist")));
    await expectDenied(as(db, alice, (q) => q("select * from public.waitlist")));
    await expectDenied(as(db, anon, (q) => q("insert into public.waitlist (email) values ('x@y.test')")));
    const add = (email: string, agents = "{cursor}") =>
      as(db, service, (q) => q("insert into public.waitlist (email, team_size, agents) values ($1, '2-10', $2) on conflict (email) do nothing", [email, agents]));
    await add("lead@team.test");
    await add("lead@team.test"); // the same address joins once
    const rows = await as(db, service, (q) => q<{ n: number }>("select count(*)::int as n from public.waitlist where email = 'lead@team.test'"));
    expect(rows[0]!.n).toBe(1);
    await expect(add("Lead@Team.test")).rejects.toThrow(/check constraint/);
    await expect(add("not-an-email")).rejects.toThrow(/check constraint/);
    await expect(add("x@y.test", "{cursor,doom}")).rejects.toThrow(/check constraint/);
  });
});

describe("no direct writes from clients", () => {
  it("blocks inserts, updates and deletes on evidence tables", async () => {
    await expectDenied(as(db, alice, (q) => q("insert into public.orgs (name, slug) values ('x', 'xx-x')")));
    await expectDenied(as(db, alice, (q) => q("update public.policies set body = '{}' where org_id = $1", [orgA])));
    await expectDenied(as(db, alice, (q) => q("delete from public.receipts where org_id = $1", [orgA])));
    await expectDenied(as(db, alice, (q) => q("insert into public.memberships (org_id, user_id, role) values ($1, $2, 'owner')", [orgA, ids.bob])));
    await expectDenied(as(db, bob, (q) => q("insert into public.memberships (org_id, user_id, role) values ($1, $2, 'owner')", [orgA, ids.bob])));
    await expectDenied(as(db, alice, (q) => q("update public.profiles set email = 'x@y.z' where id = $1", [ids.alice])));
  });

  it("clients cannot call server-only functions", async () => {
    for (const fn of [
      "public.ingest_receipts('00000000-0000-0000-0000-000000000000', -1, '[]')",
      "public.device_for_token('x')",
      "public.rate_limit_hit('x', 60, 1)",
      "public.write_audit(gen_random_uuid(), null, null, 'a.b', null, '{}')",
      "public.enroll_device('x','x','x','x','x','x')",
    ]) {
      await expectDenied(as(db, alice, (q) => q(`select ${fn}`)));
      await expectDenied(as(db, anon, (q) => q(`select ${fn}`)));
    }
  });

  it("even the server cannot edit stored receipts or the audit log", async () => {
    await expectDenied(as(db, service, (q) => q("update public.receipts set verdict = 'allow'")));
    await expectDenied(as(db, service, (q) => q("delete from public.audit_log")));
    await expectDenied(as(db, service, (q) => q("update public.policies set note = 'x'")));
  });
});

describe("roles", () => {
  it("auditors read receipts and the audit log but cannot change anything", async () => {
    expect((await as(db, carol, (q) => q<{ n: number }>("select count(*)::int as n from public.receipts")))[0]!.n).toBe(2);
    expect((await as(db, carol, (q) => q<{ n: number }>("select count(*)::int as n from public.audit_log")))[0]!.n).toBeGreaterThan(3);
    await expectDenied(as(db, carol, (q) => q("select public.publish_policy($1, '{}'::jsonb, null)", [orgA])));
    await expectDenied(as(db, carol, (q) => q("select public.revoke_device($1)", [deviceA])));
    await expectDenied(as(db, carol, (q) => q("select public.create_invitation($1, 'x@a.test', 'member')", [orgA])));
    const exp = await as(db, carol, (q) => q<{ id: string }>("select public.start_export($1, now() - interval '7 days', now(), '{}') as id", [orgA]));
    expect(exp[0]!.id).toMatch(/[0-9a-f-]{36}/);
  });

  it("members read receipts but not the audit log or exports", async () => {
    expect((await as(db, dave, (q) => q<{ n: number }>("select count(*)::int as n from public.receipts")))[0]!.n).toBe(2);
    expect(await as(db, dave, (q) => q("select * from public.audit_log"))).toEqual([]);
    expect(await as(db, dave, (q) => q("select * from public.exports"))).toEqual([]);
    await expectDenied(as(db, dave, (q) => q("select public.start_export($1, now() - interval '1 day', now(), '{}')", [orgA])));
    await expectDenied(as(db, dave, (q) => q("select public.set_member_role($1, $2, 'admin')", [orgA, ids.dave])));
  });

  it("invitations only work once, for the invited email", async () => {
    const token = (await as(db, alice, (q) => q<{ t: string }>("select public.create_invitation($1, 'erin@a.test', 'member') as t", [orgA])))[0]!.t;
    await expect(as(db, bob, (q) => q("select public.accept_invitation($1)", [token]))).rejects.toThrow(/different email/);
    await as(db, erin, (q) => q("select public.accept_invitation($1)", [token]));
    await expect(as(db, erin, (q) => q("select public.accept_invitation($1)", [token]))).rejects.toThrow(/not valid/);
    await expect(as(db, alice, (q) => q("select public.create_invitation($1, 'x@a.test', 'owner')", [orgA]))).rejects.toThrow(/transfer ownership/);
  });

  it("an organization always keeps an owner, and admins cannot touch owners", async () => {
    await expect(as(db, alice, (q) => q("select public.remove_member($1, $2)", [orgA, ids.alice]))).rejects.toThrow(/at least one owner/);
    await expect(as(db, alice, (q) => q("select public.set_member_role($1, $2, 'member')", [orgA, ids.alice]))).rejects.toThrow(/at least one owner/);
    await as(db, alice, (q) => q("select public.set_member_role($1, $2, 'admin')", [orgA, ids.erin]));
    await expect(as(db, erin, (q) => q("select public.set_member_role($1, $2, 'member')", [orgA, ids.alice]))).rejects.toThrow(/only an owner/);
    await expect(as(db, erin, (q) => q("select public.set_member_role($1, $2, 'owner')", [orgA, ids.erin]))).rejects.toThrow(/only an owner/);
    await as(db, erin, (q) => q("select public.set_member_role($1, $2, 'auditor')", [orgA, ids.dave]));
    await as(db, alice, (q) => q("select public.set_member_role($1, $2, 'member')", [orgA, ids.dave]));
  });
});

describe("device ingest and chain integrity in the database", () => {
  it("rejects a stale head and broken links, accepts the continuation", async () => {
    await expect(as(db, service, (q) => q("select public.ingest_receipts($1, -1, $2::jsonb)", [deviceA, JSON.stringify(rows.slice(2))]))).rejects.toThrow(/chain_moved/);
    const tampered = rows.slice(2, 3).map((r) => ({ ...r, prev: "sha256:" + "0".repeat(64) }));
    await expect(as(db, service, (q) => q("select public.ingest_receipts($1, 1, $2::jsonb)", [deviceA, JSON.stringify(tampered)]))).rejects.toThrow(/chain_broken/);
    const res = await as(db, service, (q) => q<{ r: { inserted: number; head_seq: number } }>("select public.ingest_receipts($1, 1, $2::jsonb) as r", [deviceA, JSON.stringify(rows.slice(2))]));
    expect(res[0]!.r).toMatchObject({ inserted: 2, head_seq: 3 });
    const chain = await as(db, alice, (q) => q("select last_seq, last_hash, receipt_count::int from public.chains"));
    expect(chain).toEqual([{ last_seq: 3, last_hash: vectors.hashes[3], receipt_count: 4 }]);
  });

  it("enrollment codes are single use and tokens die with the device", async () => {
    const code = (await as(db, alice, (q) => q<{ c: string }>("select public.create_device_enrollment($1) as c", [orgA])))[0]!.c;
    expect(code).toMatch(/^atle_[0-9a-f]{64}$/);
    await as(db, service, (q) => q("select public.enroll_device($1, 'ci', 'linux', 'atl_00000000000000ff', $2, $3)", [sha(code), "A".repeat(43), sha("atd_token_ci")]));
    await expect(as(db, service, (q) => q("select public.enroll_device($1, 'ci2', 'linux', 'atl_00000000000000fe', $2, $3)", [sha(code), "B".repeat(43), sha("atd_token_ci2")]))).rejects.toThrow(/invalid_enrollment_code/);
    const dev = await as(db, service, (q) => q<{ device_id: string }>("select device_id from public.device_for_token($1)", [sha("atd_token_ci")]));
    expect(dev).toHaveLength(1);
    await as(db, alice, (q) => q("select public.revoke_device($1)", [dev[0]!.device_id]));
    expect(await as(db, service, (q) => q("select * from public.device_for_token($1)", [sha("atd_token_ci")]))).toEqual([]);
    await expect(as(db, service, (q) => q("select public.ingest_receipts($1, -1, '[]')", [dev[0]!.device_id]))).rejects.toThrow(/device_not_active/);
  });
});

describe("approval queue", () => {
  const findings = JSON.stringify([{ rule: "VFY-SH-010", verdict: "ask", message: "Force-pushes." }]);
  const request = (device: string, ttl = 120) =>
    as(db, service, (q) =>
      q<{ r: { id: string; status: string } }>("select public.request_approval($1, 'shell', 'run_command', 'shell', $2, $3::jsonb, $4) as r", [device, "sha256:" + "b".repeat(64), findings, ttl]),
    ).then((r) => r[0]!.r);

  it("a device asks, members of that organization see it, and only owners and admins decide", async () => {
    const req = await request(deviceA);
    expect(req.status).toBe("pending");
    expect(await as(db, dave, (q) => q("select id from public.approvals where id = $1", [req.id]))).toHaveLength(1);
    expect(await as(db, bob, (q) => q("select id from public.approvals where id = $1", [req.id]))).toHaveLength(0);
    await expectDenied(as(db, alice, (q) => q("update public.approvals set status = 'approved' where id = $1", [req.id])));
    await expectDenied(as(db, alice, (q) => q("insert into public.approvals (org_id, server_id, tool_name, kind, args_sha256, findings, expires_at) values ($1, 's', 't', 'k', $2, '[{}]', now() + interval '1 minute')", [orgA, "sha256:" + "c".repeat(64)])));
    await expect(as(db, dave, (q) => q("select public.decide_approval($1, true, null)", [req.id]))).rejects.toThrow();
    await expect(as(db, bob, (q) => q("select public.decide_approval($1, true, null)", [req.id]))).rejects.toThrow();
    await as(db, alice, (q) => q("select public.decide_approval($1, true, 'ok, one time')", [req.id]));
    await expect(as(db, alice, (q) => q("select public.decide_approval($1, false, null)", [req.id]))).rejects.toThrow(/already decided/);
    const seen = await as(db, service, (q) => q<{ r: { status: string; note: string } }>("select public.approval_for_device($1, $2) as r", [deviceA, req.id]));
    expect(seen[0]!.r).toMatchObject({ status: "approved", note: "ok, one time" });
    const audit = await as(db, alice, (q) => q<{ action: string }>("select action from public.audit_log where org_id = $1 and action like 'approval.%' order by id", [orgA]));
    expect(audit.map((a) => a.action)).toEqual(["approval.request", "approval.approve"]);
  });

  it("an undecided request expires and can no longer be approved", async () => {
    const req = await request(deviceA, 10);
    await as(db, service, (q) => q("update public.approvals set created_at = now() - interval '1 minute', expires_at = now() - interval '1 second' where id = $1", [req.id]));
    await expect(as(db, alice, (q) => q("select public.decide_approval($1, true, null)", [req.id]))).rejects.toThrow(/expired/);
    const seen = await as(db, service, (q) => q<{ r: { status: string } }>("select public.approval_for_device($1, $2) as r", [deviceA, req.id]));
    expect(seen[0]!.r.status).toBe("expired");
  });

  it("clients cannot create requests, and a device sees only its own", async () => {
    await expectDenied(as(db, alice, (q) => q("select public.request_approval($1, 's', 't', 'k', $2, '[{}]'::jsonb, 60)", [deviceA, "sha256:" + "d".repeat(64)])));
    await expectDenied(as(db, alice, (q) => q("select public.approval_for_device($1, gen_random_uuid())", [deviceA])));
    const req = await request(deviceA);
    await expect(as(db, service, (q) => q("select public.approval_for_device(gen_random_uuid(), $1)", [req.id]))).rejects.toThrow(/not found/);
    await expect(request(deviceA, 5)).rejects.toThrow(/ttl/);
    await expect(request(deviceA, 3600)).rejects.toThrow(/ttl/);
  });
});

describe("notification channels", () => {
  const slack = "https://hooks.slack.com/services/T000/B000/" + "x".repeat(24);
  const add = (who: Actor, org: string, target = slack, events = "{approval.request,device.silent}") =>
    as(db, who, (q) => q<{ id: string }>("select public.add_notification_channel($1, 'slack', $2, 'ops', $3::text[]) as id", [org, target, events])).then((r) => r[0]!.id);

  it("only owners and admins add them, nobody reads the secret back", async () => {
    const id = await add(alice, orgA);
    await expect(add(dave, orgA)).rejects.toThrow();
    await expect(add(bob, orgA)).rejects.toThrow();
    await expectDenied(as(db, alice, (q) => q("select target from public.notification_channels")));
    await expectDenied(as(db, alice, (q) => q("insert into public.notification_channels (org_id, kind, target, label, events) values ($1, 'slack', $2, 'x', '{lock.propose}')", [orgA, slack])));
    const listed = await as(db, alice, (q) => q<{ id: string; target_hint: string }>("select * from public.list_notification_channels($1)", [orgA]));
    expect(listed.map((c) => c.id)).toContain(id);
    expect(listed[0]!.target_hint).toBe("hooks.slack.com/…xxxx");
    expect(JSON.stringify(listed)).not.toContain("T000");
    await expect(as(db, dave, (q) => q("select * from public.list_notification_channels($1)", [orgA]))).rejects.toThrow();
    await expect(as(db, bob, (q) => q("select public.remove_notification_channel($1)", [id]))).rejects.toThrow();
    await as(db, alice, (q) => q("select public.remove_notification_channel($1)", [id]));
  });

  it("accepts only Slack webhooks and Telegram bots, and known events", async () => {
    await expect(add(alice, orgA, "https://evil.example/hook")).rejects.toThrow(/check constraint/);
    await expect(add(alice, orgA, "http://hooks.slack.com/services/T/B/x")).rejects.toThrow(/check constraint/);
    await expect(add(alice, orgA, slack, "{everything}")).rejects.toThrow(/check constraint/);
    const tg = await as(db, alice, (q) =>
      q<{ id: string }>("select public.add_notification_channel($1, 'telegram', $2, 'ops', '{lock.propose}') as id", [orgA, "123456789:" + "A".repeat(35) + "|-1001234"]),
    );
    expect(tg[0]!.id).toBeTruthy();
    const listed = await as(db, alice, (q) => q<{ target_hint: string }>("select target_hint from public.list_notification_channels($1) where kind = 'telegram'", [orgA]));
    expect(listed[0]!.target_hint).toBe("chat -1001234");
  });

  it("reports a silent device once per silence, and only to the server", async () => {
    await as(db, service, (q) => q("update public.devices set last_seen_at = now() - interval '2 days', silence_alerted_at = null where id = $1", [deviceA]));
    await expectDenied(as(db, alice, (q) => q("select * from public.silent_devices(24)")));
    const silent = await as(db, service, (q) => q<{ id: string }>("select id from public.silent_devices(24)"));
    expect(silent.map((d) => d.id)).toContain(deviceA);
    await as(db, service, (q) => q("select public.mark_silence_alerted($1::uuid[])", [[deviceA]]));
    expect((await as(db, service, (q) => q<{ id: string }>("select id from public.silent_devices(24)"))).map((d) => d.id)).not.toContain(deviceA);
    // it uploads again, then goes quiet again: a new alert
    await as(db, service, (q) => q("update public.devices set last_seen_at = now() - interval '25 hours' where id = $1", [deviceA]));
    await as(db, service, (q) => q("update public.devices set silence_alerted_at = now() - interval '26 hours' where id = $1", [deviceA]));
    expect((await as(db, service, (q) => q<{ id: string }>("select id from public.silent_devices(24)"))).map((d) => d.id)).toContain(deviceA);
  });
});

describe("audit log", () => {
  it("is a hash chain per organization", async () => {
    const log = await as(db, alice, (q) => q<{ prev_hash: string | null; hash: string; action: string }>("select prev_hash, hash, action from public.audit_log where org_id = $1 order by id", [orgA]));
    expect(log[0]!.prev_hash).toBeNull();
    for (let i = 1; i < log.length; i++) expect(log[i]!.prev_hash).toBe(log[i - 1]!.hash);
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(["org.create", "device.enroll", "lock.propose", "member.join", "device.revoke"]));
  });
});

describe("advisories and rate limits", () => {
  it("anonymous visitors only see published advisories", async () => {
    await as(db, service, (q) =>
      q(`insert into public.advisories (id, summary, details, severity, published, modified, status, body) values
         ('ATLS-2099-0001', 'Published test advisory', 'd', 'high', now(), now(), 'published', '{}'),
         ('ATLS-2099-0002', 'Draft test advisory', 'd', 'low', now(), now(), 'draft', '{}')`),
    );
    const visible = await as(db, anon, (q) => q<{ id: string }>("select id from public.advisories where id like 'ATLS-2099-%'"));
    expect(visible).toEqual([{ id: "ATLS-2099-0001" }]);
    await expectDenied(as(db, anon, (q) => q("select * from public.receipts")));
  });

  it("counts calls in a shared fixed window", async () => {
    const hits: boolean[] = [];
    for (let i = 0; i < 4; i++) hits.push((await as(db, service, (q) => q<{ ok: boolean }>("select public.rate_limit_hit('test:bucket', 3600, 3) as ok")))[0]!.ok);
    expect(hits).toEqual([true, true, true, false]);
  });
});
