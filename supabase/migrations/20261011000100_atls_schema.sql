-- Atls schema: organizations, devices, receipts, policies, locks, audit log,
-- exports and advisories. Every table has Row Level Security enabled.
--
-- Access model
--   * Browsers use the publishable key + a user session: they can only SELECT,
--     and RLS limits rows to organizations the user is a member of.
--   * Every change made by a person goes through a SECURITY DEFINER function
--     below that checks the caller's role with auth.uid() and writes an
--     audit_log row in the same transaction.
--   * Device traffic (receipt ingest, enrollment, lock proposals) and rate
--     limiting run on the server with the secret key, through functions that
--     only service_role may execute, after the Next.js route has authenticated
--     the device token.
--
-- This migration only uses core Postgres (sha256(), gen_random_uuid()), no extensions.

-- ---------------------------------------------------------------- types

create type public.org_role as enum ('owner', 'admin', 'member', 'auditor');
create type public.device_status as enum ('active', 'revoked');
create type public.lock_status as enum ('pending', 'approved', 'rejected');
create type public.export_status as enum ('pending', 'ready', 'failed');
create type public.receipt_verdict as enum ('allow', 'ask', 'deny');

-- ---------------------------------------------------------------- tables

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null check (char_length(email) <= 254),
  display_name text check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.orgs (id) on delete cascade,
  -- profiles cascade from auth.users; pointing here lets the API embed member profiles
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_role not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  email text not null check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  role public.org_role not null check (role <> 'owner'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  check (expires_at > created_at)
);
create index invitations_org_idx on public.invitations (org_id, created_at desc);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  enrolled_by uuid references auth.users (id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  platform text check (char_length(platform) <= 80),
  kid text not null check (kid ~ '^atl_[0-9a-f]{16}$'),
  public_key text not null check (public_key ~ '^[A-Za-z0-9_-]{43}$'),
  status public.device_status not null default 'active',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  unique (org_id, kid),
  check ((status = 'revoked') = (revoked_at is not null))
);

create table public.device_enrollments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  device_id uuid references public.devices (id) on delete set null,
  check (expires_at > created_at)
);

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index device_tokens_device_idx on public.device_tokens (device_id);

create table public.chains (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  chain_id text not null check (chain_id ~ '^atl_[0-9a-f]{16}$'),
  last_seq integer not null default -1 check (last_seq >= -1),
  last_hash text check (last_hash ~ '^sha256:[0-9a-f]{64}$'),
  receipt_count bigint not null default 0 check (receipt_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, chain_id),
  check ((last_seq = -1) = (last_hash is null)),
  check (receipt_count = last_seq + 1)
);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  chain_pk uuid not null references public.chains (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  receipt_id text not null check (receipt_id ~ '^rcpt_[A-Za-z0-9]{1,64}$'),
  seq integer not null check (seq >= 0),
  prev text check (prev ~ '^sha256:[0-9a-f]{64}$'),
  hash text not null check (hash ~ '^sha256:[0-9a-f]{64}$'),
  issued_at timestamptz not null,
  agent text not null check (char_length(agent) <= 200),
  session text not null check (char_length(session) <= 200),
  server text not null check (char_length(server) <= 200),
  tool text not null check (char_length(tool) <= 200),
  kind text not null check (char_length(kind) <= 40),
  verdict public.receipt_verdict not null,
  rules text[] not null default '{}',
  policy_sha256 text not null check (char_length(policy_sha256) <= 80),
  tool_sha256 text check (tool_sha256 ~ '^sha256:[0-9a-f]{64}$'),
  outcome_status text not null check (outcome_status in ('ok', 'error', 'blocked', 'declined', 'pending', 'asked')),
  has_args boolean not null default false,
  body jsonb not null check (jsonb_typeof(body) = 'object' and pg_column_size(body) <= 32768),
  received_at timestamptz not null default now(),
  unique (chain_pk, seq),
  unique (org_id, hash),
  check ((seq = 0) = (prev is null))
);
create index receipts_org_time_idx on public.receipts (org_id, issued_at desc);
create index receipts_org_verdict_idx on public.receipts (org_id, verdict, issued_at desc);
create index receipts_org_tool_idx on public.receipts (org_id, tool);
create index receipts_org_device_idx on public.receipts (org_id, device_id, issued_at desc);

