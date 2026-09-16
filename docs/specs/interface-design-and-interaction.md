# Interface Design and Interaction

- Status: Accepted design contract; runtime adoption is incremental
- Date: 2026-09-14
- Introduced in: FractalPark v0.4.21
- Scope: Shared visual rules and Explore workspace interaction

## Purpose and authority

FractalPark is a compact, canvas-first creative tool. Controls support the
artwork rather than competing with it. Shared styles must remain recognizable
across Explore, Gallery, Formula pages, About, and Drift without forcing reading
or image surfaces into the same density as an Inspector.

This document specifies target behavior, not a claim that the current product
already implements it. Design approval does not authorize runtime changes or
delivery actions. Adopt the contract through separately scoped changes.

Figma expresses visual intent and representative states. The public contract
and existing code own executable behavior. Private design locators and review
history stay outside this repository; use the semantic mapping below to connect
the reviewed frames/styles to code. Frame coordinates, sample formula values,
palette images, and animation timings are fixtures, not product defaults.

The following contracts remain authoritative:

- [Fractal Content and Creation Model](fractal-content-and-creation-model.md):
  consumer matrix, canonical state, and saved-artwork preservation.
- [Fractal Document v2 and Envelope v1](fractal-document-v2.md): persistence.
- [Formula Parameters and Mode Semantics](formula-parameters-and-mode-semantics-v1.md):
  parameter ownership, Julia qualification, precise input, and typed bindings.
- [Formula Runtime Identity](formula-runtime-identity-v1.md): qualified identity
  and execution, independent of shader caching or display names.
- [Web Creation Loop](web-creation-loop-v1.md) and
  [Unified Formula Library](unified-formula-library-v1.md): permissions, public
  snapshots, source visibility, and publication boundaries.
- [Development Validation](../testing/development-validation.md): applicable
  checks, specialist scope, and evidence reuse.

Report conflicting design, code, or specification sources before changing a
governed boundary. A simplified mockup cannot delete an existing runtime state.

## Visual roles and token mapping

Values below are design targets in CSS pixels. Resolve them through existing foundations/primitives when adopting
the design; register any new scoped token in that implementation change. Do
not mechanically replace every `text-*`, `rounded-*`, or spacing utility.

| Design role | Target | Code foundation / usage |
|---|---|---|
| Tool control text | 13px, regular or medium | Button, Tabs, Label, Input, Select; retain readable input exceptions |
| Supporting text | 12px | Help, metadata, state explanations; never reduce required disclosure to illegibility |
| Reading text | 14–16px | About, Guide, Record prose; preserve reading width and line spacing |
| Group / page heading | 18px / 24–28px | Separate control groups from page-level hierarchy |
| Numeric and source text | Monospace | Existing `--font-mono` / `--font-geist-mono` roles; source exceptions below |
| Ordinary text | Sans serif | Existing `--font-sans` / `--font-geist-sans` roles with explicit system CJK fallback |
| Space rhythm | 4, 8, 12, 16, 24px | Existing spacing utilities; related controls closer than separate groups |
| Ordinary control radius | 6px | Scoped primitive styles; do not blindly change the global `--radius` cascade |
| Surface and state colors | Existing semantic color roles | `background`, `foreground`, `muted`, `border`, `primary`, `destructive`, `ring` |
| Mobile discrete action target | About 44×44px | Hit area independent of compact icon/text geometry |

Use regular/medium weight for most controls and align numeric values. Preserve
the approved Formula-group density rather than reducing it again solely to
match a global type target. Allow inputs to remain larger where readability,
mobile keyboard behavior, or browser zoom requires it. The type-role table does
not require an exact fixed line height: complete text must determine row height.

Load any chosen Latin font explicitly and provide Chinese/Korean fallback.
The existing CSS font-variable references alone do not prove font loading;
locale layout integration and actual browser metrics must be verified during
implementation. Figma CJK fonts do not imply a new downloadable font dependency.

Use alignment, space, and modest separators instead of nested rounded cards.
Save is the only filled primary action in the Explore artwork bar. Selected,
hover, focused, disabled, loading, and error states remain distinct; selection
must not rely on color alone. Preserve visible keyboard focus and existing
reduced-motion behavior. Color-role reuse does not add a Theme Toggle.

## Explore workspace

