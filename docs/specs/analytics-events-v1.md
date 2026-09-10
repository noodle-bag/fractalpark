# Analytics Event Schema v1

- Status: Accepted
- Date: 2026-07-26
- Target release: FractalPark v0.4.13
- Extended in: FractalPark v0.4.15 and v0.4.20
- Scope: FractalPark first-party product analytics

## Purpose

This schema registers existing events and freezes the v0.4.13 Formula Atlas,
FRM, artwork, and Remix events, plus the v0.4.15 web-creation-loop events.
It preserves the page-view correction introduced before v0.4.13: query-only
Explore state changes are not page views.

This document defines event meaning, properties, trigger timing, lifecycle,
and deduplication. Analytics never owns product state or provenance.

## Conventions

- Event and property names use lowercase `snake_case`.
- Existing event names are not renamed in v0.4.13.
- New IDs use authoritative formula or preset IDs, not localized labels or
  public slugs.
- `locale` is one of the application's supported locale codes.
- Boolean, numeric, and enum properties are sent as their native types.
- Optional properties are omitted rather than sent as empty strings.
- FRM source, imported file contents, rendered image data, full Explore query
  strings, local formula IDs, local artwork IDs, and arbitrary user text must
  not be added to new events.
- Event helpers must be no-ops when analytics is unavailable and cannot block
  navigation, rendering, saving, copying, or export.
- Google Analytics loads and events are sent only after explicit consent.
  Declining analytics does not affect product behavior. Consent can be changed
  from the persistent Analytics settings control.
- Analytics uses GA's pseudonymous browser/device identity only. FractalPark
  never sets GA `user_id` and never joins analytics to a cloud account.

## Page Views

`page_view` is sent by `PageViewTracker` only when the pathname changes.

| Property | Type | Meaning |
|---|---|---|
| `page_path` | string | Locale-qualified pathname without query or hash |
| `page_location` | string | Origin plus `page_path`, without query or hash |

The tracker stores the last pathname and sends once per actual client route
transition. Explore query updates, `?view=mine`, Editor `?example=`, and Remix
parameter removal do not create additional page views. Google Analytics
automatic page views remain disabled.

## v0.4.13 Content and Creation Events

### `view_formula`

Sent once after hydration of a canonical formula guide page.

| Property | Type | Required |
|---|---|---|
| `formula_id` | catalog formula ID | yes |
| `locale` | `en` or `zh` | yes |

The event is not sent for Atlas directory entries that link directly to
Explore.

### `view_frm_guide`

Sent once after hydration of the canonical FRM Guide page.

| Property | Type | Required |
|---|---|---|
| `locale` | `en` or `zh` | yes |

### `view_artwork`

Sent once after hydration of a canonical published artwork page.

| Property | Type | Required |
|---|---|---|
| `preset_id` | published preset ID | exactly one source ID |
| `publication_id` | public community publication ID | exactly one source ID |
| `locale` | `en` or `zh` | yes |

Redirect routes do not emit the event. The canonical destination emits it
once.

### `start_remix`

Sent from the user's Remix activation before navigation.

| Property | Type | Required |
|---|---|---|
| `source_type` | `formula` or `preset` | yes |
| `source_id` | catalog formula ID or published preset ID | yes |

`source_type` must agree with the authoritative source that resolves
`source_id`. This click event does not replace
[Remix provenance metadata](../adr/0004-remix-source-metadata.md). Community
artwork Remix activations do not emit this event; they emit
`community_remix_started` (v0.4.15).

### `open_formula_editor`

Sent when a contextual entry opens the standalone Formula Editor.

| Property | Type | Required |
|---|---|---|
| `source_page` | `atlas`, `frm_guide`, `formula`, or `explore` | yes |
| `example_id` | shared example registry ID | no |
| `locale` | `en` or `zh` | yes |

`example_id` is present only when the destination uses an allowlisted
`?example=` value.

### `copy_page_link`

Sent after the artwork page URL has been successfully copied.

| Property | Type | Required |
|---|---|---|
| `preset_id` | published preset ID | yes |

A failed clipboard action does not emit the success event.

### `open_example`

Sent when a formula page or Atlas surface opens a configured published
artwork example.

| Property | Type | Required |
|---|---|---|
| `formula_id` | owning catalog formula ID | yes |
| `preset_id` | published preset ID | yes |

FRM tutorial selection is represented by `open_formula_editor` with
`example_id`, not by this event.

## v0.4.15 Web Creation Loop Events

These events fire only while the cloud feature is enabled for the
environment. They never carry emails, IPs, cookies, tokens, envelopes,
attachments, draft titles, or cloud record IDs. `community_artwork_viewed`
and `community_remix_started` use the public `publication_id`, which plays
the same role as the published `preset_id`.

