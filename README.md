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
- **Import stops** loads additional addresses from a GlowRoute JSON export. **Export stops** saves a backup of display data and edits; selected flags are exported too.

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

- **Map UI**: Leaflet 1.9.4 from UNPKG; tiles `tile.openstreetmap.org`, with attribution. Public OSM tiles are not for heavy public app traffic; use a tile provider for scaling.
- **Geocoding**: US Census Geocoder for US house numbers (uses the officially supported JSONP approach because Census blocks CORS; positions may interpolate); OpenStreetMap Nominatim for places and when Census fails. Nominatim calls are limited to ~1 request/sec. No autocomplete; responses are cached locally. Public Nominatim must not power high-volume or commercial apps.
- **Road routing**: `router.project-osrm.org` is a public **demo** server, suitable for occasional prototype testing but not reliable production use. Configure a supported paid/free-tier routing API, self-host OSRM, or add a backend proxy before promoting this app widely. Never place a private production API key in this public static app.
- **Privacy**: Selected addresses, endpoints, user-added locations, and calculated geocodes are saved in browser `localStorage` only. Geocoding queries expose location searches to third-party API servers; routing queries expose coordinates. The app does not run an analytics tracker or account system. `Export stops` includes the addresses and coordinates you entered.

## Known limitations

- 25 addresses are seeded from an earlier 2026 Irvington display list; **display operation and decorations for a specific night are not guaranteed**. Verify signs/hours and event closure notices.
- Address geocoding can return imprecise pins. Confirm via aerial view/other map apps and correct with **Pin** when needed.
- The public routing or geocoding services may reject high-volume requests or fail due to CORS, connectivity, limits, or outages.
- Map pins and optimizing require the internet on first use; caching the app shell is not offline navigation.
- Route time excludes viewing/parking time, exact entrance/driveway location, live traffic, closures, and weather.

## Next improvements

Self-hosted routing or serverless proxy with caching; geocode validation and bulk imports; import community display feeds where permitted; house photos/hours/community rankings; repeated-road-overlap penalty and candidate comparison; traffic-aware routing provider; smarter highlight selection under a fixed time budget; route-sharing links.