### Desktop Inspector

The Inspector is a 532px-wide right-side workspace panel, open by default,
non-modal, and without a dimming backdrop. While it is open, the retained canvas
stage fills the visible workspace to the Inspector's left. Closing the Inspector
expands that same stage across the full workspace. The exposed canvas remains
interactive; an outside click does not implicitly close the Inspector.

A flush, full-height 12px visual toggle strip sits at the Inspector's inner edge
when open and at the window's right edge when closed. It is not a protruding
floating button. Provide an accessible name, expanded state, keyboard operation,
and a usable hit area without changing the flush visual strip. This strip is a
specific visual exception to ordinary mobile button sizing.

Opening/closing the Inspector must preserve:

- the canvas DOM node, renderer instance, and DPR; its rectangle and drawing
  size follow the declared open/closed workspace geometry;
- fractal bounds, center, zoom, and rotation; the bounds center remains the
  actual canvas center in each state;
- selected Tab, input drafts, relevant scrolling/focus, parameters, keyframes,
  animation state, and save/export state.

Resize through the existing canvas/renderer resize contract. Do not compensate
the geometry change with pan or changed bounds: the same artwork coordinates
stay centered in the current canvas rectangle. Reopening must restore the open
rectangle without recreating the canvas or losing editing state.

Reference viewports are 1440×900 and 1180×900 with 48px navigation. Canvas
rectangles while open are respectively `(0,48,908,852)` and
`(0,48,648,852)`; while closed they are `(0,48,1440,852)` and
`(0,48,1180,852)`. These are comparison fixtures, not universal viewport
constants.

Inspector padding is 16px horizontally and 12px vertically, with 8px between
fixed regions. Formula groups use the approved 8px rhythm. Tab contents scroll
independently; the artwork bar stays fixed. Closing hides the bar with the
Inspector but leaves the reopen control and canvas project-file dropzone usable.

### Portrait and short landscape

Portrait retains Peek / Half / Full, defaulting to Peek. Sheet position is
UI-only state and must not enter the Document or URL. Peek provides summary and
artwork actions, Half supports frequent adjustment with scrolling, and Full
supports long content and precise editing.

At 390×844, representative panel heights are 160 / 488 / 748px, with Half/Full
content areas of approximately 312 / 572px. Derive actual dimensions from the
visual viewport, safe-area insets, keyboard, and fixed regions; do not hardcode
the frame measurements. Use 16px horizontal padding and 4px fixed-region gaps.

For short landscape, use a right-side narrow Inspector rather than a tall
portrait sheet consuming the short screen. The 844×390 reference has a 320px
panel, approximately 288×166px content area, and an 844×342px canvas under the
navigation. Responsive thresholds depend on available width/height, not locale
or a screenshot coordinate. Preserve portrait behavior and its full-canvas
overlay contract; validate narrow/short intermediate viewports too.

Panel dragging starts only on its Handle/Header. Content scrolling, Picker and
slider gestures, and canvas interaction retain their respective owners. With
the soft keyboard open, keep the focused input visible, use sufficient expanded
space, and lock panel dragging; short viewports may bypass an unusable middle
position. Preserve drafts when the keyboard closes.

Back first exits a child flow, then reduces Full → Half → Peek, then follows the
page's existing return behavior. Modal focus isolation remains intact, with at
most one blocking modal. A non-blocking adjustment state must not install a
full-canvas blocking backdrop. Restore a predictable focus target after closing
or leaving a child flow.

### Tabs, labels, and artwork actions

Keep Formula / Coloring / Transform / Render / Animation and their existing
semantics. Tab width follows the complete label plus padding. At ordinary text
size, the desktop Inspector fits all five complete labels on one row without
horizontal scrolling in every supported locale. Prefer sufficient panel width
over smaller text or cropped labels. Portrait, short landscape, and enlarged
text retain horizontal scrolling when needed instead of forced word-breaking,
ellipsis, or equal tiny columns.
Keep the selected Tab visible on selection and preserve Radix keyboard/focus
semantics. Long form labels wrap naturally and grow the row, without clipping
related controls or reducing action hit areas.

Move artwork toolbar presentation to the fixed Inspector bottom bar; do not
move or duplicate its canvas dropzone, Document ownership, dialogs, or capture
state. Use icons above short text, separate Reset, and place action feedback
near the bar outside scrolling Tab contents.

