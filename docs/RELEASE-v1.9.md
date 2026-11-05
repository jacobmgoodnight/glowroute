# GlowRoute v1.9 — Connected itinerary editing and drive recovery

## Scope

This release improves four existing outing tasks: finding a stop between the list and map, adding a stop to the chosen route, recovering an accidental visit/skip, and keeping Live Drive focused. It retains the Discover → Plan → Drive workflow and current display data.

## 1. Connected itinerary and map

In **Your stop order**, each display name is a keyboard-accessible button labeled **Show [display name] on map**. Selecting it reveals the pin, opens its popup and highlights the matching map/list stop. **Show in itinerary** in the popup returns to Drive and focuses the matching highlighted row, including on mobile.

Selection uses display IDs and stays in this tab. It does not modify saved projects or request fresh geocodes/road routes. Map tiles may still load as the visible map changes. Existing map removal/reordering/pin correction and their separate **Undo last edit** remain available before Live Drive.

## 2. Add a stop without losing the visit order

From Drive's itinerary review, open **+ Add a stop**. Choose a saved display outside the current route, or **Enter a new display address** with a name and full street address or latitude/longitude. Choose **Before the first display** or **After** a named display, then **Add stop & update route**.

The insertion keeps Start, Finish and the other stops' relative order. It does not run a new optimization or claim that the resulting order is optimal. Road routes check the location, matrix and route geometry before committing the addition. Failed/ambiguous lookups, routing failures, cancellation and obsolete project work leave the itinerary and saved display list unchanged; lookup results are not persisted before commit. City-only references need an approved street location first.

New displays count toward the 70-display saved-project limit; routed displays are limited to 68. Existing routed IDs/normalized addresses cannot be inserted twice, while a display at an endpoint's address remains allowed. A previously excluded saved display can be inserted without creating another record. Viewing time and budget totals update; the new itinerary may exceed the budget and keeps the existing warning. Rough straight-line routes stay approximate with road times unavailable. Insertion is unavailable during Live Drive.

## 3. Undo the latest visit or skip

**Undo last action** restores the previous stop order, anchor, remaining-stop progress and the affected display's prior visited/skipped/timestamp metadata. It works while rerouting is pending, after a reroute failure and after the last display. It cancels obsolete work so a late response cannot replace the restored order. Refreshing road estimates preserves that order rather than re-optimizing it.

Undo restores action metadata only: ratings, favorites and private notes edited during the outing remain. It is a single step held in memory for this tab, cleared by starting, resuming or ending a drive and by plan/project invalidation. The undo record and temporary GPS positions are not persisted or included in sharing/backups. Normal confirmed visit state and existing resume data retain their local-storage behavior.

## 4. Quieter Live Drive actions

Navigate, **Visited**, **Skip & reroute** and current-display feedback stay prominent. **More actions** holds optional **Use my location & reroute** and **End drive**. End and Undo can interrupt a pending reroute; **Retry without GPS** appears when a routing/location failure needs recovery. The next-stop view remains intended for a passenger or while parked, with navigation handled by Apple Maps or Google Maps.

## Compatibility and validation

No storage migration, runtime dependency, new provider, account or hosted data service is added. Existing projects, personal feedback, approved pins, fixed endpoints, endpoint-redacted sharing and PWA release updates retain their contracts. The screenshots use public Denver civic landmarks as examples, not advertised holiday displays.

Validated on November 5, 2026:

- `npm test`: **109 tests passed**, no failures. The insertion regressions cover real exact/heuristic orders, fixed endpoints, excluded stops, immutable inputs, positions, duplicate addresses and limits.
- `npm run test:browser` in Edge 156.0.4314.58: **70 scenario groups passed** using the actual modules with deterministic external-service fixtures. Coverage includes desktop/mobile map/list selection, saved/custom insertion, atomic lookup/routing failure, ambiguity, cancellation, project changes, limits, rough routes, contextual Live Drive controls, visit/skip undo during pending/failed work and after completion, private feedback, navigation, saved projects, sharing and PWA updates.
- The undo regression also checks that viewing-time edits made before and after undo continue updating the schedule and budget totals from the current saved displays.
- Syntax and whitespace checks passed. Independent code review found no remaining release blocker.
- A separate real-service desktop/mobile smoke check passed with Leaflet, OpenStreetMap tiles and OSRM, covering selected-pin highlighting, retained-order insertion, Live Drive rating and undo. Genuine screenshots were refreshed and visually reviewed using public civic landmarks.

GitHub Actions runs the Node and Chromium suites for the release PR before merge. Automated Chromium/Edge coverage does not establish physical iPhone/Android, native Maps or assistive-technology validation. The real-service check cannot guarantee future provider availability.
