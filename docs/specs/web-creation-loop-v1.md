# Web Creation Loop v1

- Status: Accepted
- Date: 2026-08-01
- Target release: FractalPark v0.4.15
- Scope: Same-origin cloud creation, email identity, private drafts, and
  community publication

## Purpose

v0.4.15 closes the in-site creation loop: an anonymous visitor can explore,
create, remix, save locally, and export; a signed-in owner can keep private
cloud drafts, publish immutable public revisions to the Community gallery,
and remix published work into new drafts.

This specification freezes the cloud creation contracts: the server-only
feature switch, the same-origin API v1, resources and DTOs, lifecycle state
machines, error codes, caching, idempotency, rate limits, quotas, the
`CloudArtworkEnvelopeV1` server validation profile, SQL invariants, and the
local–cloud binding rules.

It complements [Fractal Document v2 and Envelope v1](fractal-document-v2.md)
and [Fractal Content and Creation Model](fractal-content-and-creation-model.md).
It does not create a second artwork fact model: `FractalDocument` and
Envelope v1 remain the only artwork facts; this specification owns their
cloud lifecycle, ownership, and visibility boundaries.

Session mechanics are decided in
[ADR 0005](../adr/0005-same-origin-cloud-session.md). Community routing and
indexing rules are owned by
[Artwork and Location Route Contract](artwork-and-location-routes.md). Event
payloads are registered in [Analytics Event Schema v1](analytics-events-v1.md).

## 1. Feature Switch and Environments

- `FRACTALPARK_CREATION_CLOUD_ENABLED` is a server-only switch. A missing or
  non-`true` value means off. No `NEXT_PUBLIC_` variant exists.
- The switch gates UI entry points, page data reads, and every cloud API
  route together. Hiding buttons alone does not constitute off.
- While the switch is off, the site must build and run with no Supabase or
  SMTP configuration present, and existing Gallery, Explore, local save,
  import/export, and the official Collection behave exactly as before. Cloud
  clients must not be initialized at module load or build time.
- The artwork backup email has a separate server-only switch
  (`FRACTALPARK_ARTWORK_EMAIL_BACKUP_ENABLED`) so email can stop while save
  and publish remain available.
- Production and ordinary preview deployments keep the switch off for the
  entire v0.4.15 rollout. One maintainer-designated integration preview may
  hold staging credentials and enable the switch for end-to-end acceptance.
  Production enablement is a separate manual operation after migration,
  backup, and acceptance, and always redeploys from the same accepted commit.
- Database migrations run only when the designated migration owner of a pull
  request executes them explicitly. They never run during build, application
  startup, preview deployment, or health checks. An older deployment that
  detects an incompatible schema version fails closed and never attempts
  repairs.

## 2. Artwork Facts and Lifecycle

```text
local recovery state
  └─ explicit cloud save → mutable private draft (owner only)
                              └─ publish → immutable public revision
                                  ├─ withdraw → unavailable for discovery/new remix
                                  └─ remix → new local state/private draft
```

- The complete `FractalDocumentEnvelopeV1` is the sole artwork fact. Title,
  description, author snapshot, visibility, timestamps, license, and
  provenance are record metadata. Thumbnails are derived assets and never
  become artwork facts.
- A published revision is immutable. Draft updates never overwrite it;
  continued work forks through Remix into a new local state or private
  draft.
- There is no unlisted state. Works are private drafts, public revisions, or
  withdrawn. Directed sharing uses the `.fractal.json` export.
- Anonymous browsing, creation, remix, local save, and export never require
  sign-in. Cloud drafts, draft management, and publishing require sign-in.

## 3. Identity

- Sign-in uses a six-digit one-time code delivered to the user's email.
- The browser talks only to FractalPark's same-origin Auth API. It never
  calls the identity provider's endpoints directly and never holds tokens.
- The first successful OTP creates only a stable user ID. A display name is
  required once, before the first publish, and may collide across users;
  the immutable internal user ID is the real identity.
- The email address provides identity continuity and owner proof and raises
  the cost of bulk registration. It is never published, never copied into
  profiles, and backup emails are sent only to the currently verified
  account address — never to a user-supplied arbitrary recipient.
- Account deletion requires a fresh OTP plus an explicit second
  confirmation. The step-up proof is single-use, scoped to `delete_account`,
  and expires after 10 minutes.

## 4. Resources and DTOs

Six tables and two storage buckets carry the cloud state.

### 4.1 `profiles`

| Field | Contract |
|---|---|
| `user_id` | UUID primary key referencing the auth user; cascades on account deletion |
| `display_name` | Nullable; required before first publish, 1–40 characters, may collide |
| `backup_email_mode` | `off \| publish_only \| save_and_publish`, default `off` |
| `created_at` / `updated_at` | Lifecycle timestamps |

- Rows are created lazily: a missing row equals all defaults. The first OTP
  login does not create a profile.