| Action | Existing meaning / handler |
|---|---|
| Save | Save the artwork through the existing named cloud-draft flow / `onSave` |
| Download | Download a project file / `onDownload` |
| Import | Import a project file / `onImport` |
| Export | Export PNG using the existing scale/quality dialog / `onExport` |
| Reset | Existing confirmed artwork reset / `onReset`; not deletion of the custom formula library or Gallery |

The approximately 60px one-row bar is a reference, not a fixed height cap. At
320px, long-language labels can require a complete 3+2 two-row layout; increase
bar height and reduce available panel content accordingly. At 390px the reviewed
labels fit one row, but actual fonts/text determine fit. Do not shrink text/hit
areas, crop labels, or shift the canvas center to preserve a screenshot height.
Responsive wrapping is based on measured available space, not a language allowlist.
Keep every action reachable in each portrait position.

Save/Export require the actual frame-ready qualification; project-file
Download/Import are not PNG capture and do not acquire that gate merely by being
adjacent. Operation pending and conflict-exit busy flags retain their existing
per-action behavior. Empty save names cannot submit. Reset opens its existing
destructive confirmation with Cancel initially focused. Closing the Export
dialog is not a promise that a GPU task was cancelled.

## Precise parameter interaction and feedback

Reuse `ComplexPlanePicker` for qualified Julia and parameter editing while
keeping their owners and labels separate. A `pixel` coordinate parameter is not
automatically Julia. Follow the parameter semantics Spec for eligibility,
window/domain, precision, and preservation of unedited components.

The mobile plane uses full content width: reference sizes are 358×220px at 390px
and 288×200px at 320px. Normalize horizontal and vertical axes independently;
changing the rectangle must not change the complex exploration window or
parameter precision. Place precise Re/Im inputs side by side below the plane
with 44px target height, then Reset on its own 44px row, with 8px gaps. Half can
scroll to the inputs; Full supports complete precise adjustment.

Required interaction behavior:

- Click locates within the current window; drag keeps marker and numeric
  feedback aligned with the latest valid parameter.
- Normal release retains the last valid position. Leaving the plane follows
  its declared boundary clamping, and returning can continue the gesture.
- Cancellation/lost capture retains the last valid value and clears gesture
  state; untrusted cancellation coordinates cannot become a new value.
- Another pointer cannot steal the active gesture. New interaction works after
  interruption; precise input and keyboard paths remain available.
- Renderer scheduling may coalesce intermediate requests, but the latest
  completed frame must match the latest valid parameters, never an older task.
- A delayed startup error from a superseded Worker must not fail its replacement.
  Errors from the current Worker still fail the request and retain the existing retry boundary.

These are acceptance requirements, not evidence that the reported interruption
or canvas-status stutter is fixed. Diagnose pointer events, capture, lifecycle,
Document updates, main-thread work, and Worker completion before changing them.
Identify whether feedback is rendering-pending, a selection toast, or draft
status instead of treating every top-left hint as the same component. Do not
hide real failures, announce frame-ready early, relax capture gates, or restore
retired high-frequency analytics events to make feedback appear smoother.

## Existing state and presentation contracts

This is a representative preservation matrix, not a new set of business enums.
Actual source, permission, quota, session, and error branches remain in code.

| Surface | Conditions that styling/reorganization must preserve |
|---|---|
| Coloring | Existing plugin/palette choices, smooth qualification and explanation, trap shape/dimensions, preset/custom gradient and stop eligibility |
| Transform | `none` hides parameters; center Picker requires the matching descriptors; read-only coordinates remain read-only; unsupported vector editing is not invented |
| Render | SSAA/adaptive/lighting switches; disabled lighting hides settings; retain the existing lighting-mode Select, Normal Map azimuth/elevation/intensity and DEM intensity; iterations keep 50–1000, step 50 |
| Animation | Zero-frame empty state, fewer than two frames cannot preview, five-frame add limit, Stop, frame select/delete, automatic stop below two frames |
| Artwork dialogs | Name validation, pending/error/success, save cloud phase, conflict exits and their own busy/frame-ready predicates, export focus/quality controls |
| Canonical source | Loading/error/Retry/ready, qualified read-only source, existing Remix/download eligibility and disclosure |
| Community | Initial loading/empty/error, retained cards after refresh error, cursor/paging and Load more; copy success and Remix busy/error remain independent |
| My Works / previews | Signed-out/provider unavailable/loading/empty/error, Refresh and retained cards; neutral gradient fallback, qualified live hover; no invented preview Retry |
| Directory | Existing query/filter/count and zero-result behavior; counts come from data, without a fabricated CTA or cloud state |
| Drift | Playing/paused/not-ready/unavailable; existing poster/black fallback and advance policy, without a new unavailable banner |