| Event | Trigger | Properties |
|---|---|---|
| `auth_otp_requested` | Same-origin OTP request accepted for sending | `locale` |
| `auth_otp_verified` | OTP verified and session established | `locale` |
| `cloud_draft_saved` | Cloud draft save succeeded | `is_first_save` |
| `cloud_draft_conflict` | Save rejected by `revision_conflict` | — |
| `artwork_published` | Publication created | — |
| `community_artwork_viewed` | Community artwork page hydrated | `publication_id`, `locale` |
| `community_remix_started` | Remix activated on a community artwork | `publication_id` |
| `publication_withdrawn` | Owner withdrawal completed | — |
| `account_deletion_started` | Step-up confirmed and deletion operation created | — |
| `backup_email_result` | An operation reaches its final backup-email state | `status`: `sent`, `failed`, `unknown`, or `skipped_rate_limit` |

`backup_email_result` fires once per operation at its final state: a
`failed` attempt retried into `sent` within the same operation emits only
the closing `sent`.

A community Remix activation emits `community_remix_started` only; it never
emits `start_remix`, which remains scoped to `formula` and `preset`
sources.

Content-view deduplication follows the same Strict Mode guard as the v0.4.13
content events. Operation events fire once per completed server operation;
retries and idempotent replays do not re-emit.

## v0.4.20 Weekly Active Creator Events

A weekly active creator (WAC) is a unique consenting external browser/device
that completes this
ordered sequence within one Asia/Shanghai natural week:

```text
successful Explore render -> user-originated meaningful change
  -> successful render caused by that change
```

Saving, exporting, sharing, publishing, or Remix is not required for WAC.
Those actions remain independent downstream value signals.

| Event | Trigger | Properties |
|---|---|---|
| `creator_change` | A supported user control makes a meaningful Explore change | `surface: 'explore'`, `change_id`, `change_type`, traffic properties |
| `creator_render_complete` | A frame is successfully drawn to the visible Explore canvas | `surface: 'explore'`, `render_phase`; post-change renders also include `change_id` and `change_type`; traffic properties |
| `creator_loop_complete` | The first post-baseline render attributable to the latest user change succeeds | `surface: 'explore'`, `change_id`, `change_type`, traffic properties |
| `remix_complete` | A Remix produces an editable cloud draft or a frame drawn in Explore | `source_type`, `source_id`, `completion_surface`, traffic properties |

`change_type` is one of `formula`, `formula_parameter`, `viewport`,
`coloring`, `julia`, `transform`, `keyframe`, `render_quality`, or `reset`.
`change_id` is an in-memory page-session sequence number, not a user or
document identifier.

Initial state construction, hydration, URL or document restore, migration,
canvas resize, preview playback, and failed, cancelled, or superseded renders
do not close the creator loop. A change made before the first successful
render cannot establish WAC; a later user change and successful render are
required. `creator_loop_complete` emits at most once per Shanghai week per
Explore mount. A tab left open across a week boundary must establish a new
baseline before it can complete the new week's loop. GA4 `totalUsers`
performs pseudonymous browser/device deduplication across tabs and sessions.
It does not represent an authenticated person and may count one person more
than once across browsers, devices, or cleared cookies.

`first_render_complete` now shares the authoritative render boundary: it is
sent after the first worker frame is drawn to the visible canvas, not when the
canvas element mounts.

`remix_complete` is distinct from `start_remix` and
`community_remix_started`. `source_type` is `formula`, `preset`, or
`publication`; `completion_surface` is `explore_render` or `cloud_draft`.
Formula and preset IDs and public publication IDs are allowed, but envelopes,
draft IDs, titles, source code, and document state are not.

### Traffic classification

Every v0.4.20 event includes:

| Property | Values | Meaning |
|---|---|---|
| `traffic_class` | `external`, `internal`, `automation`, `development` | Explicit reporting class |
| `traffic_type` | `external`, `internal` | GA4-compatible internal-traffic marker |

Non-production hostnames are `development`; WebDriver sessions are
`automation`. A maintainer can mark the current production browser profile as
internal with:

```js
localStorage.setItem('fractalpark.analytics.traffic-class', 'internal')
```

The GA4 property must define an event-scoped custom dimension named
`traffic_class` whose event parameter is also `traffic_class`. The WAC report
filters that dimension to `external`; the GA4 internal-data filter remains a
second guard. Do not activate a permanent exclusion filter before testing it
in GA4's testing state.

The production GA bootstrap sets both traffic properties globally, and the
shared event helper also attaches them explicitly to every custom event. This
keeps save, export, project download, copy-link, publish, Remix, and WAC events
on the same exclusion contract.

### Weekly report

The GA4 property time zone must be `Asia/Shanghai`. With a short-lived access
token that can read both the Analytics Admin and Data APIs, run:

```bash
GA4_PROPERTY_ID=123456789 GA4_ACCESS_TOKEN=... \
  node --import tsx scripts/query-ga4-wac.ts
```

The command defaults to the previous complete Monday-through-Sunday week. An
explicit full week can be supplied with `-- --start=2026-08-31
--end=2026-09-06`. It rejects partial weeks and a property with a different
time zone, then queries `totalUsers` by `isoYearIsoWeek` for
`creator_loop_complete`, production hostnames, and external traffic only.

Before accepting the first weekly result, verify in GA4 DebugView or Realtime
that initial render emits no loop completion, a supported change followed by
a successful render emits one completion, and resize, restore, failure, and
automation cases remain excluded.