- No email copy, no arbitrary recipient address, no avatar, bio, public
  slug, social fields, or role.
- Owner read/write only; not readable by other users or maintainers.

### 4.2 `artwork_drafts`

| Field | Contract |
|---|---|
| `id` | UUID primary key |
| `owner_id` | Immutable after creation; cascades on account deletion |
| `title` | 1–80 characters; a server-consistent projection of the envelope artwork name, not a second fact |
| `envelope` | Complete `FractalDocumentEnvelopeV1`; the only editable artwork fact |
| `thumbnail_path` | Nullable; points into the private `draft-thumbnails` bucket; thumbnail failure never blocks saving the configuration |
| `revision` | Starts at 1, atomically incremented per successful save |
| `remix_source_type` / `remix_source_id` | Nullable as a pair; `formula`, `preset`, or `publication`; immutable after creation |
| `config_bytes` / `thumbnail_bytes` | Server-computed; drives per-item and per-account quotas |
| `created_at` / `updated_at` | Lifecycle timestamps |

- Updates carry the client's expected `revision`; a mismatch returns a
  conflict and never overwrites the server version. v0.4.15 offers reload or
  save-as-new; it does not auto-merge.
- Only the owner can list, create, read, update, delete, or export.
  Anonymous users, other users, and maintainers cannot read private drafts.
- Drafts may carry portable formula assets; those drafts can be saved,
  opened, exported, and emailed, but cannot be published to Community.
  *(Superseded in v0.4.16: strict formula-asset publication acceptance — see §17.2.)*
- Deletion is permanent and cleans up the private thumbnail.

### 4.3 `artwork_publications`

| Field | Contract |
|---|---|
| `id` | UUID primary key; also the stable public artwork ID |
| `owner_id` | Nullable; set to null on account deletion |
| `author_display_name` | Frozen 1–40 character attribution snapshot; later profile renames never rewrite it |
| `title` / `description` | 1–80 / 0–500 characters; immutable after publish; description cleared on withdrawal |
| `envelope` | Immutable snapshot; public while `published`, retained while `hidden`, cleared when `withdrawn` |
| `thumbnail_path` | Nullable public derived thumbnail; a fixed placeholder stands in before generation and after failure |
| `thumbnail_status` | `pending \| ready \| failed`; server-assigned only |
| `thumbnail_attempts` / `thumbnail_error_code` | Server diagnostics; internal errors are never exposed |
| `license` / `license_scope` | Fixed `CC-BY-4.0` / `artwork_image` |
| `rights_attestation_version` / `license_version` / `rights_attested_at` | Frozen attestation and license display versions plus server-recorded time; never client-assigned |
| `remix_source_type` / `remix_source_id` | Nullable as a pair; frozen direct source |
| `status` | `published \| hidden \| withdrawn` |
| `published_at` / `hidden_at` / `withdrawn_at` | Lifecycle timestamps; inapplicable states stay null |
| `moderation_reason` | Nullable, non-public, maintainer-only |

- Publishing validates the display name, title, description, envelope,
  provenance, license attestation, rate limits, and quotas; any envelope
  containing portable formula source is rejected. On success the source
  cloud draft is deleted and the work appears under My Works → Published.
- After publish, only lifecycle state, its timestamps, moderation records,
  and the derived thumbnail may change.
- `published → hidden` and `hidden → published` are maintainer actions
  through the controlled data panel. Hidden removes public access and new
  remixes immediately, keeps the envelope for restoration, and deletes the
  public thumbnail through a registered cleanup job.
- `published | hidden → withdrawn` is triggered by the owner or by account
  deletion, is permanent, and clears envelope, description, and thumbnail,
  leaving a minimal tombstone: artwork ID, title, attribution snapshot,
  license and scope, publish time, withdrawal time, and the direct source
  chain.
- Ordinary reads and new remixes reject withdrawn works. Existing public
  derivatives may resolve attribution through the minimal projection in
  §10.3. Withdrawal and hiding never revoke remixes or CC BY 4.0 rights
  already granted.

### 4.4 `artwork_operations`

| Field | Contract |
|---|---|
| `id` | Server-generated UUID |
| `idempotency_key` | Client UUID per logical write; scoped per owner |
| `owner_id` | Set by the server session; nulled when the auth user is finally removed |
| `operation_type` | `save_draft \| publish_draft \| delete_draft \| withdraw_publication \| delete_account` |
| `request_hash` | Server digest of the operation's key parameters |
| `status` | `processing \| succeeded \| failed` |
| `draft_id` / `publication_id` | Nullable operation target or result |
| `result_revision` | Nullable draft revision after a successful save |
| `error_code` | Nullable, stable, non-sensitive product error code |
| `backup_email_status` | `not_requested \| pending \| sent \| failed \| unknown \| skipped_rate_limit` |
| `email_attempts` / `email_sent_at` | Attempt count and confirmed send time |
| `deletion_stage` | Null except `delete_account`: `stepped_up` (proof issued, 10-minute window, single use) or `locked` (proof consumed; ordinary owner RPCs reject until cleanup finishes) |
| `created_at` / `updated_at` | Lifecycle timestamps |