Live preview hover requires the existing mouse/pen and keyframe qualification;
touch is not assumed to have hover. Styling cannot change canonical Gallery
card navigation to Artwork Detail, replace a saved formula with current defaults,
rewrite denied Julia intent, or weaken immutable public snapshot isolation.

## Semantic design-to-code mapping

Each row is the public semantic locator for the corresponding design
frame/style/state board. Private node IDs can be associated with these roles
in the maintained design mapping without exposing private resource identifiers.
The listed paths are existing ownership boundaries, not generated replacements.

| Design role | Existing code owner | Token / integration boundary |
|---|---|---|
| Text / space / radius foundations | `src/app/globals.css`, `src/app/[locale]/layout.tsx` | Font and semantic theme roles; explicit font loading and scoped density |
| Action / selection / input variants | `src/components/ui/{button,tabs,label,input,select,slider,switch}.tsx` | Existing variants, Radix semantics, focus and hit areas |
| Desktop open/closed and portrait positions | `src/app/[locale]/explore/ExploreClient.tsx`, `src/components/fractal/ExploreInspector.tsx` | Retained canvas with state-driven desktop geometry, Inspector UI state, Tab scrolling, viewport/keyboard |
| Formula and coordinate editing | `src/components/fractal/{ComplexPlanePicker,ParameterExplorationControl,TransformPointPicker}.tsx` | Qualified ownership, separate axes, precise values; presentation versus gesture diagnosis |
| Coloring / Transform / Render state boards | `src/components/fractal/{ColoringPanel,TransformPanel,RenderPanel}.tsx` | Existing plugin descriptors, conditional settings and ranges |
| Keyframe state board | `src/components/fractal/KeyframeManager.tsx` | Existing limits, selection, preview/Stop conditions |
| Artwork bar / dialogs / canvas import | `src/components/fractal/ArtworkActions.tsx`, `src/hooks/useArtworkActions.ts` | Present toolbar separately from dropzone; one action/modal/capture owner |
| Explore short source / Record full source | `src/components/formulas/{ExploreCanonicalSourceWorkspace,CanonicalSourceWorkspace,CanonicalSourceEditor}.tsx` | Read-only preview versus full source editor, qualification and rights |
| Playback / navigation / shared pages | `src/components/fractal/playback-controls.ts`, existing Drift, Navbar, Gallery, Formula and About instances | Retained transparency, routes and business states; scoped propagation |

### Retained density and radius exceptions

- Explore FRM: dark seven-line preview, 11px monospace / 20px line height,
  12px padding, maximum height 160px. No source area in Peek. Full source uses
  the existing Sheet/read-only CodeMirror boundary, not an embedded Record editor.
- Record FRM: retain full source space, 24px desktop / 20px mobile surround,
  13px monospace, line numbers and scrolling. Keep existing 16px container / 12px
  editor radii and the `18rem` minimum-height contract; a 420px frame fixture
  does not replace it.
- Drift: retain its black/25 translucent blurred bar, 16px desktop / 12px mobile
  surround and 12px gap; white/10 circular 40px buttons and 16px white icons.
  Order remains Pause/Play, Previous, Next, with existing eligibility/disabled
  rules. Do not force this image overlay into opaque Inspector styling.
- Gallery: retain 8:5 artwork images and 14px external titles. Directory favors
  scan density; About/Guide/Record prose retains suitable reading width/spacing.

Global primitive changes must check their propagation immediately, not defer
it until page adaptation: Explore desktop/mobile; Gallery preset, Community and
My Works; Formula Directory/Record; Navbar, Drift and About; affected dialogs,
sign-in, privacy and Guide content where shared primitives reach them. Existing
variants should be reused before adding one; new tokens require named consumers
and an explicit exception/rollback map. A blocking regression cannot be left
for a later propagation change.

