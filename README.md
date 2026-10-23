# GlowRoute — holiday display route planner

A mobile-first, static HTML/JavaScript progressive web app for building a road-aware driving tour through Halloween and Christmas displays. Starts with 25 **2026 Irvington, Indianapolis** display addresses and a ten-house editorial highlight selection.

## Run locally

Serve this folder over HTTP (ES modules won't reliably work if you double-click `index.html`):

```sh
python3 -m http.server 8080
```

Open http://localhost:8080/ in a browser. The app fetches Leaflet and OpenStreetMap map tiles and makes geocoding/routing requests at run time, so internet access is required to optimize. Tests need Node.js 18 or later:

```sh
node --test tests/*.test.mjs
```

## Publish to GitHub Pages

1. Create a new public GitHub repository (e.g., `glowroute`).
2. Upload the **contents** of this folder (keep `index.html` at the repository root), or push the contents with Git. Include the `.nojekyll` file for direct static-file publishing. The ZIP archive itself is not the website; extract its contents first.
3. In repository **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)` and save.
4. Visit `https://YOUR-USERNAME.github.io/glowroute/` after the site is deployed. Open it in Safari on an iPhone and use **Share → Add to Home Screen** to install the PWA.

## How to use

- Select Featured 5, Featured 10, All 25, or a custom set of houses.
- Fill in **Start** and **Finish**. Start defaults to the Indianapolis Zoo. Finish defaults to **the town of New Palestine, not your exact home**. If you want true door-to-door routing, replace it with your chosen endpoint. Entering a home address sends it to third-party mapping services.
- Press **Optimize my route**. The first pass may take a little longer because the addresses are geocoded; results are stored locally in your browser.
- Inspect the map pins, especially houses marked `≈` in the list. The US Census geocoder may use street interpolation instead of a building entrance. To fix a pin, press **Pin**, click the exact location on the map, then **Done**.
- Open Apple or Google Maps navigation parts in sequence. **The entire selected tour is optimized before it is divided into navigation legs.** The last stop of one leg becomes the next leg's origin. The final destination is included in the final navigation leg.
- Dragging isn't implemented in V1, but arrows beside itinerary stops let you adjust an optimized order manually and update the trip.
- **Bulk import / paste list** accepts:
  - Addresses copied from a community Halloween/Christmas display page, one per line (optionally `Display name — 123 Street Ave` or name on the previous line).
  - Copied Google Sheets / Excel rows (TSV) with name and address columns.
  - CSV, TSV, TXT files with a `Name` and `Address` column, or a GlowRoute JSON export.
  - An optional default city/state for addresses missing those parts.
  Preview addresses, duplicates, and list capacity before choosing **Add reviewed displays**. Append mode skips stops already in your list; Replace mode intentionally replaces the 25 starter houses. Addresses are not geocoded until you optimize, and imported addresses need validation before driving.
- **Export stops** saves a backup of display data and edits; selected flags are exported too. Your pasted text and uploaded file content remain local on your device; **GlowRoute does not automatically scrape third-party websites**.

## How routing works

The app gets a directed **travel-time and travel-distance matrix** from OSRM's `/table` service. It solves a fixed-origin/fixed-destination asymmetric traveling-salesperson problem with:

- **Up to 12 display stops:** Held–Karp exact dynamic programming (optimal for the supplied matrix).
- **13–68 display stops:** multi-start least-insertion with iterative 2-opt/reversal and single-stop relocate improvements (heuristic, not guaranteed globally optimal).
- The end location stays fixed, and no stop is intentionally repeated.
- The matrix's distances measure the length of the **fastest driving paths**, not the absolute shortest legal driving distance across every possible road. OSRM does not include live traffic or temporary road closures. The fastest-stop-order metric is based on modeled time, not real-time conditions. Minimizing duplicated road segments specifically is a separate future enhancement.
- OSRM `/route` draws the street-level driving geometry after optimization. If it fails, the UI draws a clearly dashed, **non-navigable** approximate connection between stop pins.
- If the matrix API is down, the user may elect **rough straight-line ordering**, clearly labeled as not road-aware. It cannot accurately estimate driving time.

For maximum compatibility, Google directions links use no more than **three intermediate waypoints** (four new destinations per segment), which works with Google's lower mobile-browser limit. Apple links target **13 new destinations max** per segment; always check the result in the Maps app before departure.

## Services and usage policies

