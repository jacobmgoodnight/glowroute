# Authorized discovery imports

The weekly/manual **Review authorized display feeds** Action reads `feeds/sources.json`, runs dependency-free Node 22 code and uploads a seven-day review artifact. It has only `contents: read`, a five-minute deadline and serialized runs. It does not push commits, update `directory/catalog.json`, or deploy Pages. With the shipped configuration it makes **zero upstream requests** and uploads a status report only.

Both legacy providers are disabled. As independently checked on 2026-10-29, [FrightMaps terms §7](https://frightmaps.com/terms) prohibit scraping. Its §9.2 API provision addresses third-party AI platforms, not blanket reuse by a static directory. [Privacy §5](https://frightmaps.com/privacy) withholds precise free-home-display locations in AI discovery. No permission covering this app's automated fetching/storage/redistribution was established. The old project's owner-reported permission does not establish those rights. The inspected [Indy with Kids policy](https://indywithkids.com/privacy-policy/) contains no listing reuse grant. Neither source's photos or editorial text are copied into this release. Existing GlowRoute address references are retained; this work does not retroactively establish their licensing.

## Enable an approved feed

Ask the publisher for a public HTTPS JSON/CSV export, explicit field scope (including whether precise locations can be reused), attribution wording, schedule/rate/retention limits, correction/removal process and evidence of permission for **automated access, storage and redistribution**. Independently verify the grant and document your review. Do not commit confidential correspondence; use a publisher-approved public evidence page. Configure:

```json
{
  "id": "approved-provider",
  "name": "Approved provider",
  "enabled": true,
  "url": "https://publisher.org/approved-feed.json",
  "format": "json",
  "authorization": {
    "evidenceUrl": "https://publisher.org/glowroute-permission",
    "reviewedAt": "2026-10-29",
    "expiresAt": "2027-10-29",
    "reviewer": "Maintainer name",
    "fetch": true,
    "store": true,
    "redistribute": true
  }
}
```

The gate checks the configured evidence/rights/dates; software cannot authenticate the publisher's grant. A maintainer must verify it. Adjust the workflow frequency to the approved quota (currently one request per source per week). Up to ten sources, 15-second requests, 2 MB responses, no redirects, credentials, tokens, pagination, retry loops or detail-page crawls. HTML formats are deliberately inactive even if a flag is changed: new source-specific parser work needs authorization, fixtures, layout-change detection and review. `robots.txt` access alone would not grant redistribution rights. No React, Cheerio, Zod or other runtime dependencies were introduced.

JSON is an array or `{ "entries": [...] }`; CSV uses the same field names, quoting structured `sources`/`schedule` fields as JSON. Each record requires a stable string `id`, `name`, `holiday` (or legacy `season`), integer original `year` and either a full numbered `address` or a city-only `locality`/`town`. Optional `lat`/`lon` (legacy `lng`) are usable only with explicit `locationPrecision: "street"`. `locationPrecision: "city"` always strips coordinates and street addresses. Unknown accuracy stays unknown. Never geocode these feeds en masse.

Optional facts: `type`, `cost`, `access`, `scare`, `music`, `fm`, `parking`, `accessibility`, `viewingMinutes`, and `schedule: {startDate, endDate, timezone, hours:[{days:[0..6],open:"18:00",close:"22:00"}]}`. Sunday is 0; overnight close times belong to the opening day. Incomplete schedules remain unknown. Fetched dates do not confirm operation. Malformed, empty or failed feeds publish no candidate, retain the reviewed directory, fail the Action and upload a report. Duplicate provider IDs fail validation; exact addresses can group multiple source references with explicit conflict warnings. No nearby-property merge occurs.

## Review, don't auto-publish

Run `node scripts/fetch-feeds.mjs` locally or dispatch the Action. Download `candidate.json` and `report.json`. In GlowRoute open **Discover displays → Nearby search & filters → Load review snapshot**. Review season, location precision, attribution and conflicts. Selected rows pass through existing directory/project review; applying changes affects only your browser's project. Curated directory publication is still a separate maintainer-reviewed change to `directory/catalog.json` with authorization and seasonal checks. Unreviewed artifacts are never copied into public assets.

Legacy Explorer arrays can also be opened locally here. The audited 2026-10-22 snapshot contains 307 records: 167 Indy Christmas guide entries (original 2025 season), 140 city-only FrightMaps discoveries, and **zero coordinates**. Seven Indy entries also lack a numbered street address and remain unlocated. The importer accepts all 307 as review input (147 unlocated); none can seed a nearby tour without independently supplied/reviewed reliable locations. The snapshot is not redistributed in GlowRoute.

The optional **Load Explorer's older discoveries** button reads that existing JSON from the user's old GitHub repository on demand; the file is not bundled, precached or republished. For a newer manual copy and weekly duplicate-safe append, follow [Importing listings](../docs/IMPORTING-LISTINGS.md). Source seasons remain explicit, and a manual paste is not permission for scheduled harvesting.
