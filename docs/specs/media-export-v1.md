# Media Export Contract v1

- Status: Accepted target contract; runtime adoption is incremental
- Date: 2026-09-25
- Introduced in: FractalPark v0.4.22
- Scope: Local image and animation export

## Purpose and authority

This specification defines the public product and engineering boundary for
exporting a FractalPark artwork as an image or animation. It governs Export
requests, previews, capability checks, resource protection, job lifecycle,
errors, cancellation, naming, and the animation-speed state shared with
playback.

This is a target contract, not a claim that the current product already
implements it. Adoption happens through separately reviewed changes. The
isolated Slice 0 prototypes are evidence for this decision; they are not
production implementations:

- [static export and preview prototype](../testing/v0.4.22-static-preview-prototype.md);
- [animation encoding prototype](../testing/v0.4.22-animation-encoding-prototype.md).

The following contracts remain authoritative at their own boundaries:

- [Fractal Content and Creation Model](fractal-content-and-creation-model.md)
  owns canonical artwork state and recovery across consumers;
- [Fractal Document v2 and Envelope v1](fractal-document-v2.md) owns durable
  production state and portable project files;
- [Unified Formula Library v1](unified-formula-library-v1.md) owns the
  reader-first Document v3 / Envelope v2 boundary;
- [Interface Design and Interaction](interface-design-and-interaction.md) owns
  shared responsive and accessibility rules;
- [Development Validation](../testing/development-validation.md) selects
  applicable implementation and release checks.

## Scope

v1 has two independent media outputs:

| Kind | Required formats | Default |
|---|---|---|
| Image | PNG and JPEG | PNG |
| Animation | MP4 and WebM | MP4 |

PNG, JPEG, MP4, and WebM are product format names. A format is available only
when the exact requested output can pass its capability and resource checks.
The UI does not require users to choose a codec.

The following are outside v1: WebP, AVIF, GIF, image-sequence ZIP, SVG, PDF,
TIFF, HDR or 10-bit media, cloud rendering, server-side FFmpeg, export history,
sharing, social cards, source/shader export, and project-file enhancements.
Existing `.fractal.json` download and import remain separate artwork actions;
they are not tabs or formats in the media Export workspace.

## Ownership and immutability

An Export request is an immutable snapshot of:

- the recovered artwork Document and supported formula assets;
- selected kind and format;
- exact width, height, and, for animation, frame rate and the resolved full-loop range;
- render quality, format-specific encoding quality, and background;
- normalized composition;
- animation speed when applicable;
- the resolved safe filename.

Preview and final output consume the same snapshot semantics. Preview may use
fewer pixels, but it must not become the source bitmap for final output.
Starting a job freezes its request. Later edits affect only a later job.

Export state is transient. Composition, output dimensions, format, quality,
background, filename, progress, and errors do not modify the Document, URL,
main canvas, keyframes, cloud artwork, or project file. Animation speed is the
only v1 Export-related value that is durable artwork state, because it also
governs normal playback.

## Image contract

### Formats and encoding

- PNG is lossless and may preserve alpha.
- JPEG is opaque. Transparent input is composited onto the explicitly selected
  background before encoding; changing only the alpha channel is insufficient.
- The returned Blob MIME is authoritative. A requested MIME that produces a
  different MIME is an error; changing only the extension is prohibited.
- PNG has no compression-quality control.
- JPEG exposes `Balanced`, `High`, and `Maximum`, mapped to browser quality
  hints `0.82`, `0.92`, and `1.00`; `High` is the default. These hints do not
  promise byte-identical results across browsers.

### Dimensions

Every preset displays its exact pixels. Orientation swaps width and height for
the `2:3` and `16:9` families. `1.91:1` is a landscape preset; its reverse can
be entered as custom dimensions.

| Ratio | First | Default | High resolution |
|---|---:|---:|---:|
| `1:1` | `1080x1080` | `2048x2048` | `4096x4096` |
| `2:3` | `1200x1800` | `2000x3000` | `3000x4500` |
| `16:9` | `1280x720` | `1920x1080` | `3840x2160` |
| `1.91:1` | `600x314` | `1200x628` | `2400x1256` |

`Current canvas` inherits the current view ratio and visible world range, not
the browser's CSS pixel dimensions. Its three target short sides are `720`,
`1080`, and `2160` pixels; the other side is rounded to an even integer.

Custom image dimensions are valid only when each side is at most `8192` pixels
and the total is at most `16,777,216` pixels. Either violation blocks submit at
the dimension fields. Within those hard limits, v1 adds no soft size warning or
second confirmation. Render sampling remains subject to a separate internal
budget and must never reduce the confirmed output pixels silently.