### Shared foundation implementation

The shared foundations register `--text-control` (13px / 20px) and
`--radius-control` (6px), consumed by Button, Tabs, Label, Input and Select.
The existing 4/8/12/16/24px spacing utilities remain the space scale. The class
merger recognizes these named tokens so instance text/radius exceptions still
override them. The global surface-radius cascade is unchanged.

`--control-height` supplies 44px below the existing 48rem breakpoint and 36px
above it; `--control-height-large` supplies 44px / 40px. Height utilities consume
these variables without competing responsive selectors, so explicit instance
heights remain authoritative.

Geist and Geist Mono are loaded once in the locale layout through `next/font`;
font files are self-hosted, with system Chinese/Korean fallbacks. Browsers do
not request Google Fonts. Reading sizes, Gallery captions, source presentation,
and Drift's circular overlay controls retain their instance styles.

Default/large actions, default Inputs/Selects and selection-menu items use
44px mobile heights; desktop controls retain compact heights. Mobile Inputs
retain 16px text to avoid focus zoom. Explicit small/icon-small variants and
instance overrides retain their existing density; their task-specific mobile
adaptation belongs to the consuming surface, not a universal forced resize.
Slider and Switch retain existing continuous-input geometry and semantics.
Explore uses complete, naturally sized top-level Tab labels, fitting together
in the desktop Inspector and scrolling only when narrower layouts or enlarged
text require it, with retained Radix focus behavior. Its panels remain mounted
while inactive so Tab changes do not recreate their local editing state; existing
precise-input commit/validation rules still apply.

The Navbar brand link may shrink and visually truncate at narrow widths to
avoid overlapping the existing action group. Its complete accessible name and
Explore destination remain unchanged; this safety correction does not regroup
navigation or add/remove an entry.

The navigation's 48px total height includes its bottom border; its inner row
fills that height. This keeps the viewport-sized Explore workspace from
overflowing the document by a border pixel and scrolling on full-height focus.
The desktop Inspector and retained canvas share one parent-owned geometry state;
the canvas fills the visible area while open and the full workspace while
closed. Only artwork-toolbar presentation is portalled into its fixed bottom
bar; the original component still owns canvas file dropping and save/export
dialogs. The mobile panel uses Peek/Half/Full over that same canvas, with controls
retained and inert in Peek. Short landscape uses the 320px sidebar. Panel height
and bottom clearance follow the visual viewport, with safe-area bar padding.
Numeric focus promotes Full; keyboard reduction locks the handle. Transient
same-URL history preserves Next history fields, exits the existing Radix child
modal first, then reduces the panel. It is not persisted artwork state or a
formula/route resolver.
UI Back uses the latest artwork URL/router snapshot rather than replaying a
pre-edit parameter query. The panel consumes the existing qualified Explore
URL writer's applied output; it does not encode a second artwork projection.
Revisited same-page entries cannot strand page Back
on obsolete panel positions. Switching to the sidebar drains portrait positions
without changing the artwork. Actual page traversal remains with Next.
Dismissal requests at most one native Back while that traversal is pending.
Completing an earlier dialog's dismissal must not dismiss a newly opened layer.
Outgoing navigation closes the mobile menu when the route commits, rather than
starting an Explore-only dismissal traversal over the destination page.
The UI history bridge may project an artwork URL only while the router still
owns that Explore pathname; a destination route must not be overwritten by a
retained or unmounting Explore instance.

The plane, precise pair and separate Reset precede exploration-window actions;
closing the optional plane does not hide precise inputs. Mobile numeric steppers
retain their handlers but use a 44px two-button row instead of tiny stacked
arrows. Desktop input geometry remains unchanged. Artwork-bar wrapping measures
intrinsic short-label widths after font loading and on resize, not a locale list.

Gallery Collection, Community and My Works captions share
`GALLERY_CARD_TITLE_CLASS` in `gallery-card-styles.ts` for the retained 14px
external-title role. Their 8:5 preview frames, canonical primary navigation,
author/license disclosures and loading/failure branches are unchanged. Gallery
view links wrap naturally; discrete cloud actions retain their handlers with
44px mobile targets and compact desktop geometry.

