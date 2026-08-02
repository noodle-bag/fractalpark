# Moderation Runbook — Community Publications

Maintainer operations for hiding and restoring published artworks. These are
**controlled data panel** actions (spec section 10): there is no app route,
no browser path, and no owner-facing control. The single audited mechanism
is the service-role-only RPC `artwork_publication_set_moderation`.

## When to hide

- A Report/Takedown intake (mailto:contact@fractalpark.com, linked from every
  community artwork page) is verified as actionable: CSAM, doxxing, malware,
  clear spam, or a credible rights-holder complaint.
- Hide first, deliberate second. Hiding is reversible; withdrawn is not.

## What hiding does (spec 4.3)

- Removes the work from Community list/detail immediately (reads filter
  `status = 'published'`; all community responses are `no-store`, so there
  is no cache to revoke).
- Blocks new remixes (provenance validation requires `published`).
- Keeps the envelope for restoration.
- Registers a `publication_thumbnail` cleanup job that deletes the public
  thumbnail asset.
- The owner still sees the row in My Works, marked as hidden, and may
  withdraw it permanently. Existing remixes already granted CC BY 4.0 are
  never revoked.

## How to hide / restore

Run in the Supabase SQL editor (postgres) or via `psql` with the service
role. Always include a reason — it is non-public, maintainer-only, and is
the audit trail.

```sql
-- Hide
select public.artwork_publication_set_moderation(
  '<publication-uuid>'::uuid,
  'hide',
  'takedown <ticket-or-email-reference> — <short basis>'
);

-- Restore (clears hidden_at; the reason stays as the historical record)
select public.artwork_publication_set_moderation(
  '<publication-uuid>'::uuid,
  'restore'
);
```

Properties of the RPC:

- Idempotent per target state: re-hiding only refreshes the reason;
  re-restoring a published work is a no-op (`"replayed": true`).
- Withdrawn works are terminal and reject both actions (`invalid_state`).
- Not executable by `anon` or `authenticated`; attempts fail closed.

## Verify after acting

```bash
# Community detail must 404 while hidden, 200 again after restore.
curl -s -o /dev/null -w '%{http_code}\n' \
  https://<host>/api/creation/publications/<publication-uuid>
```

## Record

Log every action in the takedown ticket: publication id, action, reason,
operator, timestamp, and the verification result. `moderation_reason` must
never contain personal data beyond the ticket reference.
