-- v0.4.15 web creation loop: schema v1.
-- Contract: docs/specs/web-creation-loop-v1.md sections 4, 6, 7, 9, 10.
--
-- This migration creates the six cloud tables, constraints, indexes,
-- immutability triggers, RLS default-deny posture, storage buckets and
-- policies, and the narrow infrastructure RPCs (rate limiting, cleanup,
-- schema version, retention purges). Owner-facing write RPCs land with the
-- auth commit and are not part of this migration.
--
-- Design notes:
-- - Table and index creation deliberately has no IF NOT EXISTS: unsafe
--   re-execution must fail loudly (spec section 9). Functions use
--   create-or-replace so later forward migrations can redefine them; a
--   replayed file still fails on its first create table.
-- - Base tables expose no direct DML or SELECT to anon/authenticated. All
--   access flows through RPCs (spec section 10.1). service_role bypasses RLS
--   and receives explicit table grants for fixture and cleanup paths.
-- - Privileged lifecycle mutations (withdraw clearing content, account
--   deletion nulling owner_id) run only inside functions that set the
--   session flag fractalpark.privileged_mutation = 'on'; the frozen-field
--   trigger rejects those updates from any other context.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 40),
  backup_email_mode text not null default 'off'
    check (backup_email_mode in ('off', 'publish_only', 'save_and_publish')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.artwork_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  envelope jsonb not null check (jsonb_typeof(envelope) = 'object'),
  thumbnail_path text,
  revision integer not null default 1 check (revision >= 1),
  remix_source_type text check (remix_source_type in ('formula', 'preset', 'publication')),
  remix_source_id text,
  config_bytes integer not null default 0 check (config_bytes >= 0 and config_bytes <= 1048576),
  thumbnail_bytes integer not null default 0 check (thumbnail_bytes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((remix_source_type is null) = (remix_source_id is null))
);

create table public.artwork_publications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete set null,
  author_display_name text not null check (char_length(author_display_name) between 1 and 40),
  title text not null check (char_length(title) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  envelope jsonb check (envelope is null or jsonb_typeof(envelope) = 'object'),
  thumbnail_path text,
  thumbnail_status text not null default 'pending'
    check (thumbnail_status in ('pending', 'ready', 'failed')),
  thumbnail_attempts integer not null default 0 check (thumbnail_attempts >= 0),
  thumbnail_error_code text,
  license text not null default 'CC-BY-4.0' check (license = 'CC-BY-4.0'),
  license_scope text not null default 'artwork_image' check (license_scope = 'artwork_image'),
  rights_attestation_version text not null,
  license_version text not null,
  rights_attested_at timestamptz not null,
  remix_source_type text check (remix_source_type in ('formula', 'preset', 'publication')),
  remix_source_id text,
  status text not null default 'published'
    check (status in ('published', 'hidden', 'withdrawn')),
  published_at timestamptz not null default now(),
  hidden_at timestamptz,
  withdrawn_at timestamptz,
  moderation_reason text,
  check ((remix_source_type is null) = (remix_source_id is null)),
  check (hidden_at is null or hidden_at >= published_at),
  check (withdrawn_at is null or withdrawn_at >= published_at),
  check (
    (status = 'published' and hidden_at is null and withdrawn_at is null and envelope is not null)
    or (status = 'hidden' and hidden_at is not null and withdrawn_at is null and envelope is not null)
    or (status = 'withdrawn' and withdrawn_at is not null and envelope is null and description is null)
  )
);

create table public.artwork_operations (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null,
  owner_id uuid references auth.users (id) on delete set null,
  operation_type text not null
    check (operation_type in ('save_draft', 'publish_draft', 'delete_draft', 'withdraw_publication', 'delete_account')),
  request_hash text not null check (char_length(request_hash) between 32 and 128),
  status text not null default 'processing'
    check (status in ('processing', 'succeeded', 'failed')),
  draft_id uuid references public.artwork_drafts (id) on delete set null,
  publication_id uuid references public.artwork_publications (id) on delete set null,
  result_revision integer check (result_revision is null or result_revision >= 1),
  error_code text,
  backup_email_status text not null default 'not_requested'
    check (backup_email_status in ('not_requested', 'pending', 'sent', 'failed', 'unknown', 'skipped_rate_limit')),
  email_attempts integer not null default 0 check (email_attempts >= 0),
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

create table public.rate_limit_counters (
  policy_key text not null
    check (policy_key in ('otp_email_minute', 'otp_email_hour', 'otp_ip_hour', 'draft_save_5s', 'publish_user_day', 'backup_user_day')),
  subject_hash text not null check (char_length(subject_hash) between 32 and 128),
  window_started_at timestamptz not null,
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (policy_key, subject_hash)
);

create table public.resource_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid references public.artwork_operations (id) on delete set null,
  owner_id uuid references auth.users (id) on delete set null,
  resource_type text not null
    check (resource_type in ('draft_thumbnail', 'publication_thumbnail', 'auth_user')),
  resource_key text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status in ('succeeded', 'failed')) = (completed_at is not null))
);