- **Map UI**: Leaflet 1.9.4 loaded from UNPKG (with jsDelivr backup), using the correct official CSS integrity checksum; tiles `tile.openstreetmap.org`, with attribution. Public OSM tiles are not for heavy public app traffic; use a tile provider for scaling.
- **Geocoding**: US Census Geocoder for US house numbers (uses the officially supported JSONP approach because Census blocks CORS; positions may interpolate); OpenStreetMap Nominatim for places and when Census fails. Nominatim calls are limited to ~1 request/sec. No autocomplete; responses are cached locally. Public Nominatim must not power high-volume or commercial apps.
- **Road routing**: `router.project-osrm.org` is a public **demo** server, suitable for occasional prototype testing but not reliable production use. Configure a supported paid/free-tier routing API, self-host OSRM, or add a backend proxy before promoting this app widely. Never place a private production API key in this public static app.
- **Privacy**: Selected addresses, endpoints, user-added locations, and calculated geocodes are saved in browser `localStorage` only. Geocoding queries expose location searches to third-party API servers; routing queries expose coordinates. The app does not run an analytics tracker or account system. `Export stops` includes the addresses and coordinates you entered.

## Third-party display-list ingestion roadmap

The browser-only importer is the safe first step. Many third-party websites restrict cross-origin browser requests (CORS), require authorization, or prohibit scraping, so entering a URL cannot reliably or lawfully ingest an arbitrary webpage directly from GitHub Pages.

Next: source-specific, permission-checked import adapters for published CSV/GeoJSON/JSON feeds, with a small optional backend for fetching permissible HTML/RSS. Add source URLs, attribution, collection timestamps, duplicate merging, seasonal dates, and a manual review/approval screen. Avoid Google Maps page scraping and respect terms/licensing. A geocoding backend with quotas and centralized caching will be needed for many users, since public Nominatim and public OSRM are demo/low-volume resources.

## Known limitations

- 25 addresses are seeded from an earlier 2026 Irvington display list; **display operation and decorations for a specific night are not guaranteed**. Verify signs/hours and event closure notices.
- Address geocoding can return imprecise pins. Confirm via aerial view/other map apps and correct with **Pin** when needed.
- The public routing or geocoding services may reject high-volume requests or fail due to CORS, connectivity, limits, or outages.
- Map pins and optimizing require the internet on first use; caching the app shell is not offline navigation.
- Route time excludes viewing/parking time, exact entrance/driveway location, live traffic, closures, and weather.

## Next improvements

Self-hosted routing or serverless proxy with caching; geocode validation and higher-quality import previews; source-specific community display feed integrations where permitted; house photos/hours/community rankings; repeated-road-overlap penalty and candidate comparison; traffic-aware routing provider; smarter highlight selection under a fixed time budget; route-sharing links.

## GlowRoute v1.2: seasonal projects and reviewed website imports

- **Saved projects:** Use **New drive** for independent Halloween, Christmas, or other outings, with separate year, stops, selection, start/end, and geocode data. Existing v1/v1.1 local routes are migrated into **Irvington Halloween 2026**, without overwriting the original v1 store.
- **Next year / duplicate:** Copy a saved drive into a new year. Each copied listing is marked **Verify season** until you personally confirm it is operating that year. Source dates are preserved on newly imported stops.
- **Remove any stop:** The X button works for both built-in and imported stops and removes the address only from the current project. The checkbox merely includes/excludes the stop from the present route.
- **Backup and restore:** Export all projects in one JSON file. Import it on another device to transfer projects. By default, these are **local-only**, not cloud-synced or account-shared.
- **Import from website:** Under **Bulk import → Import from a website**, known Indy with Kids pages load carefully attributed, explicitly dated **snapshot catalogs** for Halloween 2026 (19 Irvington contest addresses) and a **12-address sample** from its Christmas 2025 archive. These are not a live feed and do not verify that a display is active today. Other HTTPS pages are requested directly from the user's browser only when the third party allows CORS and returns readable text/HTML; otherwise open the original site, copy its listing, paste it, and review the extracted addresses. This app does **not** scrape around site access policies.
- **Review before add:** Every candidate can be unchecked or have its display name / street address edited. The app checks duplicates and capacity, attributes the source, and asks for confirmation before replacing existing project stops.
- **Other directories:** FrightMaps (Halloween), ChristmasPrism, and Holiday Light Finder are linked for discovery. Their websites are **not connected** to a direct API or bulk feed. Partner feeds / owner-submitted catalogs are potential follow-up integrations.

### Source data stewardship

The curated catalogs contain short factual display names and street addresses, with source links; they do not reproduce third-party images or long descriptions. Respect each publisher's usage terms. Do not treat prior-year addresses as confirmation that a private home is displaying this year. The goal is to help people visit **publicly offered** holiday displays; don't publish unverified private homes or overwhelm residential streets.

### Hosting

GitHub Pages serves only static files. It cannot fetch arbitrary websites on behalf of a visitor when the browser disallows cross-origin requests. A reliable automated import pipeline would require a separately hosted, rate-limited, publisher-authorized backend with source-specific adapters and data-refresh timestamps. It is intentionally not bundled into this free beta.

### Tests

```bash
node --test tests/*.test.mjs
python tests/projects_browser.py
```

The browser test uses a stubbed map and simulates the app UI at both desktop and mobile widths; it does not verify the live routing/third-party URLs.
