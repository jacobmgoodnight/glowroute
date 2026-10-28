# Changelog

## 1.6.1 — Adjustable desktop planner

- Drag the divider between the planner and map to choose their widths. Keyboard controls support arrow keys, larger Shift steps, Home/End limits, Enter to reset and Escape to cancel a drag; double-click also resets.
- Remember the preferred width separately from saved drives. Keep usable minimum pane sizes, restore the preference after resizing the window and preserve the stacked mobile layout. Resize Leaflet with the map area.
- Add deterministic pane-sizing and real-browser interaction regressions, including unavailable storage and unchanged project data. Include the new lightweight module in the updated offline shell.

## 1.6.0 — Discovery and reviewed imports

- Clearly label archived, current-year unconfirmed and future-season directory references. Show source review dates independently of operating verification and expose attributed public notes. Optional locality, description, dates and hours are supported only when an editor supplies them with a source; existing listings receive no invented information.
- Add directory sorting, Select/Deselect shown, global selection clearing and counts for selections outside the current filters. Keep checkbox focus and indicate records already in the active drive.
- Keep edited names, addresses and unchecked rows when switching import modes. Add bulk selection, rejected CSV/JSON record diagnostics and explicit selected/existing/unchecked counts. Allow reviewing up to 500 unique addresses and selecting a subset within project capacity; existing append-mode records are never overwritten.
- Restore safe personal preferences, notes, visit state, source attribution, saved selection and approved manual pins from stop-list JSON exports using fresh IDs. Same-season verification requires matching exported holiday/year; another season resets verification and visit/skip state while keeping personal preferences and pins. Full backups remain the way to restore projects and endpoints.
- Cancel obsolete website/file imports when the project or input changes. Unknown live-page dates remain unknown rather than adopting the current project year.
- Detect source-only catalog updates (notes/hours/review dates) without replacing private notes, favorites or pins. Changing an address also clears old seasonal verification.
- Support public removal drafts by catalog ID without reposting the address or source URL. Document a manageable seasonal source-review and correction workflow.
- Retain the local storage schema, existing formats, GitHub Pages hosting and all v1.5 routing features. No new runtime dependencies, scraped catalogs, photos or claimed operating verifications.

## 1.5.0 — Correctness, reliability and usability

- Remove the Indianapolis routing boundary. Validate worldwide latitude/longitude ranges, preserve manual pins, and accept coordinate start/finish input. Keep the Indianapolis samples.
- Keep distance and time objectives separate. Comparisons never silently replace the selected order, including when one geometry request fails. Preserve the exact fixed-endpoint solver through 12 stops and the larger-route heuristic.
- Serialize OSRM requests at least 1.1 seconds apart in each tab; add 12-second timeouts, cancellation, duplicate coalescing, a bounded five-minute memory cache, and HTTP 429 cooldowns. Clearly label approximate ordering and unavailable travel times.
- Use mapped-itinerary totals consistently in the summary, comparison and Live Drive panels when available; explain matrix-only estimates and budget overruns after manual changes.
- Preserve must-see stops in presets. Count only additions against directory capacity. Detect manual address duplicates and stop misreading ordinary address lists as CSV headers.
- Validate complete backups before replacement; do not overwrite unreadable saved data. Keep storage-failure alerts visible and apply endpoint privacy choices to text/file sharing as well as links.
- Offer sample/custom choices to new visitors, keep existing projects immediately accessible, collapse optional budget controls and display details, improve empty states, keyboard labels and mobile touch targets.
- Add optional one-time starting GPS without replacing the entered address or saving the position. Add a focused next-stop view, direct Apple/Google navigation, progress, reroute retry, and reload/resume from saved stop IDs and the last confirmed stop.
- Keep the application shell consistent per release. Offer Save & reload after an update, retain local data, scope cache cleanup to GlowRoute and label offline directory copies. Never cache third-party map or routing responses in the service worker.
- Add deterministic Node/Chromium regression coverage and pull-request CI. Include genuine browser screenshots, contribution guidance, issue templates, an audit report and a prioritized discovery roadmap.

This release adds no runtime packages, accounts, databases or required API keys. Playwright is a development-only dependency. Public routing remains best effort and is not live-traffic navigation.

## Earlier releases

The repository history contains the v1.4 planning/sharing/Live Drive work, v1.3 public directory, and v1.2 seasonal projects and reviewed source imports. Historical version labels are retained in the history; this log starts with v1.5.
