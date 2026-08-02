-- PR 3 commit 10: maintainer publication moderation (spec sections 4.3, 10).
--
-- `published -> hidden` and `hidden -> published` are maintainer actions
-- through the controlled data panel — never app routes. This RPC is the
-- single audited mechanism: service-role-only, advisory-locked per row,
-- idempotent per target state, and it performs the lifecycle bookkeeping
-- the spec requires (hidden_at, moderation_reason, public thumbnail
-- cleanup job on hide; envelope is KEPT while hidden for restoration).
--
-- Withdrawn works are terminal and reject moderation. Community reads and
-- remix provenance already filter `status = 'published'`, so hiding removes
-- public access and new remixes immediately with no cache to revoke (all
-- community responses are no-store).

create or replace function public.artwork_publication_set_moderation(
  p_publication_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pub public.artwork_publications%rowtype;
  v_now timestamptz := now();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_action not in ('hide', 'restore') then
    raise exception 'validation_failed: action must be hide or restore';
  end if;

  select * into v_pub
  from public.artwork_publications
  where id = p_publication_id
  for update;
  if not found then
    raise exception 'not_found: publication not found';
  end if;
  if v_pub.status = 'withdrawn' then
    raise exception 'invalid_state: withdrawn works cannot be moderated';
  end if;

  if p_action = 'hide' then
    if v_pub.status = 'hidden' then
      -- Idempotent: re-hiding only refreshes the recorded reason.
      if v_reason is not null and v_reason is distinct from v_pub.moderation_reason then
        perform set_config('fractalpark.privileged_mutation', 'on', true);
        update public.artwork_publications
        set moderation_reason = v_reason
        where id = v_pub.id;
      end if;
      return jsonb_build_object(
        'publication_id', v_pub.id, 'status', 'hidden',
        'hidden_at', v_pub.hidden_at, 'replayed', true);
    end if;

    -- Public thumbnail deletion goes through the registered cleanup job
    -- (spec 4.3); the envelope stays for restoration.
    if v_pub.thumbnail_path is not null then
      insert into public.resource_cleanup_jobs (operation_id, owner_id, resource_type, resource_key)
      values (null, v_pub.owner_id, 'publication_thumbnail', v_pub.thumbnail_path);
    end if;

    perform set_config('fractalpark.privileged_mutation', 'on', true);
    update public.artwork_publications
    set status = 'hidden',
        hidden_at = v_now,
        moderation_reason = v_reason
    where id = v_pub.id;

    return jsonb_build_object(
      'publication_id', v_pub.id, 'status', 'hidden', 'hidden_at', v_now);
  end if;

  -- restore
  if v_pub.status = 'published' then
    return jsonb_build_object(
      'publication_id', v_pub.id, 'status', 'published', 'replayed', true);
  end if;

  perform set_config('fractalpark.privileged_mutation', 'on', true);
  update public.artwork_publications
  set status = 'published',
      hidden_at = null
  where id = v_pub.id;

  return jsonb_build_object(
    'publication_id', v_pub.id, 'status', 'published');
end;
$$;

revoke execute on function public.artwork_publication_set_moderation(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.artwork_publication_set_moderation(uuid, text, text)
  to service_role;
