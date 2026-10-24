-- Verfy: the approval queue.
--
-- When the MCP gateway runs with "on_ask": "team", a call that needs approval is sent here instead of being blocked.
-- The device waits (it polls GET /api/v1/approvals/{id}) while an owner or admin approves or rejects it in the
-- dashboard. A request that nobody decides before expires_at counts as rejected.
--
-- What is stored: the server and tool name, the action kind, the SHA-256 of the arguments and the rule IDs and
-- messages that asked. Arguments themselves are never sent. Rule messages can name a path or a host (for example
-- "Changes /etc/hosts"); the CLI redacts secrets in them before sending.
--
-- Devices create requests only through request_approval() (service role, after device authentication); people
-- decide only through decide_approval(), which checks the role and writes the audit entry in the same transaction.

create type public.approval_status as enum ('pending', 'approved', 'rejected', 'expired');

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  device_id uuid references public.devices (id) on delete set null,
  server_id text not null check (char_length(server_id) between 1 and 200),
  tool_name text not null check (char_length(tool_name) between 1 and 200),
  kind text not null check (char_length(kind) between 1 and 40),
  args_sha256 text not null check (args_sha256 ~ '^sha256:[0-9a-f]{64}$'),
  findings jsonb not null check (jsonb_typeof(findings) = 'array' and jsonb_array_length(findings) between 1 and 20 and pg_column_size(findings) <= 8192),
  status public.approval_status not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 200),
  check (expires_at > created_at and expires_at <= created_at + interval '15 minutes'),
  check ((status in ('pending', 'expired')) = (decided_at is null))
);
create index approvals_org_status_idx on public.approvals (org_id, status, created_at desc);

alter table public.approvals enable row level security;
revoke all on public.approvals from public, anon, authenticated;
grant select on public.approvals to authenticated;
grant select, insert, update, delete on public.approvals to service_role;
create policy "approvals: members read" on public.approvals for select to authenticated using (public.is_member(org_id));

-- Pending requests past their deadline become expired the next time anyone touches the queue.
create function public.expire_approvals(p_org uuid) returns void
language sql
security definer
set search_path = ''
as $$
  update public.approvals set status = 'expired' where org_id = p_org and status = 'pending' and expires_at <= now();
$$;

create function public.request_approval(p_device uuid, p_server text, p_tool text, p_kind text, p_args_sha text, p_findings jsonb, p_ttl_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dev public.devices;
  v_row public.approvals;
begin
  select * into v_dev from public.devices where id = p_device and status = 'active';
  if not found then
    raise exception 'device_not_active' using errcode = '42501';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds < 10 or p_ttl_seconds > 900 then
    raise exception 'ttl must be between 10 and 900 seconds' using errcode = '22023';
  end if;
  perform public.expire_approvals(v_dev.org_id);
  if (select count(*) from public.approvals where org_id = v_dev.org_id and status = 'pending') >= 200 then
    raise exception 'too many pending approvals' using errcode = '54000';
  end if;
  insert into public.approvals (org_id, device_id, server_id, tool_name, kind, args_sha256, findings, expires_at)
  values (v_dev.org_id, v_dev.id, p_server, p_tool, p_kind, p_args_sha, p_findings, now() + make_interval(secs => p_ttl_seconds))
  returning * into v_row;
  perform public.write_audit(v_dev.org_id, null, v_dev.id, 'approval.request', p_server || '/' || p_tool, jsonb_build_object('id', v_row.id, 'args_sha256', p_args_sha));
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'expires_at', v_row.expires_at);
end;
$$;

-- What the device that asked sees when it polls. Another device, even in the same organization, gets "not found".
create function public.approval_for_device(p_device uuid, p_id uuid) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.approvals;
begin
  update public.approvals set status = 'expired' where id = p_id and device_id = p_device and status = 'pending' and expires_at <= now();
  select * into v_row from public.approvals where id = p_id and device_id = p_device;
  if not found then
    raise exception 'approval not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'expires_at', v_row.expires_at, 'decided_at', v_row.decided_at,
    'decided_by', (select coalesce(nullif(p.display_name, ''), 'admin') from public.profiles p where p.id = v_row.decided_by),
    'note', v_row.decision_note);
end;
$$;

create function public.decide_approval(p_id uuid, p_approve boolean, p_note text) returns public.approval_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.approvals;
  v_uid uuid;
  v_status public.approval_status := case when p_approve then 'approved' else 'rejected' end;
begin
  select * into v_row from public.approvals where id = p_id for update;
  if not found then
    raise exception 'approval not found' using errcode = 'P0002';
  end if;
  v_uid := public.require_role(v_row.org_id, array['owner', 'admin']::public.org_role[]);
  if v_row.status = 'pending' and v_row.expires_at <= now() then
    raise exception 'this request expired before it was decided' using errcode = '55000';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'this request was already decided' using errcode = '55000';
  end if;
  update public.approvals set status = v_status, decided_by = v_uid, decided_at = now(),
    decision_note = nullif(left(btrim(coalesce(p_note, '')), 200), '')
  where id = p_id;
  perform public.write_audit(v_row.org_id, v_uid, null, case when p_approve then 'approval.approve' else 'approval.reject' end,
    v_row.server_id || '/' || v_row.tool_name, jsonb_build_object('id', p_id, 'args_sha256', v_row.args_sha256));
  return v_status;
end;
$$;

revoke execute on function public.expire_approvals(uuid), public.request_approval(uuid, text, text, text, text, jsonb, integer),
  public.approval_for_device(uuid, uuid), public.decide_approval(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.decide_approval(uuid, boolean, text) to authenticated;
grant execute on function public.expire_approvals(uuid), public.request_approval(uuid, text, text, text, text, jsonb, integer),
  public.approval_for_device(uuid, uuid) to service_role;
