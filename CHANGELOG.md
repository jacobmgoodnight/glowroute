# Changelog

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
