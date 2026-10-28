# GlowRoute v1.5 audit

Audit date: October 28, 2026. Starting revision: `d03df70` (`main`). Changes are intended for review on a release branch; updating this document does not mean the release has been merged or deployed.

## Architecture and baseline

Reviewed every application module, HTML/CSS, manifest, service worker, seed/catalog data, directory contribution guidance, README and all test files before implementation. This is a static ES-module app: `app.js` owns DOM/state and service integration; `optimizer.mjs` owns fixed-endpoint asymmetric stop ordering and navigation links; `tour.mjs` owns budget selection, overlap estimates and itinerary sharing; `projects.mjs` owns seasonal snapshots/migration; `importer.mjs`, `catalogs.mjs` and `directory.mjs` own reviewed imports and public references. No build or server is required for GitHub Pages.

The exact Held–Karp solver through 12 stops, heuristic through the UI's 68-stop routing limit, budget selection, rated/favorite/must-see stops, directory refresh, snapshots, manual pins, backups, sharing and Live Drive already existed. They were extended rather than replaced. The existing local-storage keys and project format remain unchanged.

Baseline: **37/37 Node tests passed**. The historical Python browser harness could not run here because Python Playwright was absent. Inspection also found Linux-only executable paths and several harnesses that concatenated incomplete module lists. The maintained Node Playwright suite now serves and imports the actual application; old Python entry points delegate to it.

## Confirmed bugs fixed

| Finding | Evidence / effect | Resolution |
| --- | --- | --- |
| Indianapolis-only routing | `resolvePoints` rejected any coordinate outside a central-Indiana rectangle | Global coordinate validation, coordinate input and no forced US filter in Nominatim; keep sample data |
| Distance preference overridden | Alternatives computed distance first but ultimately assigned the fastest variant's order | Retain the solver's selected order; selection index follows that order, even if its geometry request fails |
| Stale async state | Project changes and edits could complete into a later trip; geometry draws could finish out of order | Abortable operation lifecycle, checks after awaits and draw revisions |
| Unbounded requests / repeat work | OSRM fetches had no timeout, queue or cache; missing geometry could be fetched repeatedly | Small `routing.mjs` client; serialization, spacing, timeout, 429 cooldown, short bounded memory caching and coalescing |
| Misleading manual-order descriptions | Manual arrows retained an exact/heuristic optimization claim and an endless comparison loading message | Explicit manual-order label and recomputed totals/navigation |
| Different estimated totals | Live OSRM smoke check returned full-route totals differing from summed table legs | Selected geometry totals now drive all three panels; matrix fallback is identified |
| Directory capacity | An update plus an addition could be rejected because all reviewed actions counted toward capacity | Use the actual resulting catalog application for the capacity decision |
| Presets drop must-see stops | Featured presets replaced the selection; top five could contain removed seed IDs | Build presets from existing records and union must-see displays |
| Backup fallback / partial acceptance | Restore used a permissive migration helper that could filter malformed projects or seed a sample | Validate all projects first; persist atomically before changing memory; preserve unreadable browser data |
| Hidden storage failures | Later success status could overwrite the only quota warning | Independent persistent storage alert, plus guarded update reload |
| Text/file endpoint disclosure | Checkbox affected URL sharing but text output always contained endpoints | One opt-in applies to URL, text and file itineraries |
| Same-tab shared links | Only startup inspected the URL fragment | Handle fragment changes and clear invalid/stale previews |
| Import classification | A plain list containing “Street” and commas could be read as CSV, losing names/city and evading deduplication | Detect actual address header cells; test names and formatting duplicates |
| Literal city parsing | CSV city text was used as a regular expression | Literal matching, with regression for punctuation in city names |
| Partial coordinate imports | Latitude and longitude were accepted separately | Validate and import the coordinate pair together |
| Interrupted Live Drive | Skip/visit removed an ID but failed rerouting left the old next stop and travel estimates on screen; previously visited stops could disappear from a newly planned drive | Update remaining itinerary immediately, clear obsolete estimates, use the session's remaining IDs, expose retry |
| GPS race | Busy state began after awaiting location permission | Lock/cancel the whole operation, check the token after GPS, retain manual input |
| PWA release coherence | Network-first HTML could be combined with old cache-first modules; activation deleted unrelated caches | One versioned shell, update notification and reload; delete only GlowRoute shell caches |
| Offline directory ambiguity | Cached directory fallback was indistinguishable from a fresh response | Explicit cached-response header and visible offline-copy label |

## UX opportunities implemented

