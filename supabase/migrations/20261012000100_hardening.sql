-- Atls: database-side hardening against resource exhaustion.
--
-- 1. Statement timeouts for the roles that browsers reach through the Data API. A slow or hostile query is cancelled
--    by Postgres instead of holding a connection. (Supabase ships similar defaults; setting them here makes them
--    explicit and keeps them if someone changes the project defaults.) The service role, used only by Atls's own
--    server code after its checks, keeps the platform default.
-- 2. Rate-limit windows are pruned as they are used, so a flood of unique keys cannot grow the table without bound,
--    and the function refuses nonsensical arguments.

alter role anon set statement_timeout = '3s';
alter role authenticated set statement_timeout = '8s';

create or replace function public.rate_limit_hit(p_bucket text, p_window_seconds integer, p_max integer) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  if p_bucket is null or char_length(p_bucket) > 200 or p_window_seconds not between 1 and 86400 or p_max < 1 then
    raise exception 'invalid rate limit' using errcode = '22023';
  end if;
  insert into public.rate_limits as r (bucket, window_start, count) values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set count = r.count + 1
  returning r.count into v_count;
  delete from public.rate_limits where bucket = p_bucket and window_start < v_window;
  -- about one call in five hundred also clears every expired window
  if random() < 0.002 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_count <= p_max;
end;
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

