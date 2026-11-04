# GlowRoute v1.8 — Discover, Plan and Drive

## Scope

The main screen previously presented discovery, project tools, route setup, results and display editing in one long sequence. This release groups the existing tools into **Discover → Plan → Drive**, with optional controls expanded when needed. It is an incremental usability improvement using the existing data and routing features.

| Stage | Main task | Next action |
| --- | --- | --- |
| Discover | Browse listings, add a display or paste/import addresses | Continue to Plan with chosen displays |
| Plan | Choose saved displays, set Start/Finish and objective; optionally set a budget or schedule | Optimize my route |
| Drive | Review the itinerary and map, adjust stops, navigate or use Live Drive | Open Maps or explicitly Start drive |

Returning saved drives open Plan. Empty new drives open Discover. Successful optimization opens Drive for review; it does not start a driving session. If the user switches stages while an operation is pending, that explicit choice takes precedence over an automatic transition.

Saved-drive selection, New drive, interrupted-drive resume, shared-itinerary review and storage/update/status notices remain accessible across stages. The stage controls support keyboard navigation and indicate the active view. Changing stages retains the existing fields and reviewed import; merely viewing a stage does not save a project, load the directory, request GPS or calculate a route. The selected stage is held in memory for the tab.

## Quieter controls and recovery

- Saved-drive maintenance, backups and reset remain available under expandable controls.
- Secondary source tools and website-source import fields are expandable; ordinary browse/add/paste actions stay discoverable.
- Plan provides an expandable saved-display selection alongside endpoints and optimization; budget and schedule remain optional.
- Drive keeps itinerary/navigation and Live Drive together, with route comparisons and sharing expandable.
- Live Drive recovery is independent of itinerary-result visibility, so a failed resume still exposes retry and end-session controls.
- Returning from focused map editing restores the stage that opened it. The existing next-stop view, ratings, favorites, private notes and visit/skip/reroute actions remain available.

## Compatibility and limits

There are no storage migrations, new services or runtime dependencies. Existing saved projects, personal metadata, manually approved pins, backups, sharing privacy and release-shell updates keep their existing contracts. The desktop panel/map divider and focused mobile map remain available.

The initial map now centers on valid saved endpoint or selected-display pins and fits known locations. A saved drive outside Indianapolis opens around its own area; Indianapolis remains the sample fallback when no location is known.

The change organizes existing capabilities; it adds no display coverage or new source harvesting. Public road routing remains best effort and is not live-traffic navigation. [Stronger itinerary/map selection correspondence and observed user/device testing](../ROADMAP.md) remain the next priorities. The [public-page competitor review](UX-REVIEW-v1.7.1.md) informed the grouping; native competitor apps were not tested.

## Validation

Validated on November 3, 2026:

- `npm test`: **103 passed**, no failures.
- `npm run test:browser` using Edge 156.0.4314.58: **51 scenario groups passed**, with deterministic external-service fixtures and the actual application modules.
- Browser coverage includes desktop/mobile keyboard and focus behavior, sticky-tab heading visibility, nationwide initial map position, stage changes without network/storage writes, preserved edited and pending imports, intentional navigation during optimization and delayed resume, interrupted-drive outage recovery, map return, private rider feedback, saved projects, sharing, mobile touch and the PWA install/update/offline lifecycle.
- Syntax checks and `git diff --check` passed.
- A separate real-service smoke check used public Denver civic landmarks with Leaflet, OpenStreetMap tiles and OSRM at desktop and mobile viewports. Genuine v1.8 screenshots were captured and visually reviewed; the examples are not holiday display recommendations.

GitHub Actions runs the Node and Chromium suites for the release PR before merge. Automated Chromium/Edge coverage does not establish physical iPhone/Android or assistive-technology validation, and the real-service check cannot guarantee future provider availability.