- Operations never store envelopes, email addresses, attachments, SMTP
  response bodies, or other private content.
- Terminal save/delete operations are retained for 30 days. Publish/withdraw
  operations live with their publication/tombstone. Account deletion removes
  the owner's older operations but keeps the active `delete_account`
  operation until cleanup completes and the audit retention period ends.

### 4.5 `rate_limit_counters`

| Field | Contract |
|---|---|
| `policy_key` | `otp_email_minute \| otp_email_hour \| otp_ip_hour \| draft_save_5s \| publish_user_day \| backup_user_day \| account_delete_day` |
| `subject_hash` | Irreversible server-HMAC key over email, IP, user ID, or draft ID |
| `window_started_at` | Current window start |
| `count` | Consumed count in the current window |
| `updated_at` | Last update |

- Primary key is `(policy_key, subject_hash)`. Limits and window lengths are
  centralized server configuration and are not stored in counter rows.
- A Postgres function performs read, window reset, limit check, and
  increment in one transaction. No per-instance memory state, no Redis.
- Raw emails and IPs are never written to counters or application logs. The
  only trusted client IP source is the hosting platform's verified request
  data.
- Counters become eligible for cleanup 48 hours after their window ends.
  Cleanup never touches profiles, drafts, publications, or operations.

### 4.6 `resource_cleanup_jobs`

| Field | Contract |
|---|---|
| `id` | UUID primary key |
| `operation_id` | Nullable reference to the triggering operation; `ON DELETE SET NULL` |
| `owner_id` | Nullable; nulled when the auth user is removed |
| `resource_type` | `draft_thumbnail \| publication_thumbnail \| auth_user` |
| `resource_key` | Storage object path or auth user UUID; server-only readable |
| `status` | `pending \| processing \| succeeded \| failed` |
| `attempts` / `next_attempt_at` | Bounded exponential backoff |
| `error_code` | Nullable, stable, non-sensitive |
| `created_at` / `updated_at` / `completed_at` | Lifecycle timestamps |

- User deletion and withdrawal first make the work inaccessible and register
  cleanup jobs inside the database transaction. Storage and auth removal
  then proceeds asynchronously and idempotently; an already-missing object
  counts as success.
- Cleanup failure never restores access. Exhausted retries surface to the
  maintainer by non-sensitive job ID.
- Cleanup jobs never delete or rewrite publication tombstones or existing
  provenance chains.

### 4.7 Storage buckets

- `draft-thumbnails`: private. Thumbnails arrive base64-encoded inside the
  JSON save request, are validated by magic-byte sniffing (PNG, JPEG, or
  WebP) and a 500 KB byte cap, and are stored as received; client MIME
  types, extensions, and size claims are never trusted. Owner-only reads
  use signed URLs valid for 5 minutes. A private thumbnail never becomes
  public.
  - Decision (2026-08-02, owner-approved): pixel-level decode/re-encode is
    intentionally omitted for the private bucket. The blast radius is
    owner-only (an uploader can only affect their own thumbnails), and
    public thumbnails below never ingest client image bytes, so no
    client-controlled image content ever reaches other users. If draft
    thumbnails ever gain a cross-user display path, pixel re-encoding
    becomes mandatory at that boundary.
- `publication-thumbnails`: publicly readable, server-only writable. Public
  thumbnails are produced only by the controlled server render path from the
  immutable publication envelope; before generation and after failure the
  Community surfaces use the fixed placeholder. They are deleted on
  hide/withdraw and can be rebuilt from the artwork configuration. Paths are
  unguessable and versioned.

## 5. Same-Origin API v1

All cloud endpoints live under `/api/creation` and execute inside
FractalPark Route Handlers.

| Method | Path | Responsibility |
|---|---|---|
| POST | `/api/creation/auth/otp/request` | Rate-limit, challenge check, OTP request |
| POST | `/api/creation/auth/otp/verify` | Verify OTP and establish the HttpOnly session |
| POST | `/api/creation/auth/session/refresh` | Server-side refresh and cookie rotation |
| POST | `/api/creation/auth/logout` | Revoke the current auth session and clear the cookie |
| GET/PATCH | `/api/creation/profile` | Read/update own minimal profile |
| GET/POST | `/api/creation/drafts` | Owner draft list / create |
| GET/PATCH/DELETE | `/api/creation/drafts/[draftId]` | Owner read, optimistic-concurrency update, delete |
| POST | `/api/creation/drafts/[draftId]/publish` | Create an immutable publication from a stated revision |
| GET | `/api/creation/publications` | Owner publication list with lifecycle states |
| GET | `/api/creation/community` | Stable-cursor list of `published` works |
| GET | `/api/creation/publications/[publicationId]` | Published detail, download, and remix input |
| POST | `/api/creation/publications/[publicationId]/withdraw` | Permanent owner withdrawal |
| POST | `/api/creation/account/delete` | Start idempotent account deletion after step-up OTP |
| POST | `/api/creation/account/delete/request` | Send the fresh step-up OTP to the account email |
| POST | `/api/creation/account/delete/verify` | Verify the step-up OTP and issue the single-use proof |