## Deduplication

Content view events use a module or component guard keyed by canonical route
identity so React Strict Mode effect replays do not duplicate them. A normal
full reload or a later navigation back to the page is a new view.

Click events are not time-deduplicated. Each deliberate activation sends one
event. A handler attached to nested elements must not emit twice through both
card and link handlers.

## Existing Event Registry

The following events already exist at schema acceptance. Their send code is
unchanged unless a lifecycle note explicitly removes the associated UI.

| Event | Current trigger | Properties | Lifecycle |
|---|---|---|---|
| `first_render_complete` | First worker frame successfully drawn to the visible Explore canvas | `page: 'explore'`, traffic properties | active; lifecycle corrected in v0.4.20 |
| `change_formula` | Select a built-in formula in Explore | `formula` | active |
| `julia_mode_toggle` | Toggle formula mode | `mode`: `julia` or `mandelbrot` | active |
| `add_keyframe` | Increase view-keyframe count | `count` | active |
| `save_fractal` | Successful cloud draft save | `document_version`, `formula_kind`, optional built-in `formula` | active |
| `export_fractal` | Successful PNG export | `scale`, `ssaa`, `document_version`, `formula_kind`, optional built-in `formula` | active |
| `project_download` | Successful project download | `file_size_bucket`, `document_version`, `formula_kind`, optional built-in `formula` | active |
| `project_import` | Successful project import | `custom_formula_count`, `file_size_bucket`, `document_version`, `formula_kind`, optional built-in `formula` | active |
| `project_import_failed` | Rejected or failed project import | `error_code`, `file_size_bucket`, `document_version`, `formula_kind`, optional built-in `formula` | active |
| `custom_formula_save` | Successful custom-formula save | `formula_kind: 'custom'` | active; arbitrary names and source text are forbidden |
| `error_webgl_unsupported` | WebGL capability failure | `page` | active |
| `open_from_gallery` | Current Gallery card activation | `is_builtin` | replace for published cards when they navigate to artwork pages |
| `star_fractal` | Current Gallery star toggle | `source: 'gallery'` | deprecated; stop sending when Gallery star UI is removed |
| `fullscreen_toggle` | Current Gallery fullscreen open | `page: 'gallery'`, `action: 'open'` | deprecated for Gallery; stop sending when Gallery fullscreen is removed |

`file_size_bucket` uses:

```text
under-64-kib
64-to-256-kib
256-kib-to-1-mib
over-1-mib
```

`formula_kind` is `builtin` or `custom`. `document_version` is numeric.
The legacy `formula` property is sent only for allowlisted built-in formulas.
It is omitted for custom/private formulas. New content events use the more
explicit `formula_id`.

## Event Ownership and Implementation

- `PageViewTracker` owns `page_view` only.
- A reusable content-view client helper may own Strict Mode-safe
  `view_formula`, `view_frm_guide`, and `view_artwork`.
- The visible control that initiates an action owns its click event.
- Remix link construction owns source validation, while its click control
  owns `start_remix`.
- Save, import, download, and export events remain next to their successful
  operation results.
- Server components provide validated IDs as props; analytics clients do not
  reparse URLs or manifests to discover identity.

## Funnel Definitions

The primary release funnel is:

```text
view_formula | view_frm_guide | view_artwork
  -> open_formula_editor | open_example | start_remix
  -> Explore modification
  -> save_fractal
  -> export_fractal | project_download
```

`start_remix` may be segmented by `source_type`. Formula-page conversion is
joined by `formula_id`/`source_id`; artwork conversion is joined by
`preset_id`/`source_id`. Analytics reports do not write back into application
state.

The v0.4.15 creation-loop funnel is:

```text
auth_otp_requested -> auth_otp_verified -> cloud_draft_saved
  -> artwork_published -> community_artwork_viewed -> community_remix_started
```

## Verification

Automated or browser tests must prove:

- query-only URL changes do not send `page_view`;
- each content view sends once under Strict Mode;
- canonical redirect destinations send one artwork view;
- every Remix control sends one event with a valid source pair;
- optional example IDs are allowlisted and omitted otherwise;
- successful and failed Copy link paths have the documented behavior;
- removed Gallery star and fullscreen UI no longer sends deprecated events;
- analytics unavailability does not change the user-visible action result;
- no Google Analytics request or cookie is created before consent, declining
  keeps all product behavior available, and withdrawing consent removes GA
  cookies and stops later events;
- no new payload contains source code, a render-state query, or local
  identifiers;
- no v0.4.15 payload contains an email, IP, cookie, token, envelope,
  attachment, private draft title, or cloud record ID other than the public
  `publication_id`;
- cloud events are inert while the feature switch is off.
- no-op control callbacks do not create pending creator attribution, while a
  non-no-op Reset does;
- the first successful render establishes a baseline without completing WAC;
- only a later supported user change followed by its successful render emits
  one `creator_loop_complete` per Shanghai week per Explore mount;
- resize, restore, failed, cancelled, superseded, internal, automation, and
  development traffic do not enter the external WAC result;
- the WAC query accepts exactly one complete Asia/Shanghai natural week.
