-- Atls: two-factor authentication (TOTP) enforced by the database.
--
-- Once a user has a verified second factor, a session that has only passed the password step (aal1) sees no
-- organization data at all: every membership check below also requires aal2. The app sends such sessions to the code
-- prompt, but this is the layer that holds even if someone calls the Data API directly with a stolen aal1 token.
-- (Pattern from Supabase's guide "Enforce MFA via RLS": auth.mfa_factors + the `aal` claim of the JWT.)

create function public.mfa_ok() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
$$;

-- For the app: true when the caller has a verified factor but this session has not used it yet.
create function public.mfa_required() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and not public.mfa_ok();
$$;

create or replace function public.is_member(p_org uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.mfa_ok() and exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = auth.uid());
$$;

create or replace function public.has_role(p_org uuid, p_roles public.org_role[]) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.mfa_ok() and exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = auth.uid() and m.role = any (p_roles));
$$;

create or replace function public.org_role_of(p_org uuid) returns public.org_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.memberships m where m.org_id = p_org and m.user_id = auth.uid() and public.mfa_ok();
$$;

-- every state-changing function checks the caller through require_role, so this one guard covers all of them
create or replace function public.require_role(p_org uuid, p_roles public.org_role[]) returns uuid
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
  if not public.mfa_ok() then
    raise exception 'two-factor authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = v_uid and m.role = any (p_roles)) then
    raise exception 'permission denied for this organization' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

drop policy "profiles: self and teammates" on public.profiles;
create policy "profiles: self and teammates" on public.profiles for select to authenticated
  using (id = auth.uid() or (public.mfa_ok() and exists (
    select 1 from public.memberships a join public.memberships b on a.org_id = b.org_id
    where a.user_id = auth.uid() and b.user_id = profiles.id)));

revoke execute on function public.mfa_ok(), public.mfa_required() from public, anon;
grant execute on function public.mfa_ok(), public.mfa_required() to authenticated, service_role;