### 5.1 General request contract

- Writes accept JSON only, reject cross-site `Origin`/`Host` mismatches,
  and have no GET side effects. Request bodies are capped at 2 MiB for
  draft save (a 1 MiB envelope plus a base64 thumbnail and metadata
  margin) and 16 KiB for every other write. Private draft thumbnails
  travel as base64 inside the JSON save request; there is no separate
  upload endpoint. The server decodes, validates, and re-encodes before
  storage.
  `SameSite=Lax` is a supplementary line, never the CSRF check itself.
- Post-login continuation accepts only server-issued operation tokens and an
  in-site allowlist; arbitrary `returnTo` URLs are rejected.
- Authentication and private responses are `private, no-store`. v0.4.15
  dynamic Community list and detail responses are also `no-store`, so hide
  and withdraw take effect on FractalPark's own pages immediately. The
  official Collection keeps its existing caching contract.
- Every route checks the cloud feature switch and returns `cloud_disabled`
  while off.

### 5.2 Status codes and error envelope

Success and accepted asynchronous work use `200/201/202/204`. Errors use
the fixed semantics `400/401/403/404/409/413/422/429/503`.

The stable error envelope is:

```ts
{ error: { code: string; message: string; retryAfter?: number; operationId?: string } }
```

Public messages are bilingual. Internal errors, third-party response bodies,
emails, IPs, tokens, and envelope contents are never sent to the client.

| Code | Status | Meaning |
|---|---|---|
| `cloud_disabled` | 403 | The cloud feature switch is off |
| `unauthenticated` | 401 | Missing, expired, or revoked session |
| `forbidden` | 403 | Authenticated but not the owner or not permitted |
| `not_found` | 404 | Unknown, hidden, or withdrawn for ordinary reads; uniform, leaks no moderation state |
| `validation_failed` | 400 | Malformed request shape or fields |
| `otp_invalid` | 400 | Wrong or expired code; the response never reveals whether the email is registered |
| `payload_too_large` | 413 | Body or envelope above the byte limit |
| `invalid_envelope` | 422 | `CloudArtworkEnvelopeV1` rejection |
| `formula_assets_not_publishable` | 422 | Envelope carries portable formula source *(v0.4.16: blanket rejection superseded by §17.2 strict acceptance; acceptance-failure codes are frozen in the implementation commit)* |
| `quota_exceeded` | 422 | Draft count or account storage quota reached; nothing is auto-deleted |
| `revision_conflict` | 409 | Expected revision mismatch |
| `idempotency_conflict` | 409 | Same key with a different request hash |
| `rate_limited` | 429 | Includes `retryAfter` |
| `unavailable` | 503 | Dependency failure; safe to retry later |

## 6. Idempotency

- `save_draft`, `publish_draft`, `delete_draft`, `withdraw_publication`, and
  `delete_account` all require an `Idempotency-Key` header carrying a
  client-generated UUID per logical write.
- `(owner_id, idempotency_key)` has a database unique constraint. A replay
  with the same key and the same request hash returns the original state and
  result without re-incrementing a revision, re-publishing, re-deleting,
  re-withdrawing, or re-sending email.
- The same key with a different request hash returns `idempotency_conflict`.
  One owner can never read, reuse, or probe another owner's operations.
- The artwork transaction commits first. Only then does the optional backup
  email phase begin; email failure never rolls back the artwork operation,
  and the API response reports `save/publish` and `backupEmail` outcomes
  separately.
- Email status semantics: `failed` means the SMTP server definitively did
  not accept the message and may be retried within quota; `unknown` means
  acceptance could not be reliably recorded and the revision is never
  re-sent, automatically or manually; a stale `pending` left by a lost
  worker is atomically converted to `unknown`, never re-sent; `sent` is
  never re-sent; `skipped_rate_limit` does not count toward the email quota
  and never rolls back the artwork operation.

## 7. Rate Limits and Quotas

Initial thresholds live in centralized server configuration. Reaching a
limit never deletes content; owners can still open, export, and delete, and
existing drafts may keep updating when doing so adds no new account storage.