-- ---------------------------------------------------------------------------
-- 2. Indexes (spec section 9)
-- ---------------------------------------------------------------------------

create index artwork_drafts_owner_updated_idx
  on public.artwork_drafts (owner_id, updated_at desc, id desc);

create index artwork_publications_community_idx
  on public.artwork_publications (status, published_at desc, id desc);

create index artwork_publications_owner_list_idx
  on public.artwork_publications (owner_id, status, published_at desc, id desc);

create index artwork_operations_owner_created_idx
  on public.artwork_operations (owner_id, created_at desc, id desc);

create index artwork_operations_retention_idx
  on public.artwork_operations (created_at);

create index rate_limit_counters_window_idx
  on public.rate_limit_counters (updated_at);

create index resource_cleanup_jobs_claim_idx
  on public.resource_cleanup_jobs (status, next_attempt_at);

-- ---------------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------------

-- updated_at maintenance.
create or replace function public.fractalpark_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.fractalpark_touch_updated_at();
create trigger artwork_drafts_touch before update on public.artwork_drafts
  for each row execute function public.fractalpark_touch_updated_at();
create trigger artwork_operations_touch before update on public.artwork_operations
  for each row execute function public.fractalpark_touch_updated_at();
create trigger resource_cleanup_jobs_touch before update on public.resource_cleanup_jobs
  for each row execute function public.fractalpark_touch_updated_at();

-- Frozen fields on drafts: identity, owner, provenance, creation time never
-- change; revision only ever increments by exactly one per update.
create or replace function public.fractalpark_drafts_frozen_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id
     or new.owner_id <> old.owner_id
     or new.created_at <> old.created_at
     or new.remix_source_type is distinct from old.remix_source_type
     or new.remix_source_id is distinct from old.remix_source_id then
    raise exception 'frozen draft field update rejected';
  end if;
  if new.revision <> old.revision + 1 then
    raise exception 'draft revision must increment by exactly one';
  end if;
  return new;
end;
$$;

create trigger artwork_drafts_frozen before update on public.artwork_drafts
  for each row execute function public.fractalpark_drafts_frozen_fields();

-- Frozen fields on publications. Lifecycle columns (status, timestamps,
-- moderation, thumbnail diagnostics) stay mutable. Frozen columns never
-- change. Privileged lifecycle mutations (session flag
-- fractalpark.privileged_mutation = 'on', set with SET LOCAL inside the
-- owning function) may additionally clear envelope/description to null
-- (withdrawal). owner_id may only ever be nulled (account deletion /
-- FK ON DELETE SET NULL), never reassigned, in any context.
create or replace function public.fractalpark_publications_frozen_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  privileged boolean := coalesce(
    current_setting('fractalpark.privileged_mutation', true) = 'on', false);
begin
  if new.id <> old.id
     or new.author_display_name <> old.author_display_name
     or new.title <> old.title
     or new.published_at <> old.published_at
     or new.rights_attestation_version <> old.rights_attestation_version
     or new.license_version <> old.license_version
     or new.rights_attested_at <> old.rights_attested_at
     or new.license <> old.license
     or new.license_scope <> old.license_scope
     or new.remix_source_type is distinct from old.remix_source_type
     or new.remix_source_id is distinct from old.remix_source_id then
    raise exception 'frozen publication field update rejected';
  end if;
  if new.owner_id is not null and new.owner_id <> old.owner_id then
    raise exception 'owner_id may only be nulled';
  end if;
  if not privileged then
    if new.envelope is distinct from old.envelope
       or new.description is distinct from old.description then
      raise exception 'publication content update rejected outside lifecycle mutation';
    end if;
  else
    -- Privileged lifecycle mutations may only clear content, never rewrite
    -- it: withdrawal clears envelope and description to null.
    if (new.envelope is not null and new.envelope is distinct from old.envelope)
       or (new.description is not null and new.description is distinct from old.description) then
      raise exception 'lifecycle mutations may only clear publication content';
    end if;
  end if;
  return new;
