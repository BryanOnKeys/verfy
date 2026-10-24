-- Verfy: notifications to Slack or Telegram.
--
-- An owner or admin connects a Slack incoming webhook or a Telegram bot to the organization and picks the events:
--   approval.request  a call through the gateway waits in the approval queue
--   lock.propose      a device reports a changed or new MCP tool definition
--   receipt.deny      uploaded receipts include denied calls
--   device.silent     an active device has not uploaded receipts for 24 hours
--
-- The webhook URL or bot token is a secret. Browsers never read it: the table has RLS on and no grants for anon or
-- authenticated. People manage channels only through the functions below (role checked, audit entry written); the list
-- function returns a masked target. The server reads the full target with the secret key when it sends a message.

create table public.notification_channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  kind text not null check (kind in ('slack', 'telegram')),
  target text not null check (char_length(target) between 10 and 300),
  label text not null check (char_length(label) between 1 and 80),
  events text[] not null check (cardinality(events) between 1 and 4 and events <@ array['approval.request', 'lock.propose', 'receipt.deny', 'device.silent']),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  last_error text check (char_length(last_error) <= 300),
  check (
    (kind = 'slack' and target ~ '^https://hooks\.slack\.com/services/[A-Za-z0-9/_-]+$')
    or (kind = 'telegram' and target ~ '^[0-9]{5,12}:[A-Za-z0-9_-]{30,50}\|-?[0-9]{1,20}$')
  )
);
create index notification_channels_org_idx on public.notification_channels (org_id);

alter table public.notification_channels enable row level security;
revoke all on public.notification_channels from public, anon, authenticated;
grant select, insert, update, delete on public.notification_channels to service_role;

-- device.silent fires once per silence: cleared when the device uploads again
alter table public.devices add column silence_alerted_at timestamptz;

create function public.add_notification_channel(p_org uuid, p_kind text, p_target text, p_label text, p_events text[]) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_role(p_org, array['owner', 'admin']::public.org_role[]);
  v_id uuid;
begin
  if (select count(*) from public.notification_channels where org_id = p_org) >= 10 then
    raise exception 'an organization can have at most 10 notification channels' using errcode = '54000';
  end if;
  insert into public.notification_channels (org_id, kind, target, label, events, created_by)
  values (p_org, p_kind, p_target, btrim(p_label), p_events, v_uid) returning id into v_id;
  perform public.write_audit(p_org, v_uid, null, 'notification.add', p_kind || ': ' || btrim(p_label), jsonb_build_object('events', p_events));
  return v_id;
end;
$$;

create function public.remove_notification_channel(p_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.notification_channels;
  v_uid uuid;
begin
  select * into v_row from public.notification_channels where id = p_id;
  if not found then
    raise exception 'channel not found' using errcode = 'P0002';
  end if;
  v_uid := public.require_role(v_row.org_id, array['owner', 'admin']::public.org_role[]);
  delete from public.notification_channels where id = p_id;
  perform public.write_audit(v_row.org_id, v_uid, null, 'notification.remove', v_row.kind || ': ' || v_row.label, '{}');
end;
$$;

-- What people see: never the full webhook URL or bot token
create function public.list_notification_channels(p_org uuid) returns table (
  id uuid, kind text, label text, events text[], target_hint text, created_at timestamptz, last_sent_at timestamptz, last_error text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_role(p_org, array['owner', 'admin']::public.org_role[]);
  return query
    select c.id, c.kind, c.label, c.events,
      case when c.kind = 'slack' then 'hooks.slack.com/…' || right(c.target, 4) else 'chat ' || split_part(c.target, '|', 2) end,
      c.created_at, c.last_sent_at, c.last_error
    from public.notification_channels c where c.org_id = p_org order by c.created_at;
end;
$$;

-- For the daily check (service role): active devices whose last upload is older than p_hours and that were not
-- reported for this silence yet. A device that uploads again moves last_seen_at past silence_alerted_at.
create function public.silent_devices(p_hours integer) returns table (id uuid, org_id uuid, name text, last_seen_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select d.id, d.org_id, d.name, d.last_seen_at from public.devices d
  where d.status = 'active' and d.last_seen_at is not null and d.last_seen_at < now() - make_interval(hours => greatest(p_hours, 1))
    and (d.silence_alerted_at is null or d.silence_alerted_at < d.last_seen_at)
  order by d.org_id, d.last_seen_at
  limit 500;
$$;

create function public.mark_silence_alerted(p_ids uuid[]) returns void
language sql
security definer
set search_path = ''
as $$
  update public.devices set silence_alerted_at = now() where id = any(p_ids);
$$;

revoke execute on function public.add_notification_channel(uuid, text, text, text, text[]), public.remove_notification_channel(uuid),
  public.list_notification_channels(uuid), public.silent_devices(integer), public.mark_silence_alerted(uuid[]) from public, anon, authenticated;
grant execute on function public.add_notification_channel(uuid, text, text, text, text[]), public.remove_notification_channel(uuid),
  public.list_notification_channels(uuid) to authenticated;
grant execute on function public.silent_devices(integer), public.mark_silence_alerted(uuid[]) to service_role;