| Policy | Limit |
|---|---|
| OTP per email | 1 per minute, 5 per hour |
| OTP per IP | 20 per hour |
| Draft save cooldown | 1 per draft per 5 seconds |
| Publish | 10 per account per 24 hours (successful publications only, consumed atomically with the publish transaction) |
| Backup email | 20 per account per 24 hours (counts actual SMTP attempts: `failed` and `unknown` count, `skipped_rate_limit` does not) |
| Envelope size | 1 MiB maximum input |
| Thumbnail | Longest edge 1920 px, compressed size 500 KB |
| Private drafts | 100 per account |
| Account cloud storage | 50 MB total |

- OTP counters are consumed by the same-origin Auth API before the identity
  provider is called; the provider's native rate limits and CAPTCHA-equivalent
  challenges remain a second boundary, and a CAPTCHA is never treated as
  complete bot protection.
- Clients cannot read or modify counters. Server responses carry only
  `allowed`, `retryAfter` where relevant, and generic errors.

## 8. `CloudArtworkEnvelopeV1`

Cloud writes use a dedicated server-side validation profile. It reuses the
Envelope/Document readers and the 1 MiB limit, but the lenient local
normalize path is not a security validation.

- Frozen budgets cover: the formula/coloring/transform runtime entity
  allowlist, finite numeric ranges, `maxIterations`, zoom and coordinate
  bounds, gradient stops, keyframes, animation tracks, plugin parameters,
  asset count, asset source size and hash, and total nesting size. The 1 MiB
  cap is only the first layer and never substitutes for semantic validation.
- An envelope that is future read-only, cannot be fully canonicalized,
  contains unknown runtime plugins, or exceeds render budgets may open
  locally read-only but must not be written to a cloud draft or published.
- The server re-serializes accepted input canonically and computes
  `config_bytes`, request hashes, and persisted values from its own
  serialization. Client-claimed byte counts, owners, states, paths, and
  provenance are never persisted.
- `formula` and `preset` sources must resolve against the current public
  registries. A `publication` source must be read by the server from the
  real published revision. Clients cannot forge, transfer, or rewrite
  provenance.
- Display names, titles, descriptions, and error content are treated as
  plain text. Tests cover HTML, control characters, bidi text, JSON-LD and
  script-termination sequences, overlong metadata, and URL injection. The
  CSP decision for user-generated content is recorded in ADR 0005 rather
  than assumed covered by existing headers.

## 9. SQL Invariants

Migrations must enforce these facts as database constraints, not only in
TypeScript or RPC branches:

- UUID/foreign-key `ON DELETE` behavior, non-negative byte counts, revision
  starting at 1, field lengths, enum values, and timestamp ordering.
- `remix_source_type`/`remix_source_id` are both null or both present, and
  immutable after creation.
- Publication `status` is consistent with
  `published_at`/`hidden_at`/`withdrawn_at`; published content fields reject
  updates; withdrawn rows have cleared content fields.
- `(owner_id, idempotency_key)` uniqueness with the request-hash conflict
  contract; identical concurrent requests converge to one business effect.
- Required indexes: drafts `(owner_id, updated_at desc, id desc)`;
  Community `(status, published_at desc, id desc)`; owner Published list;
  operation retention and lookup; rate-limit window; cleanup claim
  `(status, next_attempt_at)`.
- Migrations must replay from an empty database, upgrade forward from the
  previous schema, refuse unsafe re-execution, and leave older application
  versions fail-closed. Database tests cover these paths.

## 10. Read and Permission Matrix

| Capability | Anonymous / other users | Owner | Maintainer | Server-only |
|---|---|---|---|---|
| Read `published`, download, copy link, remix | Allow | Allow | Allow | Allow |
| Read withdrawn minimal attribution projection | Only to resolve existing public derivatives | Allow | Allow | Allow |
| Read/update profile and email preference | Deny | Self only | Deny | Account-deletion flow |
| Draft CRUD and export | Deny | Self only | Deny | Owner-bound session required |
| Read private draft thumbnail | Deny | 5-minute signed URL | Deny | Write/delete |
| Publish, withdraw | Deny | Own only | Deny | Transaction execution |
| View hidden/withdrawn | Deny | Safe metadata and status only | Deny | Allow |
| Read hidden envelope | Deny | Deny | Controlled restoration only | Allow |
| Hide/restore publication | Deny | Deny | Controlled data panel | Allow |
| Write/delete public thumbnails | Deny | Deny | Deny | Allow |
| Read operations | Deny | Own minimal result | Deny by default | Allow |
| Read/modify rate-limit counters | Deny | Deny | Deny | Allow |
| Read/advance cleanup jobs | Deny | Safe summary via own operations | Deny by default | Allow |

The controlled panel mechanism for hide/restore is the service-role-only
RPC `artwork_publication_set_moderation(publication_id, 'hide' | 'restore',
reason)` — idempotent per target state, terminal-state rejecting, and the
only writer of `hidden_at`/`moderation_reason`. Operator procedure lives in
`docs/runbooks/moderation.md`.

