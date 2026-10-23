-- Verfy: the waitlist for the hosted Team plan (Verfy Cloud).
--
-- Filled only by POST /api/v1/waitlist with the server's secret key, after the request passed the same-origin check
-- and the per-IP rate limit. Browsers cannot read or write it: RLS is on and there are no policies or grants for
-- anon or authenticated. Emails are stored lower-cased so one address joins once.

create table public.waitlist (
  id bigint generated always as identity primary key,
  email text not null unique check (char_length(email) between 3 and 254 and email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  company text not null default '' check (char_length(company) <= 120),
  team_size text not null default '' check (team_size in ('', '1', '2-10', '11-50', '51-200', '200+')),
  agents text[] not null default '{}' check (cardinality(agents) <= 8 and agents <@ array['claude-code', 'cursor', 'claude-desktop', 'codex', 'copilot', 'windsurf', 'own-agent', 'other']),
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;
revoke all on public.waitlist from public, anon, authenticated;