create table public.policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  version integer not null check (version >= 1),
  body jsonb not null check (jsonb_typeof(body) = 'object' and pg_column_size(body) <= 65536),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  note text check (char_length(note) <= 200),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, version)
);

create table public.locks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  server_id text not null check (char_length(server_id) between 1 and 200),
  tool_name text not null check (char_length(tool_name) between 1 and 200),
  digest text not null check (digest ~ '^sha256:[0-9a-f]{64}$'),
  definition jsonb not null check (jsonb_typeof(definition) = 'object' and pg_column_size(definition) <= 65536),
  status public.lock_status not null default 'pending',
  proposed_by_device uuid references public.devices (id) on delete set null,
  proposed_by_user uuid references auth.users (id) on delete set null,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 200),
  created_at timestamptz not null default now(),
  unique (org_id, server_id, tool_name, digest),
  check ((status = 'pending') = (decided_at is null))
);
create index locks_org_status_idx on public.locks (org_id, status, created_at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  actor_user uuid references auth.users (id) on delete set null,
  actor_device uuid references public.devices (id) on delete set null,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  target text check (char_length(target) <= 200),
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 8192),
  at timestamptz not null default now(),
  prev_hash text,
  hash text not null
);
create index audit_log_org_idx on public.audit_log (org_id, id desc);

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  from_ts timestamptz not null,
  to_ts timestamptz not null,
  filters jsonb not null default '{}' check (jsonb_typeof(filters) = 'object'),
  status public.export_status not null default 'pending',
  receipt_count integer check (receipt_count >= 0),
  manifest jsonb,
  manifest_sha256 text check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text,
  error text check (char_length(error) <= 300),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (to_ts > from_ts)
);
create index exports_org_idx on public.exports (org_id, created_at desc);

create table public.advisories (
  id text primary key check (id ~ '^ATLS-[0-9]{4}-[0-9]{4,}$'),
  summary text not null check (char_length(summary) between 5 and 300),
  details text not null check (char_length(details) <= 20000),
  severity text not null check (severity in ('critical', 'high', 'medium', 'low')),
  ecosystem text,
  package text,
  affected jsonb not null default '[]' check (jsonb_typeof(affected) = 'array'),
  aliases text[] not null default '{}',
  "references" jsonb not null default '[]' check (jsonb_typeof("references") = 'array'),
  published timestamptz not null,
  modified timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'withdrawn')),
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed', 'reviewed')),
  body jsonb not null check (jsonb_typeof(body) = 'object')
);
create index advisories_published_idx on public.advisories (status, modified desc);

create table public.rate_limits (
  bucket text not null check (char_length(bucket) <= 200),
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, window_start)
);

-- ---------------------------------------------------------------- audit log: hash chain, append-only