### 10.1 Enforcement layers

- The browser calls only FractalPark's same-origin Auth and artwork APIs.
  Base tables expose no direct DML to `anon` or `authenticated` roles. RLS,
  constraints, RPC checks, and Storage policies enforce the owner, public,
  and server-only boundaries; client-side filtering is never an authorization
  boundary.
- The API verifies the session and passes the user JWT through a
  request-scoped user client into narrow RPCs that check `auth.uid()`,
  ownership, revision, idempotency, field immutability, quotas, and rate
  limits.
- The service/admin client is separate, never reaches the browser, and runs
  only health checks, cleanup, the final account-deletion stage, and
  maintainer actions. Ordinary owner RPCs must fail under a service-role
  context, with tests proving it.
- RPCs use `security invoker` or per-function audited `security definer`
  with a pinned safe `search_path`, fixed function owner, and minimal
  `EXECUTE` grants.
- `published` content is returned only through projections and APIs that
  force `status = 'published'`. The owner's Published list returns safe
  metadata for hidden/withdrawn rows: no envelope, description, or
  moderation records.
- The maintainer is not an application role and is never written into
  profiles. Hide/restore happens only through the controlled data panel.
  Infrastructure administrators can ultimately reach database contents;
  v0.4.15 reduces exposure through least privilege, no routine private-draft
  access, operational discipline, and no sensitive payloads in logs, and
  does not claim cryptographic isolation from the database owner.

### 10.2 Transaction semantics

- Save: validate envelope/thumbnail, update the owner's draft, increment
  revision; the database commits before any preferred email is sent.
- Publish: validate attribution, title, and license; create the immutable
  publication; move the source draft from Drafts to Published.
- Continue editing / Remix: form a new local state first; it becomes a new
  cloud draft only after an explicit Save.
- Withdraw: one transaction marks the work withdrawn, clears the public
  envelope/description, keeps the minimal tombstone, and registers the
  public-thumbnail cleanup job; public reads and new remixes stop
  immediately; storage cleanup completes asynchronously.
- Hide: the database first blocks public reads and registers the thumbnail
  cleanup job; the work fact stays for maintainer restoration.
- Delete account: after step-up OTP and second confirmation, the database
  first locks the `delete_account` operation, rejects the owner's ordinary
  RPCs, and revokes all existing sessions; then a transaction deletes
  private facts, withdraws publications, and registers cleanup jobs. Storage
  cleanup must succeed before the auth user is physically removed. During
  cleanup the account can neither log in nor write, and the flow is
  idempotently retryable.

  The implemented mechanism: `artwork_operations.deletion_stage` carries
  `stepped_up` (proof, 10-minute window, single use) and `locked` (active
  deletion). `fractalpark_operation_gate` — the choke point every ordinary
  owner RPC already calls — raises `account_deleting` while a locked
  deletion exists. OTP requests for the account email are silently refused
  (generic response; the account state stays private). Session revocation
  removes every refresh token row from the auth schema
  (`fractalpark_revoke_user_sessions`; GoTrue has no admin per-user logout
  endpoint on v2.194, and its rotation-reuse grace would resurrect a
  merely-flagged chain); an unexpired sealed access cookie on another
  device is a bounded zombie — it cannot write (the gate rejects with
  `account_deleting`), it cannot refresh, and its reads return only what
  the confirm transaction left behind — nothing — until the short
  access-token TTL expires. The cleanup worker
  (`scripts/cleanup-worker.ts`) drains thumbnail jobs first, then calls
  `fractalpark_account_deletion_finalize` (close op + purge older
  operations, keep the audit row — the owner check must run while the id
  still matches) and immediately removes the auth user physically. The
  gate therefore stays closed until finalize; the physical removal
  follows within milliseconds in the normal path, and a worker that
  cannot finish keeps retrying instead of restoring access early.
  Session revocation writes the provider's auth schema directly, so a
  GoTrue upgrade must re-run the deletion drill
  (`scripts/e2e-account-deletion.ts`) as its regression.
- All writes go through the FractalPark API; RLS is the second enforcement
  boundary.

### 10.3 Withdrawn attribution projection

The tombstone projection returns only the frozen title, attribution
snapshot, license and scope, publish time, withdrawal time, and direct
source IDs. It never returns the envelope, description, owner ID, or
moderation records. The server resolves it only while rendering existing
public derivatives; there is no general public endpoint for enumerating
tombstones.

## 11. Local–Cloud Binding

> **Superseded by [ADR 0006](../adr/0006-cloud-authoritative-creation-persistence.md)
> in v0.4.16.** The binding below is the accurate record of v0.4.15. From
> v0.4.16 the cloud draft is the only persistence; see §17. This section is
> kept for historical reference and rollback reasoning.