Both limits are inclusive and apply to presets and custom values. A computed
`Current canvas` preset that exceeds either limit is disabled with its computed
pixels and reason; it is not clamped to a different size.

### Render quality

Render quality is independent from dimensions and lossy encoding quality:

| Label | Sampling |
|---|---:|
| `Off` | no additional samples |
| `Standard` | `2x2 / 4 taps` |
| `High` | `3x3 / 9 taps` |
| `Ultra` | `4x4 / 16 taps` |

`High` is the default. The existing artwork Render toggle corresponds to
`Standard`; it does not redefine the Export request.

Image preflight also requires `outputPixels * taps <= 150,994,944`
(`4096^2 * 9`). A quality option that exceeds this budget is disabled in place;
a request that becomes over-budget fails closed. Pixels, taps, and composition
are never reduced silently.

## Animation contract

### Formats and profiles

MP4 and WebM are both required v1 formats. The default request is
`1920x1080 / 60 FPS`; the maximum approved profile is
`3840x2160 / 60 FPS`. Portrait orientation swaps width and height. The frame
rate choices are `24`, `30`, and `60 FPS`.

Any additional ratio or resolution exposed by an implementation must use even
pixel dimensions, remain within the orientation-adjusted maximum envelope, and
have explicit capability and resource evidence. This contract does not permit
an implementation to advertise an unmeasured profile merely because its fields
fit the maximum.

MP4 prefers an encodable AVC route and may use another explicitly probed MP4
codec. WebM prefers VP9, then VP8, and may use another explicitly probed WebM
codec. Codec selection is an implementation detail within the selected
container. It must not change the requested container, dimensions, frame rate,
duration, or composition.

Animation v1 is opaque and composites onto the selected background before
encoding. Video quality exposes `Balanced`, `High`, and `Maximum`; `High` is
the default. Target bitrates are `8 / 12 / 20 Mbps` at 1080p60 and
`28 / 40 / 60 Mbps` at 4K60. Other dimensions and frame rates interpolate by
pixel and frame-rate ratio between the reference profiles and remain bounded by
the selected tier. A codec may adapt near the target but cannot switch tiers.
MP4 and WebM labels do not imply byte-identical or numerically equivalent codec
results; conformance uses playable output plus the expected size/quality trend.

### Fixed-step time

Animation output is derived from canonical timeline time, never from realtime
page frame delivery:

```text
effectiveDuration = baseDuration / speed
outputTime = frameIndex / fps
canonicalTime = outputTime * speed
frameCount = max(1, ceil(effectiveDuration * fps - Number.EPSILON))
```

Frame `i` starts at `i / fps`; its duration is
`min(1 / fps, effectiveDuration - i / fps)`. The endpoint at
`effectiveDuration` is not encoded as a duplicate first frame. Encoding time is
not media time. MP4 and WebM created from the same request use the same
timestamps and canonical samples.

v1 exports exactly one complete canonical loop. A request may carry its
resolved full-loop range as immutable data, but v1 has no user-facing custom
range control. Custom ranges require a later contract.

### Playback speed and persistence

The only valid speeds are:

```text
0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4
```

`1` is the default. Pointer, touch, arrow-key, Home, and End interactions move
through these nine ordered values. Speed changes time advancement only; they do
not alter keyframes, keyframe order, canonical segment durations, or the base
timeline.

`FractalDocument.animation.speed` is an optional additive field whose value is
one of the nine values above. Missing, non-finite, out-of-range, or non-member
values normalize to `1`. New writers emit only a valid member. This field does
not require a Document v2 or Envelope v1 version increment. Reader-first
Document v3 inherits the v2 animation shape; its writer remains disabled until
separately activated. No destructive storage migration is allowed.

Existing Document v2 readers ignore the unknown optional field and therefore
play at `1`; new readers normalize missing values to `1`. If any released
consumer or storage constraint rejects this additive field, the writer remains
disabled until a separate compatibility decision is approved.

Save, project download/import, cloud reopen, published reopen, and Remix must
preserve a valid speed. Legacy artwork without the field opens at `1`.

## Composition and preview

The media workspace is one responsive dialog with `Image` and `Animation`
tabs. Desktop places preview and settings side by side. Mobile places preview
above settings in the same scrollable dialog. There is no Preview route and no
second Export state store.

The target frame is fixed while content is adjusted inside it. `Fit` is the
default; `Fill` is the alternative starting preset. Pan, zoom, or rotation
changes the mode to `Custom`. The transform is stored in normalized target-frame
coordinates so preview and final pixels do not drift with resolution.

- `Fit` preserves the complete current visible world range and reveals more
  world area along the necessary axis.
- `Fill` fills the target frame without stretching and may crop current-view
  edges.
