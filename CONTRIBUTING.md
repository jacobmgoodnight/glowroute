# Contributing to GlowRoute

Keep the app free, static, local-first and usable on a phone. Prefer a small fix with a regression case to a new dependency or an unrelated rewrite. Check [ROADMAP.md](ROADMAP.md) before substantial feature work.

## Local development

Serve this directory over HTTP, for example `python -m http.server 8080`. No build or npm install is needed to run the app. For tests, use Node.js 22+, then:

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

On Linux, browser dependencies may require `npx playwright install --with-deps chromium`. To use an existing Chromium-based browser, set `GLOWROUTE_BROWSER_EXECUTABLE` to its full executable path. Do not commit browser profiles or local storage.

The browser harness uses actual application modules over a temporary local HTTP server. Routing, GPS and map APIs are mocked; a separate context exercises a real service-worker install/update/offline lifecycle. Do not make deterministic tests depend on public API availability. Old `tests/*_browser.py` entry points delegate to the Node suite for compatibility and no longer require Python Playwright.

For an optional live smoke check and screenshot refresh:

```sh
node tests/capture-screenshots.mjs
```

This contacts Leaflet CDNs, OSM tile servers and OSRM at low volume using public Denver civic landmarks. The screenshots are genuine app captures, not confirmation that those landmarks offer holiday displays. Review the images and retain OpenStreetMap attribution. Do not use private home addresses or GPS positions in documentation.

## Changes and review

- Preserve saved projects and the existing storage schema. Validate whole backups before replacement; never silently discard an unreadable project.
- Keep the exact solver for small routes and fixed endpoints. Heuristic and road-overlap claims must be qualified.
- Maintain public service attribution and usage policies. Do not introduce background routing, geocoder autocomplete or scraping workarounds.
- For a release that changes shell files, bump `CACHE` in `sw.js` and update its `CORE` list for new runtime files. Keep one consistent shell per release and avoid clearing local storage.
- Run Node and browser tests; include the relevant validation and limitations in a focused pull request. Physical iPhone/Android testing should only be claimed when performed.

For display additions/corrections, follow [directory/CONTRIBUTING.md](directory/CONTRIBUTING.md). Only publicly advertised or authorized residential addresses are eligible, with source attribution and season labels. Do not upload private contact information.

Discovery feed work must follow [feeds/README.md](feeds/README.md): independently verify fetch/storage/redistribution rights, keep original seasons and source IDs, and produce review artifacts rather than deployment commits. A public page, permissive robots file or owner-reported permission is not sufficient. Keep city-only records unlocated and never bulk-geocode feeds. The optional Explorer archive utility reads private browser data; test it using synthetic IndexedDB fixtures and never commit a real personal archive.
