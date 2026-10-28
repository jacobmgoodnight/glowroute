# v1.6 — Discovery and reviewed imports

Status: v1.6 merged in [PR #3](https://github.com/jacobmgoodnight/glowroute/pull/3) (`a74c92d`). Both release-head Actions runs passed all 68 Node tests and 23 browser scenario groups in Ubuntu Chromium. The v1.6.1 patch adds desktop pane resizing; deployment status is available in GitHub Actions.

## Completed scope

- Directory search now includes public descriptions/notes. Sort by city/area, season, display name or source review date. Select/deselect only the shown records or clear all selections; counts explain selections outside the current filters. Individual checkbox changes preserve keyboard focus.
- Archive/current-year/future labels distinguish a source's season from operating verification. Display source review dates and public notes; optional locality, descriptions, dates and hours remain sourced and bounded. No new operating facts, photos or catalog records were invented.
- Catalog refresh detects changed public details even when the name/address did not change. Personal names/addresses can be retained without prompting the same unchanged source update on every refresh. Private notes/preferences stay separate; replacing an address clears stale pin approval and seasonal verification.
- Import review preserves edits, pins cleared by address edits, and unchecked choices across Add/Replace mode changes. Existing Add-mode matches remain visible but are excluded from application, protecting their personal data. Bulk controls and explicit counts explain selected, existing, unchecked and ignored records.
- CSV/JSON invalid records get reviewable diagnostics without discarding the valid records. Review up to 500 unique records, then select only what fits the 70-display project capacity. Only the first 50 diagnostic details are rendered when many records are rejected. Unreadable JSON, oversized input and lists above the review cap remain blocking errors.
- Actual JSON stop exports round-trip safe preferences, private notes, source context, saved selection, visit status and approved manual pins with fresh IDs. Must-see stops remain selected. Seasonal verification requires matching holiday/year context; another known season resets verification and visit/skip flags, preserving favorites/notes/pins. Legacy exports lacking season context remain supported with a seasonal recheck. Full-project backups continue to include endpoints/settings.
- A pending website/file import cannot overwrite a changed input or project. Undated live pages are not labeled as current-year listings. Network timeouts cover the fetched body as well as headers.
- Removal requests can use a catalog ID without address/source URL fields. Public issue review, permissions and a realistic seasonal source-review process are documented.

## Compatibility and implementation

No runtime dependencies, hosted services, accounts, new catalog sources or storage migration. Existing storage keys, schema version 1 directory records and legacy CSV/TSV/TXT/JSON formats remain supported. Extra directory/export fields are optional. The service-worker cache version advances to v1.6; its core list already covers every runtime module.

Changes are concentrated in `importer.mjs`, `directory.mjs`, their existing `app.js` UI integrations, and `index.html`/`styles.css`. The routing optimizer and its fixed-endpoint behavior are unchanged. Test helpers derive the PWA shell version from `sw.js` so future releases do not require hardcoded test cache-name edits.

## Validation

- `npm test`: **68 passing Node tests**, including all 55 v1.5 tests and new discovery/import regressions.
- `npm run test:browser`: **23 passing scenario groups** in Chromium-based Edge 156 on Windows, including desktop 1366×900 and mobile 390×844. Loads actual modules and mocks external services; includes real local downloads/storage and the service-worker lifecycle.
- New browser checks cover filtered directory selection and hidden counts, archive labels/source dates, sorting/focus, public removal drafts, stable edited import review, rejected records, duplicate safety, an actual export/download/import round-trip, an oversized-list subset and interrupted website imports.
- Syntax checks for application/service-worker modules and `git diff --check`.
- v1.5 deployment independently verified: Pages deployment workflow succeeded, public homepage returned HTTP 200 and included the v1.5 version/resume control.

Hosted Actions results are attached to the release PR. No physical mobile device, Safari/screen-reader or native Maps testing was performed in this pass. Public mapping-service reliability and aggregate quotas remain the limitations documented in the v1.5 audit; no routing provider change is implied.

## v1.6.1 follow-up

The desktop planner/map divider supports pointer dragging, keyboard adjustments, reset and drag cancellation. It remembers a separate browser layout preference, bounds pane widths and redraws Leaflet when its container changes. Saved drive data and mobile stacking remain unchanged; storage failures do not block resizing. The new `layout.mjs` is part of the versioned offline shell.

Patch validation: 71 Node tests and 26 browser scenario groups, including drag/keyboard controls, reload persistence, desktop/mobile viewport changes, map resize callbacks, cancellation/reset, unavailable storage and unchanged saved projects. Physical-device limitations above still apply.

A separate Windows Edge 156 smoke check used real Leaflet, OSM tiles and OSRM routing with public Denver civic landmarks. Widening the planner from 490 to 690 pixels redrew the 726-pixel map correctly; 20 map tiles loaded and no page errors were reported. Landmarks are illustrative, not holiday listings.

## Deferred work

Additional regional feeds require source-specific rights and freshness review. Photos require a sustainable licensing/privacy/bandwidth policy. Physical-device accessibility/navigation checks need the relevant devices. More elaborate overlap/budget algorithms, a hosted moderation system and wider refactoring remain outside this discovery release. See [ROADMAP.md](../ROADMAP.md).