The local recovery record is `StoredArtworkRecordV2`:

```ts
interface StoredArtworkRecordV2 {
  recordVersion: 2;
  cloud: {
    draftId: string;
    revision: number;
    syncedAt: number; // local epoch ms of the last successful sync
  } | null;
  // ...existing local artwork fields
}
```

The nested `cloud` binding is the implemented form of the earlier flat
sketch (`cloudDraftId`/`cloudRevision`/`cloudPublicationId`); semantics are
unchanged. A publication link is not stored on the local record: after a
successful Publish the source draft is gone and the binding is cleared, so
the record returns to the plain local state.

- Legacy and v1 records keep reading. New writes write v2 only. No
  background rewrite of older records.
- Within one browser, the local recovery copy and the cloud draft
  de-duplicate through the stable binding. First cloud save, repeat Save,
  save-as, conflict fork, Continue editing, and Remix are distinct tested
  paths; cloud deletion never deletes the local copy.
- After a successful Publish, the local record clears the whole `cloud`
  binding; that record now stands for the published snapshot lineage and
  never overwrites the publication again.
- Continue editing, saving from a Published work, and another user's Remix
  all fork a new local v2 ID whose cloud provenance travels through the
  new draft's `remix_source` (type `publication`); an explicit Save then
  assigns a new binding.
- The database never treats a browser-local artwork ID as an authorization
  fact; every cloud read/write re-checks the owner session.

## 12. Provenance and Licensing

- Published works license the rendered image layer under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The license does
  not cover formula source code, description text, UI, the logo, or
  trademarks. Withdrawal does not retroactively revoke grants.
- Private drafts and exports may carry portable formula assets. Community
  Publish rejects any envelope containing them.
  *(Superseded in v0.4.16 — see §17.2.)*
- The remix provenance namespace from ADR 0004 gains a stable `publication`
  source type. Frozen semantics — namespaced IDs, validation, immutability —
  follow ADR 0004; the concrete TypeScript name and URL code organization
  are decided by the implementing slice.
- The publish flow presents, before the first publish: the public visibility
  of the work and of the parameters a remix requires, the attribution and
  CC BY 4.0 image-layer scope, the rights warranty, and the withdrawal
  boundary. Attestation and license display versions are frozen onto the
  publication.
- A public revision exposes the document parameters a remix needs. Product
  copy must never describe those parameters as secret.
- There is no pre-publication review and no in-site report or appeal
  workflow. Public artwork pages carry a Report/Takedown mail entry to
  `contact@fractalpark.com`; the maintainer reviews periodically and hides
  or restores works through the controlled data panel.

## 13. Community Reads and SEO

- Community list uses the stable cursor `(published_at desc, id desc)`,
  default page size 24, server hard cap 50. No unbounded reads.
- The public artwork page lives at
  `/[locale]/gallery/community/[publicationId]` and shows title, attribution
  snapshot, publish time, image-layer license, the artwork, a state summary,
  Remix, copy-link, source, and the Report/Takedown entry. It never shows
  emails, private drafts, edit history, or account data.
- All v0.4.15 Community single-work pages are `noindex, follow`, stay out of
  sitemap and IndexNow, and remain crawlable so engines can read the
  directive. The official Gallery/Collection indexing contract is unchanged.
- Community pages emit `ImageObject` structured data following the community
  rule in [Artwork and Location Route Contract](artwork-and-location-routes.md).
- Hidden and withdrawn works return a uniform `404` to ordinary reads;
  owner-only safe status comes from the private API.

## 14. Backup Email

- Off by default. When enabled, the default mode sends on formal publish
  only; the user may opt into every manual cloud save plus publish.
- The attachment reuses the `.fractal.json` envelope under the 1 MiB limit
  without thumbnails. Save emails carry the artwork name, save time, and the
  configuration attachment; publish emails add the public link, publication
  revision ID, and the CC BY 4.0 image-layer note.
- Enabling requires explicit notice that the attachment carries complete
  parameters, view, and any custom formulas, and that FractalPark cannot
  retract it once delivered.
- Send happens after the artwork write succeeds and the function awaits the
  SMTP result before returning. Each save/publish revision uses a stable
  idempotency key so retries never duplicate a message.
- The OTP channel and the backup channel use separate credentials, separate
  rate limits, and separate disable switches.

## 15. Analytics

Analytics Schema v1 gains: `auth_otp_requested`, `auth_otp_verified`,
`cloud_draft_saved`, `cloud_draft_conflict`, `artwork_published`,
`community_artwork_viewed`, `community_remix_started`,
`publication_withdrawn`, `account_deletion_started`, and
`backup_email_result`. Trigger points, properties, and deduplication are
registered in [Analytics Event Schema v1](analytics-events-v1.md).

Analytics never carries emails, IPs, cookies, JWTs, envelopes, attachments,
or private draft titles. Operational correlation IDs are not analytics IDs.