end;
$$;

create trigger artwork_publications_frozen before update on public.artwork_publications
  for each row execute function public.fractalpark_publications_frozen_fields();

-- artwork_operations: identity and idempotency fields are frozen; only the
-- result, status, and backup-email phase may advance. owner_id is not
-- frozen (spec section 4.4 nulls it when the auth user is removed), but it
-- may only be nulled, never reassigned.
create or replace function public.fractalpark_operations_frozen_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id
     or new.idempotency_key <> old.idempotency_key
     or new.operation_type <> old.operation_type
     or new.request_hash <> old.request_hash
     or new.created_at <> old.created_at then
    raise exception 'frozen operation field update rejected';
  end if;
  if new.owner_id is not null and new.owner_id <> old.owner_id then
    raise exception 'owner_id may only be nulled';
  end if;
  return new;
end;
$$;

create trigger artwork_operations_frozen before update on public.artwork_operations
  for each row execute function public.fractalpark_operations_frozen_fields();

-- ---------------------------------------------------------------------------
-- 4. Row level security: default deny on base tables (spec section 10.1)
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.artwork_drafts enable row level security;
alter table public.artwork_drafts force row level security;
alter table public.artwork_publications enable row level security;
alter table public.artwork_publications force row level security;
alter table public.artwork_operations enable row level security;
alter table public.artwork_operations force row level security;
alter table public.rate_limit_counters enable row level security;
alter table public.rate_limit_counters force row level security;
alter table public.resource_cleanup_jobs enable row level security;
alter table public.resource_cleanup_jobs force row level security;

-- No policies are created for anon or authenticated: with no grants and no
-- policies, base tables are unreachable outside RPCs and the service role.
-- Defense in depth: they may not create objects in the public schema either.

revoke create on schema public from anon, authenticated;

revoke all on public.profiles from anon, authenticated;
revoke all on public.artwork_drafts from anon, authenticated;
revoke all on public.artwork_publications from anon, authenticated;
revoke all on public.artwork_operations from anon, authenticated;
revoke all on public.rate_limit_counters from anon, authenticated;
revoke all on public.resource_cleanup_jobs from anon, authenticated;

grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.artwork_drafts to service_role;
grant select, insert, update, delete on public.artwork_publications to service_role;
grant select, insert, update, delete on public.artwork_operations to service_role;
grant select, insert, update, delete on public.rate_limit_counters to service_role;
grant select, insert, update, delete on public.resource_cleanup_jobs to service_role;

-- ---------------------------------------------------------------------------
-- 5. Infrastructure RPCs (spec sections 4.5, 4.6, 9)
-- ---------------------------------------------------------------------------

-- Public schema version probe used by the runtime fail-closed preflight.
create or replace function public.fractalpark_schema_version()
returns text
language sql
stable
security invoker
set search_path = ''
as $$ select '20260802000000'::text $$;

revoke execute on function public.fractalpark_schema_version() from public;
grant execute on function public.fractalpark_schema_version() to anon, authenticated, service_role;