Transform choices use complete 13px labels in an auto-fitting grid, growing
with available width and text size instead of clipping a fixed tiny column.
Selection also exposes `aria-pressed`. Navbar instance links adopt the control
text role and compact desktop spacing; the mobile menu retains its five routes
with 44px rows. Brand, tagline, reading/source surfaces and Drift retain their
declared exceptions; no navigation grouping or business resolver is introduced.

## Language, validation, and rollout

Preserve all seven locales: en, zh, pt, ko, ru, es, fr. All changed visible/aria
copy belongs in locale resources in the same implementation change. Keep full
labels, interpolation/parity, and meaningful fallback; raw keys/exceptions are
not user-facing copy. Formula IDs, math, source, authors and license identities
remain original facts. Compact presentation cannot hide required source/rights
disclosure or change routes, locale metadata, canonical/hreflang or indexability.

Follow the validation policy rather than duplicating commit/CI command lists:

- Prose-only adoption uses content/link/diff checks, without a browser or GPU run.
- Shared style/layout adoption checks actual interaction, text fit, focus, input
  drafts, scrolling and propagation at 1440/1180, 390/320, short landscape,
  keyboard and safe-area conditions. Verify Tab overflow under long translations
  and user text/viewport scaling; Figma widths are not browser measurements.
- Canvas/Inspector adoption compares the declared open/closed rectangles and
  drawing sizes, retained canvas identity, unchanged bounds, centered artwork
  coordinates, and latest-frame/capture gates.
- Gesture changes exercise click, slow/fast drag, exit/reentry, normal release,
  cancel/lost capture, additional pointers and subsequent precise input.
- Affected saved-state/recovery paths use the consumer matrix representative
  identities, Julia qualification, keyframes and missing-source negatives.
- Engine/shader/qualification or specialist inputs retain their applicable full
  gates. A UI layout or ordinary Julia test name alone does not require a
  full-library GPU audit.

Distinguish design fixtures, browser simulations, real-device results, automated
checks, and maintainer acceptance. Reuse only applicable successful evidence and
report failures, skipped/not-run checks, scope and revisions honestly. Diagnose
before fixing unknown interaction/performance problems.

Foundation adoption, desktop/mobile layout, gesture fixes, shared-page
adaptation, integration validation, and private agent-reading pointers have
separate scopes. This document does not authorize all of them. Reverting a
presentation change must not migrate or rewrite existing Documents/Envelopes,
formula identities, saved parameters, or source rights. Shared structural
changes require reviewing independent rollback claims. Release preparation,
merge, deployment and release actions remain separately authorized.

### Maintained regression coverage

- [Workspace interaction](../../tests/e2e/explore-workspace.spec.ts) compares
  retained canvas identity, declared state geometry, restored pixels and bounds
  through Inspector changes; exercises
  mobile positions, child-first Back, precise input and translated Tabs.
  Root font-size scaling and visual-viewport keyboard fixtures are simulations,
  not evidence of native browser zoom or physical mobile keyboards.
- [Pointer ownership](../../src/test/plane-pointer-ownership.test.tsx) and
  [native pointer flows](../../tests/e2e/plane-pointer-ownership.spec.ts) cover
  persistent capture, matching-pointer endings, cancellation, additional
  pointers and subsequent gestures without changing coordinate semantics.
- [Shared page consistency](../../tests/e2e/shared-page-consistency.spec.ts)
  checks translated Gallery titles/actions, Transform choices and navigation.
- [Artwork preservation](../../tests/e2e/explore-preservation.spec.ts) checks
  precise published artwork save/reopen/refresh, portable custom snapshots,
  view/transform/keyframes and malformed-import rejection.
- [Worker lifecycle](../../src/test/render-worker-client.test.ts) covers delayed
  errors from superseded Workers, current failure/retry and stale-frame disposal.
- [Last good frame](../../tests/e2e/explore-last-good-frame.spec.ts),
  [published previews](../../tests/e2e/community-published-preview.spec.ts) and
  [unavailable artwork](../../tests/e2e/artwork-unavailable.spec.ts) retain
  latest-frame capture gates, published identities without embedded source,
  and honest unsupported/loading-failure states.

These tests remain representative application coverage. They neither replace
applicable specialist gates nor prove physical-device performance or complete
runtime adoption. Browser fixtures must isolate cloud writes and analytics.