## 16. Compatibility and Non-Goals

- With the switch off, anonymous browsing, Explore, local save,
  import/export, Gallery, and the official Collection are byte-for-byte the
  current behavior.
- Envelope v1, Document v1/v2, and future read-only documents keep their
  documented local behavior; the cloud profile adds rejection rules for
  cloud writes only.
- v0.4.15 does not include: standalone formula cloud storage or My
  Formulas, password or social sign-in, public user pages, follows,
  comments, messages, feeds, likes, rankings, recommendations, real-time
  multi-device sync, automatic conflict merging, continuous cloud autosave,
  unlisted sharing, in-site report/appeal workflows, an admin UI, a
  standalone Studio or `/my-works` page, or Community featuring and indexing
  promotion.

## 17. Cloud-Authoritative Persistence (v0.4.16)

Introduced by [ADR 0006](../adr/0006-cloud-authoritative-creation-persistence.md).
This section supersedes §11 for runtime behavior; §11 remains as history.
Where §2 and §8 describe local-first persistence that conflicts with this
section, this section governs current behavior (the older text remains the
record of v0.4.15).

- **Sole persistence.** `artwork_drafts` (Envelope + revision) is the only
  artwork fact. Runtime code must not read, write, or delete the legacy keys
  `fractalpark-artworks-v1`, `myfrac-saved-fractals`, or
  `myfrac-custom-formulas`; no compatibility reader, migration wizard, or
  double-write window ships. A static guard plus a Playwright storage probe
  (matrix A1–A3) enforce this.
- **Explore identity.** `?draft=<uuid>` is a lookup hint only; the owner API
  re-verifies the session per call and returns one uniform `not_found` for
  foreign or missing ids. `?artwork=<localId>` is removed from the runtime
  contract. Plain URL state still carries anonymous transient creation.
- **Five session states.** `loading` / `disabled` (switch off) /
  `unavailable` (transport or service failure) / `anonymous` /
  `authenticated`. UI must never render `unavailable` as `anonymous`.
- **First frame.** While session or a `?draft=` fetch is unresolved, SSR and
  the first client frame render one deterministic placeholder shell: no
  private data, never a default fractal impersonating content; transitions
  happen only after mount.
- **Save intent.** Anonymous Save freezes the envelope/title/thumbnail at
  click time, opens the contextual OTP, and resumes that exact intent after
  verification. Intents live only in React memory. Publish intent first
  ensures a saved cloud draft, then opens the existing publish dialog.
- **Idempotency.** Draft and formula create/update/delete reuse the v0.4.15
  operation gate: `Idempotency-Key` + request hash + stored replay; a lost
  create response never duplicates a record.
- **Conflicts.** Revision conflicts never auto-merge or overwrite; the UI
  offers explicit reload-remote and save-as-new exits.
- **Failure honesty.** Cloud failure, offline, quota, and session expiry
  never report a successful save; Download remains the user-controlled
  offline exit.
- **Sign out.** Keeps the in-memory canvas but strips the private draft
  identity; the next Save asks for OTP again.

### 17.1 Custom formulas (cloud)

`custom_formulas` is the My Formulas authority: UUID identity, owner, name,
source, canonical experience hint, revision, byte size, timestamps. Runtime
formula ids are `custom-<uuid>`. Contracts (all new in v0.4.16):

- 50 records per account; UTF-8 source ≤ 64 KiB — enforced server-side with
  stable error codes and negative tests (these are new limits, not inherited
  ones; drafts keep their own 1 MiB / 100-record budgets).
- Base table denies browser DML; same-origin owner API + narrow RPCs provide
  list (summary only) / detail / save / delete with revision, quota, rate
  limit, and idempotency; account deletion removes formulas in the staged
  flow.
- create/update validate name, source bytes, experience hint, built-in ID
  conflict, and `compileFrm` server-side before writing canonical facts.
- Artwork envelopes snapshot the referenced formula source/hash; opening a
  draft compiles the embedded asset and never follows later library edits or
  deletion. `.fractal.json` import registers assets in memory only; `.frm`
  import stays an editor memory draft; only an explicit Save Formula writes
  the library.

### 17.2 Custom-formula publication

The blanket `formula_assets_not_publishable` rejection is replaced by strict
acceptance: exactly one referenced asset, hash match, ≤ 64 KiB, server-side
compile success. The immutable publication snapshot freezes source/hash,
license `MIT`, scope `formula_source`, and the source-attestation version —
separate from the image layer's CC BY 4.0. The publish dialog requires an
explicit author confirmation that the source becomes public and licensed
under MIT; the server refuses without it. Withdrawal/deletion stops new
reads, downloads, and remixes but does not retroactively revoke granted
licenses; existing derivatives keep minimal provenance. Built-in-only
publications keep null/not-applicable formula license fields (no backfill).
