-- Test shim for the parts of a Supabase database that Atls's migrations use:
-- the anon / authenticated / service_role roles, auth.users, auth.identities, auth.mfa_factors,
-- auth.uid(), auth.jwt(), storage.buckets and stand-ins for pgcrypto's crypt().
-- Only for supabase/tests (PGlite). Never apply this to a real Supabase project.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create schema auth;
create table auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text,
  email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz,
  updated_at timestamptz, confirmation_token text, email_change text, email_change_token_new text, recovery_token text);
create table auth.identities (
  id uuid primary key, user_id uuid references auth.users (id), provider_id text, identity_data jsonb, provider text,
  last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz, unique (provider_id, provider));
-- the columns of auth.mfa_factors that Atls's MFA checks read (Supabase uses enum types for type and status)
create table auth.mfa_factors (
  id uuid primary key, user_id uuid not null references auth.users (id) on delete cascade, friendly_name text,
  factor_type text not null default 'totp', status text not null default 'unverified', secret text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create schema extensions;
create function extensions.gen_salt(text) returns text language sql as $$ select 'test-salt' $$;
create function extensions.crypt(text, text) returns text language sql as $$ select 'test-hash:' || md5($1 || $2) $$;
-- same definition as Supabase: PostgREST sets request.jwt.claims (JSON); older setups set request.jwt.claim.sub
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean default false);
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
