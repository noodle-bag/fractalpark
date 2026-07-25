# Changelog

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