-- Transactional rate-limit read / window reset / limit check / increment
-- (spec section 4.5). Limits and window lengths are server configuration,
-- passed in per call and never stored on counter rows.
create or replace function public.fractalpark_rate_limit_consume(
  p_policy_key text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count integer;
  v_window_end timestamptz;
begin
  if p_limit is null or p_limit < 1 then
    raise exception 'rate limit must be a positive integer';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'rate limit window must be a positive number of seconds';
  end if;

  insert into public.rate_limit_counters (policy_key, subject_hash, window_started_at, count, updated_at)
  values (p_policy_key, p_subject_hash, v_now, 0, v_now)
  on conflict (policy_key, subject_hash) do nothing;

  select c.window_started_at, c.count into v_window_start, v_count
  from public.rate_limit_counters c
  where c.policy_key = p_policy_key and c.subject_hash = p_subject_hash
  for update;

  v_window_end := v_window_start + make_interval(secs => p_window_seconds);
  if v_now >= v_window_end then
    update public.rate_limit_counters c
    set window_started_at = v_now, count = 0, updated_at = v_now
    where c.policy_key = p_policy_key and c.subject_hash = p_subject_hash;
    v_window_start := v_now;
    v_count := 0;
    v_window_end := v_now + make_interval(secs => p_window_seconds);
  end if;

  if v_count >= p_limit then
    return query select false,
      greatest(1, ceil(extract(epoch from (v_window_end - v_now)))::integer);
    return;
  end if;

  update public.rate_limit_counters c
  set count = c.count + 1, updated_at = v_now
  where c.policy_key = p_policy_key and c.subject_hash = p_subject_hash;
  return query select true, 0;
end;
$$;

revoke execute on function public.fractalpark_rate_limit_consume(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.fractalpark_rate_limit_consume(text, text, integer, integer) to service_role;

-- Counters become eligible for cleanup 48 hours after they were last touched
-- (spec section 4.5); a counter untouched that long is past any window end.
create or replace function public.fractalpark_purge_rate_limit_counters()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limit_counters
  where updated_at < now() - interval '48 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.fractalpark_purge_rate_limit_counters() from public, anon, authenticated;
grant execute on function public.fractalpark_purge_rate_limit_counters() to service_role;

-- Terminal save/delete operations are retained 30 days (spec section 4.4).
create or replace function public.fractalpark_purge_expired_operations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.artwork_operations
  where operation_type in ('save_draft', 'delete_draft')
    and status in ('succeeded', 'failed')
    and created_at < now() - interval '30 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.fractalpark_purge_expired_operations() from public, anon, authenticated;
grant execute on function public.fractalpark_purge_expired_operations() to service_role;

-- Atomically claim pending cleanup jobs for the asynchronous worker
-- (spec section 4.6): pending and due, bounded, skip-locked.
create or replace function public.fractalpark_claim_cleanup_jobs(p_limit integer default 10)
returns setof public.resource_cleanup_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select j.id
    from public.resource_cleanup_jobs j
    where j.status = 'pending' and j.next_attempt_at <= now()
    order by j.next_attempt_at
    limit p_limit
    for update skip locked
  )
  update public.resource_cleanup_jobs j
  set status = 'processing', attempts = j.attempts + 1, updated_at = now()
  from due
  where j.id = due.id
  returning j.*;
end;
$$;

revoke execute on function public.fractalpark_claim_cleanup_jobs(integer) from public, anon, authenticated;
grant execute on function public.fractalpark_claim_cleanup_jobs(integer) to service_role;

-- Complete a claimed job. Success and exhausted retries are terminal; a
-- retryable failure returns to pending with bounded exponential backoff
-- (base 5 minutes, doubling per attempt, capped at one day). Cleanup failure
-- never restores access (spec section 4.6).
create or replace function public.fractalpark_complete_cleanup_job(
  p_job_id uuid,
  p_success boolean,
  p_error_code text default null,
  p_max_attempts integer default 8
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  select j.attempts into v_attempts
  from public.resource_cleanup_jobs j
  where j.id = p_job_id and j.status = 'processing'
  for update;

  if v_attempts is null then
    raise exception 'cleanup job % is not in processing state', p_job_id;
  end if;

  if p_success then
    update public.resource_cleanup_jobs j
    set status = 'succeeded', error_code = null, completed_at = now(), updated_at = now()
    where j.id = p_job_id;
  elsif v_attempts >= p_max_attempts then
    update public.resource_cleanup_jobs j
    set status = 'failed', error_code = p_error_code, completed_at = now(), updated_at = now()
    where j.id = p_job_id;
  else
    update public.resource_cleanup_jobs j
    set status = 'pending',
        error_code = p_error_code,
        next_attempt_at = now() + (least(5 * power(2, greatest(v_attempts - 1, 0)), 1440) || ' minutes')::interval,
        updated_at = now()
    where j.id = p_job_id;
  end if;
end;
$$;

revoke execute on function public.fractalpark_complete_cleanup_job(uuid, boolean, text, integer) from public, anon, authenticated;
grant execute on function public.fractalpark_complete_cleanup_job(uuid, boolean, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Storage buckets and policies (spec section 4.7)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values
  ('draft-thumbnails', 'draft-thumbnails', false),
  ('publication-thumbnails', 'publication-thumbnails', true);

-- Public thumbnails are world-readable; every write is server-only (the
-- service role bypasses storage RLS). Draft thumbnails have no user-facing
-- policies at all: reads happen only through 5-minute signed URLs minted by
-- the server, writes only through the server pipeline.
create policy publication_thumbnails_public_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'publication-thumbnails');
