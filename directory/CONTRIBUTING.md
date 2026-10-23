# Contributing public display listings to GlowRoute

Only publish residential locations when the display owner has given permission to publish the address, or the listing is clearly and currently advertised to visitors in a credible public source. In either case, attribute the original listing. Do not include residents' names or contacts unless they actively authorize disclosure. Honor corrections, takedown requests, and privacy concerns. Never extract third-party directories by circumventing access controls, mass scraping or bypassing licensing restrictions.

The current site is a prototype using manually maintained JSON, **not** a synchronized directory or an assertion that the listed homes are operating today.

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

Use a unique stable ID across years and revisions; changes in an existing entry's ID prevent reliable refreshing in the app. Do not reuse an ID for a different home. An entry with `verification: source-listed` is a source reference, **not owner confirmation**. Confirming a display's active dates is independent of whether its address is accurate.

## Submission process

A user may open a public GitHub issue via the app. Maintainers manually check source links, permissions, duplicate addresses, and date/relevance before merging a JSON update. GitHub issues are public: don't post personal phone numbers or email addresses, or a home address not intended for visitors. Suggesting a house does not automatically publish it.

Run `node --test tests/*.test.mjs` before committing. Only records whose source rights and permissions are clear should be merged. Third-party services (FrightMaps, ChristmasPrism, Indy with Kids) are not data partners in this beta.