create function public.audit_log_chain() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- serialize writers per org so the chain never forks
  perform pg_advisory_xact_lock(hashtextextended('atls.audit.' || new.org_id::text, 0));
  select a.hash into new.prev_hash from public.audit_log a where a.org_id = new.org_id order by a.id desc limit 1;
  new.at := clock_timestamp();
  new.hash := 'sha256:' || encode(sha256(convert_to(
    coalesce(new.prev_hash, '') || '|' || new.org_id::text || '|' || coalesce(new.actor_user::text, '') || '|' ||
    coalesce(new.actor_device::text, '') || '|' || new.action || '|' || coalesce(new.target, '') || '|' ||
    new.details::text || '|' || to_char(new.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'UTF8')), 'hex');
  return new;
end;
$$;

create trigger audit_log_chain before insert on public.audit_log
for each row execute function public.audit_log_chain();

create function public.forbid_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;

create trigger audit_log_no_update before update or delete on public.audit_log
for each row execute function public.forbid_change();

-- receipts and published policy versions are evidence: never edited after insert
create trigger receipts_no_update before update on public.receipts
for each row execute function public.forbid_change();
create trigger policies_no_update before update on public.policies
for each row execute function public.forbid_change();

create function public.write_audit(p_org uuid, p_actor_user uuid, p_actor_device uuid, p_action text, p_target text, p_details jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (org_id, actor_user, actor_device, action, target, details)
  values (p_org, p_actor_user, p_actor_device, p_action, left(p_target, 200), coalesce(p_details, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------- profiles from auth.users

create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, '')) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- role helpers

create function public.is_member(p_org uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = auth.uid());
$$;

create function public.has_role(p_org uuid, p_roles public.org_role[]) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = auth.uid() and m.role = any (p_roles));
$$;

create function public.require_role(p_org uuid, p_roles public.org_role[]) returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = v_uid and m.role = any (p_roles)) then
    raise exception 'permission denied for this organization' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create function public.random_token() returns text
language sql
volatile
set search_path = ''
as $$
  -- 244 random bits from two version-4 UUIDs
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

create function public.sha256_hex(p text) returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex');
$$;

-- ---------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.orgs enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.devices enable row level security;
alter table public.device_enrollments enable row level security;
alter table public.device_tokens enable row level security;
alter table public.chains enable row level security;
alter table public.receipts enable row level security;
alter table public.policies enable row level security;
alter table public.locks enable row level security;
alter table public.audit_log enable row level security;
alter table public.exports enable row level security;
alter table public.advisories enable row level security;
alter table public.rate_limits enable row level security;

-- Clients read through RLS; nobody writes tables directly.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select on public.profiles, public.orgs, public.memberships, public.invitations, public.devices,
  public.device_enrollments, public.chains, public.receipts, public.policies, public.locks,
  public.audit_log, public.exports, public.advisories to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.advisories to anon;

create policy "profiles: self and teammates" on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.memberships a join public.memberships b on a.org_id = b.org_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "orgs: members read" on public.orgs for select to authenticated using (public.is_member(id));
create policy "memberships: members read" on public.memberships for select to authenticated using (public.is_member(org_id));
create policy "invitations: admins read" on public.invitations for select to authenticated
  using (public.has_role(org_id, array['owner', 'admin']::public.org_role[]));
create policy "devices: members read" on public.devices for select to authenticated using (public.is_member(org_id));
create policy "enrollments: admins read" on public.device_enrollments for select to authenticated
  using (public.has_role(org_id, array['owner', 'admin']::public.org_role[]));
-- device_tokens: no policy, so no client can read token hashes
create policy "chains: members read" on public.chains for select to authenticated using (public.is_member(org_id));
create policy "receipts: members read" on public.receipts for select to authenticated using (public.is_member(org_id));
create policy "policies: members read" on public.policies for select to authenticated using (public.is_member(org_id));
create policy "locks: members read" on public.locks for select to authenticated using (public.is_member(org_id));
create policy "audit: owners, admins, auditors" on public.audit_log for select to authenticated
  using (public.has_role(org_id, array['owner', 'admin', 'auditor']::public.org_role[]));
create policy "exports: owners, admins, auditors" on public.exports for select to authenticated
  using (public.has_role(org_id, array['owner', 'admin', 'auditor']::public.org_role[]));
create policy "advisories: published are public" on public.advisories for select to anon, authenticated
  using (status = 'published');
-- rate_limits: no policy

-- ---------------------------------------------------------------- functions for signed-in users

