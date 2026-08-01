# Changelog

## 0.4.13 - 2026-08-01

### Added

- Added the bilingual Formula Atlas with 94 formulas across 7 families, 21 in-depth Formula Guides, canonical formula visuals, and localized metadata.
- Added an SSR FRM Guide and standalone beta FRM Editor with shared examples, diagnostics, local `.frm` import/export, preview, and device-local formula storage.
- Added the FractalPark Collection with 26 localized artwork pages, canonical artwork URLs, CC BY 4.0 render licensing, 16:10 assets, related works, and native fullscreen playback.
- Added Remix provenance for formula and preset entry points, preserving namespaced source metadata when remixed artworks are saved.
- Added content analytics for formula, FRM, artwork, Remix, editor, example, and copy-link journeys.

### Changed

- Explore is now the default localized landing page, while the former preset slideshow is available as the immersive, noindex Drift experience.
- Gallery now separates the public FractalPark Collection from device-local My Works and uses a responsive 1/2/3-column artwork grid with hover playback on supported pointers.
- Public product facts, README/About content, JSON-LD, sitemap, crawler guidance, and llms documentation now share the same formula-first product contract.
- Legacy Explore URLs, saved artworks, Fractal Document v1/v2 data, project imports, and custom formulas remain compatible.

## 0.4.12 - 2026-07-25

### Added

- Added the versioned Fractal Document v2 and project Envelope v1 contracts.
- Added tolerant readers for legacy and future-version documents.
- Added portable `.fractal.json` project download, file-picker import, and drag-and-drop import.
- Added transaction-safe custom FRM import with integrity checks, conflict-safe IDs, and rollback.
- Added persistent Explore actions for Gallery save, project download/import, PNG export, and full artwork reset.
- Added a typed `RenderSnapshot` projection for PNG export.

### Changed

- New Gallery saves now use Document-first envelope records while legacy saved artworks remain readable.
- Reset now restores the complete default artwork after confirmation without deleting Gallery items or the custom formula library.
- Explore artwork actions now expose localized pending, success, and error feedback.
- Artwork analytics now include document version, formula kind, file-size buckets, and stable import error codes.

### Removed

- Removed the Share action from the Explore interface.
- Removed save, export, and reset actions from the Render tab in favor of the persistent canvas toolbar.
