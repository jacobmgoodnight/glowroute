# Holiday Display Explorer retirement

**Status: retired.** On November 13, 2026 the owner confirmed that Holiday Display Explorer is retired and that its saved displays do not need to be preserved. GlowRoute is the only maintained app. No migration is planned, and the archive migration utility proposed in PR #12 is no longer needed.

What this means in GlowRoute:

- **Load Explorer's older discoveries** reads a JSON file from the old Explorer repository. That repository was not publicly reachable when checked on November 13, 2026, so expect the button to report that the snapshot could not be loaded. Existing drives are unaffected. Removing or replacing the button is a separate owner decision.
- **Load review snapshot** still opens a locally saved copy of that JSON, if one was kept.
- [`tools/hde-export.js`](../tools/hde-export.js) only works in a browser that still holds old Explorer data on its original origin.

## Historical checklist (superseded)

The steps below were written before retirement, when preserving Explorer's browser-local data was still a goal. They are kept for reference only.

Do not archive or disable it yet. Repository history does not preserve users' browser data. GlowRoute cannot read data stored on a different origin, device or profile; clearing site data can destroy the only copy. GitHub Pages project paths on the same origin can share storage, but that is not a portable backup strategy.

## Back up every browser first

1. Open Holiday Display Explorer in **each browser/profile/device originally used**, including installed PWAs. Save the ordinary **Export local real displays** JSON and any reviewed discovery exports. Those are useful for address import, but are not complete backups.
2. Inventory `hde-displays`, `hde-favorites`, `hde-plan`, `hde-tours`, `hde-preferences` in browser Local Storage. Saved tours include display snapshots; the active plan includes order, endpoints, departure, progress and duration overrides. Photograph or write down important itineraries as an independent check.
3. Export **IndexedDB → hde-memories → displays**. It holds ratings, up to 50 dated comments and three JPEG memories per display. Ordinary exports do **not** include these. The read-only [export utility](../tools/hde-export.js) produces a single private archive containing all five raw storage keys and all memory keys/values, including photos. Review the script, then run its complete contents in the **old app's browser console**. It makes no network requests and changes/deletes no stored data. Do not run unreviewed scripts from messages or unknown sites. If desktop console access is unavailable, use Safari's connected-device Web Inspector or save each photo and dated note manually; keep the old installation until completeness is verified.
4. Confirm the download completed. Open the JSON locally and verify `kind: hde-private-archive`, storage keys, memory IDs, comment dates, ratings and photo counts against the old UI. Copy each photo's `image` data URL into a local browser tab to check that it decodes; store archives privately and keep a second copy. A missing/blocked database or failed read must be resolved, not assumed empty.

## Move usable data to GlowRoute

5. Back up GlowRoute using **Backup all years** before importing. Create the appropriate holiday/year project. Import the old app's exported display JSON through **Bulk import** and review names/addresses. `lng` coordinates and optional display facts are accepted. Automatic/imported pins remain unapproved until reviewed. Old-season data stays unverified. City-only discoveries cannot become navigable stops; use **Load review snapshot** to inspect their original source links instead.
6. Recreate saved tours as separate GlowRoute projects using their display snapshots/order and endpoints from the private archive. There is **no automatic complete tour/archive converter** in v1.7. Transfer favorites, personal ratings and dated comments deliberately; retain the original archive for every item. Do not upload the private archive to GitHub, a public directory, or a shared itinerary.
7. Photos remain in the complete archive/manual image backups. GlowRoute v1.7 does not provide a photo gallery or photo-archive restore UI. Keep the old app available if the gallery is important. A future migration must map original display IDs to memories before changing IDs. Do not treat an address-only import as a complete migration.
8. Compare counts, route order, must-see stops, preferences and representative notes/pictures. Export GlowRoute's full backup and test restoring it in a spare profile. Keep all original archives and original browser storage until the owner accepts the result.

## Only after owner verification

- Obtain independent provider access, storage and redistribution authorization before enabling any harvesting or republishing old snapshots. Both GlowRoute source configurations remain disabled. The old repository's existing import workflow was **not changed** by this work; its owner should review and pause that automation separately if permission remains unresolved.
- Publish a successor notice and migration/backup guidance in the old README and UI, with enough time for users to export. Keep its original HTTPS origin available while browser-local export is needed. No messages or repository changes were sent to old users by this release.
- Validate GlowRoute on physical iPhone Safari/VoiceOver and Maps handoff. Confirm licensed regional data coverage is sufficient for your community.
- When local-only data is independently backed up and any remaining gallery/tour needs are resolved, the owner may archive the old repository as historical reference, pointing to GlowRoute. Archiving/turning off Pages is a separate decision; do not delete old origin data or remove its export path prematurely.

Status when this checklist was written: not ready for unconditional retirement. Superseded by the owner's November 13, 2026 decision above.