create function public.create_org(p_name text, p_slug text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_count int;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select count(*) into v_count from public.memberships m where m.user_id = v_uid and m.role = 'owner';
  if v_count >= 10 then
    raise exception 'you already own 10 organizations' using errcode = '54000';
  end if;
  insert into public.orgs (name, slug, created_by) values (btrim(p_name), lower(p_slug), v_uid) returning id into v_org;
  insert into public.memberships (org_id, user_id, role) values (v_org, v_uid, 'owner');
  insert into public.policies (org_id, version, body, sha256, note, created_by)
  values (v_org, 1, '{}'::jsonb, public.sha256_hex('{}'::jsonb::text), 'Atls defaults', v_uid);
  perform public.write_audit(v_org, v_uid, null, 'org.create', p_slug, jsonb_build_object('name', btrim(p_name)));
  return v_org;
end;
$$;

create function public.create_invitation(p_org uuid, p_email text, p_role public.org_role) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_role(p_org, array['owner', 'admin']::public.org_role[]);
  v_token text := public.random_token();
  v_pending int;
begin
  if p_role = 'owner' then
    raise exception 'invite as admin, then transfer ownership' using errcode = '22023';
  end if;
  select count(*) into v_pending from public.invitations i
  where i.org_id = p_org and i.accepted_at is null and i.revoked_at is null and i.expires_at > now();
  if v_pending >= 50 then
    raise exception 'too many open invitations' using errcode = '54000';
  end if;
  insert into public.invitations (org_id, email, role, token_hash, created_by, expires_at)
  values (p_org, lower(btrim(p_email)), p_role, public.sha256_hex(v_token), v_uid, now() + interval '7 days');
  perform public.write_audit(p_org, v_uid, null, 'member.invite', lower(btrim(p_email)), jsonb_build_object('role', p_role));
  return v_token;
end;
$$;

create function public.revoke_invitation(p_invitation uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations;
  v_uid uuid;
begin
  select * into v_inv from public.invitations where id = p_invitation;
  if not found then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  v_uid := public.require_role(v_inv.org_id, array['owner', 'admin']::public.org_role[]);
  update public.invitations set revoked_at = now() where id = p_invitation and revoked_at is null and accepted_at is null;
  perform public.write_audit(v_inv.org_id, v_uid, null, 'member.invite_revoke', v_inv.email, '{}');
end;
$$;

create function public.accept_invitation(p_token text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_inv public.invitations;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select * into v_inv from public.invitations
  where token_hash = public.sha256_hex(coalesce(p_token, '')) for update;
  if not found or v_inv.revoked_at is not null or v_inv.accepted_at is not null or v_inv.expires_at <= now() then
    raise exception 'this invitation is not valid any more' using errcode = 'P0002';
  end if;
  if v_inv.email <> v_email then
    raise exception 'this invitation was sent to a different email address' using errcode = '42501';
  end if;
  insert into public.memberships (org_id, user_id, role) values (v_inv.org_id, v_uid, v_inv.role)
  on conflict (org_id, user_id) do nothing;
  update public.invitations set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;
  perform public.write_audit(v_inv.org_id, v_uid, null, 'member.join', v_email, jsonb_build_object('role', v_inv.role));
  return v_inv.org_id;
end;
$$;

create function public.set_member_role(p_org uuid, p_user uuid, p_role public.org_role) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_role(p_org, array['owner', 'admin']::public.org_role[]);
  v_actor public.org_role := public.org_role_of(p_org);
  v_current public.org_role;
begin
  select role into v_current from public.memberships where org_id = p_org and user_id = p_user for update;
  if not found then
    raise exception 'not a member' using errcode = 'P0002';
  end if;
  if v_actor <> 'owner' and (v_current = 'owner' or p_role = 'owner') then
    raise exception 'only an owner can change owners' using errcode = '42501';
  end if;
  if v_current = 'owner' and p_role <> 'owner'
     and (select count(*) from public.memberships where org_id = p_org and role = 'owner') <= 1 then
    raise exception 'an organization needs at least one owner' using errcode = '23514';
  end if;
  update public.memberships set role = p_role where org_id = p_org and user_id = p_user;
  perform public.write_audit(p_org, v_uid, null, 'member.role', p_user::text, jsonb_build_object('from', v_current, 'to', p_role));
end;
$$;

create function public.remove_member(p_org uuid, p_user uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_actor public.org_role := public.org_role_of(p_org);
  v_current public.org_role;
begin
  if v_uid is null or v_actor is null then
    raise exception 'permission denied for this organization' using errcode = '42501';
  end if;
  select role into v_current from public.memberships where org_id = p_org and user_id = p_user for update;
  if not found then
    raise exception 'not a member' using errcode = 'P0002';
  end if;
  if p_user <> v_uid and not (v_actor = 'owner' or (v_actor = 'admin' and v_current <> 'owner')) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if v_current = 'owner' and (select count(*) from public.memberships where org_id = p_org and role = 'owner') <= 1 then
    raise exception 'an organization needs at least one owner' using errcode = '23514';
  end if;
  delete from public.memberships where org_id = p_org and user_id = p_user;
  perform public.write_audit(p_org, v_uid, null, case when p_user = v_uid then 'member.leave' else 'member.remove' end, p_user::text, '{}');
end;
$$;

create function public.org_role_of(p_org uuid) returns public.org_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.memberships m where m.org_id = p_org and m.user_id = auth.uid();
$$;

create function public.create_device_enrollment(p_org uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_role(p_org, array['owner', 'admin']::public.org_role[]);
  v_code text := 'atle_' || public.random_token();
  v_open int;
begin
  select count(*) into v_open from public.device_enrollments e
  where e.org_id = p_org and e.used_at is null and e.expires_at > now();
  if v_open >= 20 then
    raise exception 'too many open enrollment codes' using errcode = '54000';
  end if;
  insert into public.device_enrollments (org_id, code_hash, created_by, expires_at)
  values (p_org, public.sha256_hex(v_code), v_uid, now() + interval '1 hour');
  perform public.write_audit(p_org, v_uid, null, 'device.enrollment_create', null, '{}');
  return v_code;
end;
$$;

create function public.revoke_device(p_device uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dev public.devices;
  v_uid uuid;
begin
  select * into v_dev from public.devices where id = p_device for update;
  if not found then
    raise exception 'device not found' using errcode = 'P0002';
  end if;
  v_uid := public.require_role(v_dev.org_id, array['owner', 'admin']::public.org_role[]);
  if v_dev.status = 'revoked' then
    return;
  end if;
  update public.devices set status = 'revoked', revoked_at = now(), revoked_by = v_uid where id = p_device;
  update public.device_tokens set revoked_at = now() where device_id = p_device and revoked_at is null;
  perform public.write_audit(v_dev.org_id, v_uid, null, 'device.revoke', v_dev.kid, jsonb_build_object('name', v_dev.name));
end;
$$;

create function public.publish_policy(p_org uuid, p_body jsonb, p_note text) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_role(p_org, array['owner', 'admin']::public.org_role[]);
  v_version integer;
  v_sha text;
begin
  if jsonb_typeof(p_body) <> 'object' or pg_column_size(p_body) > 65536 then
    raise exception 'a policy must be a JSON object under 64 KB' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('atls.policy.' || p_org::text, 0));
  select coalesce(max(version), 0) + 1 into v_version from public.policies where org_id = p_org;
  v_sha := public.sha256_hex(p_body::text);
  insert into public.policies (org_id, version, body, sha256, note, created_by)
  values (p_org, v_version, p_body, v_sha, nullif(left(btrim(coalesce(p_note, '')), 200), ''), v_uid);
  perform public.write_audit(p_org, v_uid, null, 'policy.publish', 'v' || v_version, jsonb_build_object('sha256', v_sha));
  return v_version;
end;
$$;

create function public.decide_lock(p_lock uuid, p_approve boolean, p_note text) returns public.lock_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lock public.locks;
  v_uid uuid;
  v_status public.lock_status := case when p_approve then 'approved' else 'rejected' end;
begin
  select * into v_lock from public.locks where id = p_lock for update;
  if not found then
    raise exception 'lock not found' using errcode = 'P0002';
  end if;
  v_uid := public.require_role(v_lock.org_id, array['owner', 'admin']::public.org_role[]);
  if v_lock.status <> 'pending' then
    raise exception 'this lock was already decided' using errcode = '55000';
  end if;
  update public.locks set status = v_status, decided_by = v_uid, decided_at = now(),
    decision_note = nullif(left(btrim(coalesce(p_note, '')), 200), '')
  where id = p_lock;
  perform public.write_audit(v_lock.org_id, v_uid, null, case when p_approve then 'lock.approve' else 'lock.reject' end,
    v_lock.server_id || '/' || v_lock.tool_name, jsonb_build_object('digest', v_lock.digest));
  return v_status;
end;
$$;

create function public.start_export(p_org uuid, p_from timestamptz, p_to timestamptz, p_filters jsonb) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_role(p_org, array['owner', 'admin', 'auditor']::public.org_role[]);
  v_id uuid;
begin
  if p_to <= p_from or p_to - p_from > interval '366 days' then
    raise exception 'the export range must be positive and at most one year' using errcode = '22023';
  end if;
  insert into public.exports (org_id, requested_by, from_ts, to_ts, filters)
  values (p_org, v_uid, p_from, p_to, coalesce(p_filters, '{}')) returning id into v_id;
  perform public.write_audit(p_org, v_uid, null, 'export.request', v_id::text,
    jsonb_build_object('from', p_from, 'to', p_to, 'filters', coalesce(p_filters, '{}')));
  return v_id;
end;
$$;

create function public.org_stats(p_org uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_member(p_org) then
    raise exception 'permission denied for this organization' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'receipts_total', (select count(*) from public.receipts where org_id = p_org),
    'receipts_7d', (select count(*) from public.receipts where org_id = p_org and issued_at > now() - interval '7 days'),
    'denied_7d', (select count(*) from public.receipts where org_id = p_org and verdict = 'deny' and issued_at > now() - interval '7 days'),
    'asked_7d', (select count(*) from public.receipts where org_id = p_org and verdict = 'ask' and issued_at > now() - interval '7 days'),
    'devices_active', (select count(*) from public.devices where org_id = p_org and status = 'active'),
    'locks_pending', (select count(*) from public.locks where org_id = p_org and status = 'pending'),
    'policy_version', (select max(version) from public.policies where org_id = p_org),
    'members', (select count(*) from public.memberships where org_id = p_org)
  );
end;
$$;

-- ---------------------------------------------------------------- functions for the server (service_role only)

create function public.device_for_token(p_token_hash text)
returns table (device_id uuid, org_id uuid, kid text, public_key text, token_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.device_tokens t set last_used_at = now()
  from public.devices d
  where t.token_hash = p_token_hash and t.device_id = d.id and t.revoked_at is null
    and (t.expires_at is null or t.expires_at > now()) and d.status = 'active'
  returning d.id, d.org_id, d.kid, d.public_key, t.id;
end;
$$;

create function public.enroll_device(p_code_hash text, p_name text, p_platform text, p_kid text, p_public_key text, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enr public.device_enrollments;
  v_dev uuid;
  v_org_name text;
begin
  select * into v_enr from public.device_enrollments where code_hash = p_code_hash for update;
  if not found or v_enr.used_at is not null or v_enr.expires_at <= now() then
    raise exception 'invalid_enrollment_code' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.devices where org_id = v_enr.org_id and kid = p_kid) then
    raise exception 'device_key_exists' using errcode = '23505';
  end if;
  insert into public.devices (org_id, enrolled_by, name, platform, kid, public_key)
  values (v_enr.org_id, v_enr.created_by, left(btrim(p_name), 80), left(p_platform, 80), p_kid, p_public_key)
  returning id into v_dev;
  insert into public.device_tokens (device_id, token_hash, expires_at) values (v_dev, p_token_hash, now() + interval '365 days');
  update public.device_enrollments set used_at = now(), device_id = v_dev where id = v_enr.id;
  select name into v_org_name from public.orgs where id = v_enr.org_id;
  perform public.write_audit(v_enr.org_id, v_enr.created_by, v_dev, 'device.enroll', p_kid, jsonb_build_object('name', left(btrim(p_name), 80)));
  return jsonb_build_object('device_id', v_dev, 'org_id', v_enr.org_id, 'org_name', v_org_name);
end;
$$;

-- Insert a verified batch. The route has already checked schema, signatures and
-- links in TypeScript; this re-checks the chain head under a row lock so two
-- concurrent uploads can never fork or reorder a chain.
create function public.ingest_receipts(p_device uuid, p_expected_last_seq integer, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dev public.devices;
  v_chain public.chains;
  v_row jsonb;
  v_seq integer;
  v_hash text;
  v_inserted integer := 0;
begin
  select * into v_dev from public.devices where id = p_device;
  if not found or v_dev.status <> 'active' then
    raise exception 'device_not_active' using errcode = '42501';
  end if;
  insert into public.chains (org_id, device_id, chain_id) values (v_dev.org_id, v_dev.id, v_dev.kid)
  on conflict (org_id, chain_id) do nothing;
  select * into v_chain from public.chains where org_id = v_dev.org_id and chain_id = v_dev.kid for update;
  if v_chain.device_id <> v_dev.id then
    raise exception 'chain_owned_by_other_device' using errcode = '42501';
  end if;
  if v_chain.last_seq <> p_expected_last_seq then
    raise exception 'chain_moved' using errcode = '40001';
  end if;
  v_seq := v_chain.last_seq;
  v_hash := v_chain.last_hash;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if (v_row ->> 'seq')::integer <> v_seq + 1 or (v_row ->> 'prev') is distinct from v_hash then
      raise exception 'chain_broken at seq %', v_row ->> 'seq' using errcode = '23514';
    end if;
    insert into public.receipts (org_id, chain_pk, device_id, receipt_id, seq, prev, hash, issued_at, agent, session,
      server, tool, kind, verdict, rules, policy_sha256, tool_sha256, outcome_status, has_args, body)
    values (v_dev.org_id, v_chain.id, v_dev.id, v_row ->> 'receipt_id', (v_row ->> 'seq')::integer, v_row ->> 'prev',
      v_row ->> 'hash', (v_row ->> 'issued_at')::timestamptz, v_row ->> 'agent', v_row ->> 'session', v_row ->> 'server',
      v_row ->> 'tool', v_row ->> 'kind', (v_row ->> 'verdict')::public.receipt_verdict,
      coalesce(array(select jsonb_array_elements_text(v_row -> 'rules')), '{}'), v_row ->> 'policy_sha256',
      v_row ->> 'tool_sha256', v_row ->> 'outcome_status', coalesce((v_row ->> 'has_args')::boolean, false), v_row -> 'body');
    v_seq := v_seq + 1;
    v_hash := v_row ->> 'hash';
    v_inserted := v_inserted + 1;
  end loop;
  update public.chains set last_seq = v_seq, last_hash = v_hash, receipt_count = v_seq + 1, updated_at = now()
  where id = v_chain.id;
  update public.devices set last_seen_at = now() where id = v_dev.id;
  return jsonb_build_object('inserted', v_inserted, 'head_seq', v_seq, 'head_hash', v_hash);
end;
$$;

create function public.propose_lock(p_device uuid, p_server text, p_tool text, p_digest text, p_definition jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dev public.devices;
  v_lock public.locks;
begin
  select * into v_dev from public.devices where id = p_device and status = 'active';
  if not found then
    raise exception 'device_not_active' using errcode = '42501';
  end if;
  if (select count(*) from public.locks where org_id = v_dev.org_id and status = 'pending') >= 500 then
    raise exception 'too many pending lock proposals' using errcode = '54000';
  end if;
  insert into public.locks (org_id, server_id, tool_name, digest, definition, proposed_by_device)
  values (v_dev.org_id, p_server, p_tool, p_digest, p_definition, v_dev.id)
  on conflict (org_id, server_id, tool_name, digest) do nothing;
  select * into v_lock from public.locks where org_id = v_dev.org_id and server_id = p_server and tool_name = p_tool and digest = p_digest;
  perform public.write_audit(v_dev.org_id, null, v_dev.id, 'lock.propose', p_server || '/' || p_tool, jsonb_build_object('digest', p_digest));
  return jsonb_build_object('id', v_lock.id, 'status', v_lock.status);
end;
$$;

create function public.complete_export(p_export uuid, p_count integer, p_manifest jsonb, p_manifest_sha text, p_path text, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exp public.exports;
begin
  select * into v_exp from public.exports where id = p_export for update;
  if not found or v_exp.status <> 'pending' then
    raise exception 'export not pending' using errcode = '55000';
  end if;
  update public.exports set
    status = case when p_error is null then 'ready'::public.export_status else 'failed'::public.export_status end,
    receipt_count = p_count, manifest = p_manifest, manifest_sha256 = p_manifest_sha, storage_path = p_path,
    error = left(p_error, 300), completed_at = now()
  where id = p_export;
  perform public.write_audit(v_exp.org_id, v_exp.requested_by, null, case when p_error is null then 'export.ready' else 'export.failed' end,
    p_export::text, jsonb_build_object('receipts', p_count, 'manifest_sha256', p_manifest_sha));
end;
$$;

-- Fixed-window counter shared by every serverless instance. Returns true when
-- the call is within the limit.
create function public.rate_limit_hit(p_bucket text, p_window_seconds integer, p_max integer) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into public.rate_limits as r (bucket, window_start, count) values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set count = r.count + 1
  returning r.count into v_count;
  delete from public.rate_limits where bucket = p_bucket and window_start < v_window;
  return v_count <= p_max;
end;
$$;

create function public.prune_rate_limits() returns integer
language sql
security definer
set search_path = ''
as $$
  with d as (delete from public.rate_limits where window_start < now() - interval '1 day' returning 1) select count(*)::integer from d;
$$;

-- ---------------------------------------------------------------- function privileges

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_member(uuid), public.has_role(uuid, public.org_role[]), public.org_role_of(uuid),
  public.create_org(text, text), public.create_invitation(uuid, text, public.org_role), public.revoke_invitation(uuid),
  public.accept_invitation(text), public.set_member_role(uuid, uuid, public.org_role), public.remove_member(uuid, uuid),
  public.create_device_enrollment(uuid), public.revoke_device(uuid), public.publish_policy(uuid, jsonb, text),
  public.decide_lock(uuid, boolean, text), public.start_export(uuid, timestamptz, timestamptz, jsonb), public.org_stats(uuid)
to authenticated;

grant execute on function public.device_for_token(text), public.enroll_device(text, text, text, text, text, text),
  public.ingest_receipts(uuid, integer, jsonb), public.propose_lock(uuid, text, text, text, jsonb),
  public.complete_export(uuid, integer, jsonb, text, text, text), public.rate_limit_hit(text, integer, integer),
  public.prune_rate_limits(), public.write_audit(uuid, uuid, uuid, text, text, jsonb)
to service_role;

-- service_role (the secret key) bypasses RLS but still needs table privileges
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