- Reset returns exactly to the selected Fit or Fill baseline.
- Animation applies one composition transform to every sampled frame.
- PNG alpha is previewed over a checkerboard; JPEG shows its actual background.
- A failed or canceled preview keeps the last valid preview visible alongside
  the truthful new state. Superseded results must not paint.

Rotation is a world/camera transform applied through render bounds and rendered
directly at the target dimensions; an already rendered bitmap is never rotated
and resampled. Request rotation is normalized to `[-pi, pi]` radians. Gestures
are continuous, explicit/keyboard controls step by 15 degrees, and an advanced
numeric input uses degrees. Preview's long edge is at most `720` pixels and
updates use a `120 ms` debounce. Resolved normalized composition values must
match within `1e-9`; visual center drift must remain below half a final-output
pixel.

Gestures require keyboard and explicit-control equivalents. Dialog scrolling
must not steal an active composition gesture, and a composition gesture must
not make the rest of the mobile dialog unreachable.

## Capability contract

Capability is evaluated for an exact tuple, not just a filename extension:

```text
format + container + codec candidate + width + height + fps + quality
```

Image capability requires encoding, exact Blob MIME, decode, and decoded pixel
dimensions. Animation capability requires an encodable codec within the chosen
container plus successful mux, metadata decode, expected dimensions, and
duration on the qualified browser/device route.

A positive API probe is necessary but not sufficient. A format/profile may be
shown as unavailable when the complete route has not been qualified. An
unsupported tuple fails closed before work where possible, or ends with an
explicit capability error if the browser fails after a positive probe.

Approved formats remain visible when unavailable; the exact option is disabled
with a named reason and any qualified alternative. Release minimums are:

| Environment | Minimum video route |
|---|---|
| Chromium desktop | MP4/AVC and WebM/VP9 at the exact 1080p60 and 4K60 reference profiles |
| Firefox desktop | WebM/VP9 or VP8; unavailable MP4 remains visibly disabled |
| Safari desktop | MP4/AVC; unavailable WebM remains visibly disabled |
| Physical iOS Safari and Android Chrome | at least one exact 1080p route per device; 4K60 may be a named capability exception |

An exception never permits a lower-resolution or lower-frame-rate file to be
reported as the requested output.

Allowed fallback is limited to another qualified codec inside the same selected
container. The following silent fallbacks are prohibited:

- changing PNG to JPEG or MP4 to WebM;
- changing dimensions, orientation, frame rate, duration, speed, background,
  composition, or render quality;
- returning a file whose extension disagrees with its actual media type;
- duplicating frames to label a lower-rate result as the requested FPS.

## Dependency and locality contract

Media generation is local to the browser. Artwork pixels, frames, parameters,
formula source, and media output are not uploaded.

The initial application and image-export path must not preload a video muxer or
encoder. Animation intent may dynamically load a reviewed dependency. Loads are
deduplicated and reusable; a rejected load is retryable. Cancellation while a
shared load is pending prevents that consumer from starting a job even if the
module resolves later.

The Slice 0 evidence selects a narrow Mediabunny bridge as the current
WebCodecs/muxing candidate. Production adoption still requires MPL-2.0 notice
review and a measured production chunk. The prototype's `59,851 B` gzip result
is evidence. The product bridge budget is at most `250 KiB` raw / `75 KiB`
gzip. On the recorded Linux reference desktop (i7-4700MQ, 15 GiB RAM, Chrome
145), first module preparation is at most `2 s` and a cached preparation is at
most `250 ms`. These local timings are not a network download SLA.

## Resource contract

Preflight uses the exact request and reports at least:

- output pixels and render-sample work for images;
- effective duration and frame count for animations;
- application-owned raw-frame queue bytes;
- estimated encoded bytes and whether the exact capability tuple is qualified.

Animation rendering must apply backpressure. The application-owned raw RGBA
queue is bounded to at most three full frames; implementations may use fewer.
Frames, WebGL resources, encoder/muxer objects, workers, object URLs, and output
buffers have explicit ownership and cleanup.

Animation preflight limits effective duration to `30 s`, total frames to
`1,800`, the application-owned raw queue to three frames and `128 MiB`, and
estimated encoded output to `200 MiB`. Each limit is inclusive. Exceeding one
blocks the exact request before encoding; it never authorizes a lower
resolution, FPS, speed, duration, or quality tier. These deterministic limits
do not claim to measure codec-internal or total device memory.

## Job lifecycle and cancellation

The observable lifecycle is:

```text
idle -> preparing -> ready -> rendering -> encoding -> finalizing -> succeeded
                         \-> canceled
                         \-> failed
```