New visitors can choose a sample or a custom holiday drive. Saved users bypass that choice. New custom/shared projects have blank endpoints rather than inheriting Indianapolis defaults. Optional budget controls and per-display detail actions use native disclosures. Favorites/must-see/rating remain directly available. Mobile users reach planning before the map. Live Drive has a large next stop, progress, direct navigation and a focused view with an easy return to the itinerary; errors remain visible there. Added a skip link, named reorder controls, stronger focus treatment, reduced-motion styles and larger mobile controls.

New optional starting GPS is held only in memory. Resume saves remaining display IDs, total progress and the last confirmed display ID, not a GPS trail, routing matrix or GPS anchor. After reload it uses the last confirmed display or the saved starting address. Changing the trip's endpoints/selection/budget makes an old session ineligible for resume.

## Not confirmed as bugs / preserved behavior

- The exact solver and asymmetric endpoint treatment passed the baseline; preserved.
- Existing navigation splitting already maintained consecutive legs and stop continuity; preserved and retested against documented URL parameters. Google uses at most three intermediate waypoints per leg; Apple uses repeated waypoint parameters.
- URL sharing already omitted private notes/ratings/visited data and defaulted endpoints off; preserved and extended to other output formats.
- Catalog entries already carried source/year metadata and were not presented as confirmed current-season operating displays. No new scraped sources or unverified photos were added.
- Third-party map tiles and road requests were already excluded from the same-origin service-worker cache. This remains explicit.

## Service research and limits

Retained OSRM rather than adding another demo provider. [FOSSGIS OSRM](https://routing.openstreetmap.de/about.html) limits use to one request per second and prohibits heavy use. [Valhalla's official README](https://github.com/valhalla/valhalla#demo-server) describes a public demo with similar fair-use constraints and requests identification/maintainer notification for end-user apps. This is not evidence of a free production reliability upgrade. Another provider would add different matrix semantics and maintenance while still relying on donated infrastructure.

The queue is **per tab**, not a global rate limiter across all users/tabs. A static site cannot enforce application-wide quotas. Keep public-demo use small and review capacity before wider promotion; a suitable hosted/self-hosted provider would require a separate decision. There are no retry storms, polling or background route requests. Memory caching expires after five minutes and does not imply current traffic.

Existing [Nominatim use is subject to its policy](https://operations.osmfoundation.org/policies/nominatim/), including its application-wide one-request-per-second maximum, identifying referrer, caching and restrictions on bulk work. The app retains sequential user-triggered lookups, local geocode caching and US Census-first street lookups. Nationwide coordinate support does not mean nationwide display discovery or perfect geocoding; full addresses and pin checks remain necessary. Public service configuration/global usage enforcement remains a deployment-scale limitation, not a solved SLA.

## Validation

- `npm test`: 55 Node tests; original optimizer/import/project/directory/tour tests plus reliability regressions, including retained budget settings when duplicating into a new season.
- `npm run test:browser`: 16 scenario groups, including desktop 1366×900 and mobile 390×844 in Chromium-based Microsoft Edge 156.0.4314.50 on Windows. External services mocked; actual HTML/ES modules, local storage and service-worker lifecycle exercised. The Actions workflow installs Playwright Chromium on Ubuntu.
- Browser cases cover both objectives, exact/matrix selection, manual order, mapped totals, fixed navigation links, budget subset/must-see presets, GPS denial and ephemeral GPS, shared import/privacy, projects/next-year duplication, historical import review/replacement, directory search/apply, duplicates, malformed restore, full outage/fallback, interrupted routing, storage quota/corruption, Live Drive skip/visit/failure/resume, mobile overflow, alternate map CDN and PWA update/offline caching.
- `node --check app.js`, `node --check sw.js`, `git diff --check`.
- Live smoke check: real Leaflet/OSM tiles and public OSRM road requests using Denver civic landmarks. Genuine screenshots in `docs/screenshots`; these landmarks are an illustrative route, not advertised holiday displays.
- No physical iPhone/Android, Safari, VoiceOver/TalkBack, live closures/traffic or third-party uptime guarantees were tested. Native Maps launch behavior remains device-dependent. Only URL format/continuity was tested automatically.

## Remaining risks and intentional deferrals

`app.js` remains a large orchestration file; extracting request handling and keeping pure policy logic in existing modules improves testability without a rewrite. More decomposition should follow demonstrated maintenance pain. Backtracking estimates use matched undirected geometry segments and can miss partial or differently segmented overlap. Budget selection is heuristic and cannot promise the best possible set; full-route estimates may exceed matrix-based budgets and now say so. No accounts, backend, paid APIs, framework or runtime packages were added. See [ROADMAP.md](../ROADMAP.md) for ranked follow-up work.
