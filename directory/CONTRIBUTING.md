# Contributing public display listings to GlowRoute

Only publish residential locations when the display owner has given permission to publish the address, or the listing is clearly and currently advertised to visitors in a credible public source. In either case, attribute the original listing. Do not include residents' names or contacts unless they actively authorize disclosure. Honor corrections, takedown requests, and privacy concerns. Never extract third-party directories by circumventing access controls, mass scraping or bypassing licensing restrictions.

The directory is maintained manually in JSON. It is not a synchronized feed or an assertion that the listed homes are operating today.

## Catalog schema

The editor-maintained `catalog.json` uses `schemaVersion: 1` and `entries` records:

```json
{
  "id": "indy-halloween-01",
  "name": "Display name",
  "address": "123 Main St, Indianapolis, IN 46219",
  "holiday": "Halloween",
  "year": 2026,
  "sourceName": "Name of original public listing",
  "sourceUrl": "https://example.org/source",
  "reviewedAt": "2026-10-23",
  "verification": "source-listed",
  "notes": "Original listing; current operation unconfirmed"
}
```

Keep an entry's ID stable when correcting or rolling that listing forward; changes prevent reliable refreshing in the app. Do not reuse an ID for a different home. If retaining separate archived and current-year entries, each needs a unique ID. An entry with `verification: source-listed` is a source reference, **not owner confirmation**. Confirming a display's active dates is independent of whether its address is accurate.

Optional sourced fields in schema version 1:

| Field | Maximum length | Meaning |
| --- | --- | --- |
| `locality` | 100 | City/area for sorting; otherwise the app uses the address locality |
| `description` | 300 | Short factual public display description |
| `operatingDates` | 160 | Dates reported by the linked source, including any qualifications |
| `hours` | 160 | Hours reported by the linked source, including timezone/context if supplied |
| `notes` | 300 | Public editorial/source context; never a user's private notes |

All entries still require a public HTTPS `sourceUrl`. Do not invent optional values or infer hours/dates from a previous season. `reviewedAt` records when the maintainer reviewed the source, not when someone visited the display. Older years are shown as archives, future years as future references, and even current-year entries carry an operating-check reminder. Omitted fields remain absent/empty; no data migration is required.

## Seasonal review and corrections

Before each season, review the sources available for the listings you maintain. Roll a record into a new year only when a dated public announcement supports it. Retain an old-year reference as an archive when current operation is unknown; do not update its season simply because its source was reviewed recently.

When adding or updating a listing:

1. Check that the source publicly advertises the address or provides clear publication permission. No scraping workarounds or implied data partnerships.
2. Check the address/locality, holiday/year, duplicate addresses, and any dates/hours against the cited source. Keep public notes factual and brief.
3. Exclude resident/contact details and private annotations. Leave unconfirmed operation explicit.
4. Preserve stable IDs and review the app's source-change preview. Source updates must not replace a user's private notes, personal name, favorites or manual pins without the applicable explicit choice.
5. Run the Node tests and browser suite when changing directory behavior. For data-only edits, run the Node directory validation tests.

During an active season, prioritize reported errors and removal requests as maintainer availability allows. This is a review process, not a promise of live monitoring or a fixed response time.

For a removal request, use the listing's catalog ID from **Source notes & details**. The app's removal draft omits the address and source URL, so the resident does not need to republish an unwanted address. Issues and their notes remain public; never request private contact information in the issue. Review and remove an affected listing rather than treating a prior public source as permanent permission. Removing a catalog entry does not remotely erase independent local project copies already saved on users' devices.

## Submission process

A user may open a public GitHub issue via the app. Maintainers manually check source links, permissions, duplicate addresses, and date/relevance before merging a JSON update. GitHub issues are public: don't post personal phone numbers or email addresses, or a home address not intended for visitors. Suggesting a house does not automatically publish it.

Run `node --test tests/*.test.mjs` before committing. Only records whose source rights and permissions are clear should be merged. Third-party services (FrightMaps, ChristmasPrism, Indy with Kids) are not data partners in this beta.
