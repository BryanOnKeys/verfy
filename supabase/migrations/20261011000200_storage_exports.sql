-- Private bucket for evidence exports. There are deliberately no storage.objects
-- policies for anon or authenticated: only the server (secret key) writes
-- exports, and people download them through short-lived signed URLs that the
-- server creates after checking their role (owner, admin or auditor).
insert into storage.buckets (id, name, public)
values ('exports', 'exports', false)
on conflict (id) do update set public = false;