Image jobs may omit encoding-specific states that do not occur. Progress is
determinate only when a meaningful completed/total unit exists. Dependency
preparation without byte totals uses an indeterminate state, not a fabricated
percentage.

One user intent owns one active job. A replacement or cancellation aborts
owned work, ignores all late results, and releases resources. Cancellation is
not failure. It creates no download and no success event. A successful result
means a valid media Blob was finalized and the download handoff was initiated;
clicking Export alone is not success.

Media time never depends on realtime `requestAnimationFrame`. If a hidden page
is suspended, progress may pause and resume, but fixed timestamps do not change
and frames are not duplicated. Closing the dialog cancels its active job;
navigation or unload aborts and releases resources. v1 does not continue a job
across navigation.

## Error contract

User-facing errors map technical failures into a finite stable set:

| Code | Meaning | Retry boundary |
|---|---|---|
| `invalid-request` | dimensions, range, speed, or other input is invalid | edit request |
| `format-unavailable` | selected format has no qualified route | change format or environment |
| `profile-unavailable` | exact dimensions/FPS/quality tuple is unsupported | change request explicitly |
| `resource-limit` | declared frame, sample, memory, or output budget is exceeded | reduce request explicitly |
| `dependency-load-failed` | dynamic encoder/muxer preparation failed | retry preparation |
| `render-failed` | a required frame could not be rendered | retry job |
| `encode-failed` | encoder or muxer failed after start | retry job or environment |
| `mime-mismatch` | actual output type differs from the selected format | no download; retry route |
| `download-failed` | valid output could not be handed to the browser | retry handoff |
| `canceled` | the owner canceled or superseded the job | start a new job |

Localized UI does not expose raw exceptions, source, parameters, private IDs,
or message keys. Diagnostics may retain a bounded non-sensitive technical cause.
Errors never mutate the artwork or replace the last valid preview.

## Filename, privacy, and analytics

The generated filename is usable without user input:

```text
image:     <safe-name>-<width>x<height>-<timestamp>.<actual-extension>
animation: <safe-name>-<width>x<height>-<fps>fps-<timestamp>.<actual-extension>
```

An absent or unusable artwork name becomes `fractalpark`. A cleared optional
filename returns to the generated default. The final extension comes from the
validated media type/container, never from user input. Sanitization removes
path separators, control and platform-reserved characters, unsafe trailing
dots/spaces, and empty results while retaining safe Unicode and enforcing a
bounded length. New media exports do not use `myfrac` as their default prefix.

The timestamp is UTC `YYYY-MM-DDTHH-mm-ss`. The safe basename is at most 96
JavaScript code units and the complete generated filename is at most 140;
artwork-name content is truncated first so dimensions, FPS, timestamp, and the
validated extension remain intact.

The existing `export_fractal` event may record kind, format, coarse
dimension/frame buckets, render/encoding quality tier, result, and stable error
code. It must not record the complete filename, artwork state, formula source,
Blob, media bytes, or high-cardinality artwork identifiers.

## Accessibility and localization

All user-facing labels, explanations, states, validation, and errors are
localized for the supported locales. File extensions, MIME/codec identifiers,
pixel values, FPS, URLs, source, versions, and license identifiers remain
technical values.

The complete flow remains usable at 320 and 390 CSS pixels, with enlarged text,
keyboard-only input, touch, and a screen reader. Focus returns to the Export
entry after close. Focus, selected state, loading, error, and disabled state are
not communicated by color alone. Reduced-motion preferences remain effective.

## Adoption and conformance

Runtime work conforms only when it proves the affected rows below:

| Boundary | Required evidence |
|---|---|
| Request | immutable snapshot; format-specific validation; no Document mutation |
| Image | exact MIME/decode/pixels; alpha/background; preset and hard-limit edges |
| Preview | latest-only behavior; normalized preview/final composition parity |
| Animation time | speed normalization; fixed timestamps; exact duration/frame count |
| Animation media | exact-profile probe; mux/decode metadata; backpressure and cleanup |
| Recovery | speed preserved across supported save/reopen/import/Remix consumers |
| UI | responsive, seven-locale, keyboard, touch, focus, and screen-reader paths |
| Packaging | video dependency absent from initial and image-only bundles |
| Devices | Chrome, Firefox, real Safari, and at least one physical mobile device |

Playwright WebKit is useful engine evidence but is not real Safari evidence.
The current Slice 0 Chromium evidence qualifies only its recorded environment.
Firefox, WebKit, Safari, physical mobile, precise memory profiling, dependency
notice review, and a measured production bundle remain activation gates, not
passes inferred from this document.

Full formula-library GPU workflows are not required for prose-only contract
changes. Later renderer, binding, or published-asset changes select their gates
under the Development Validation policy.
