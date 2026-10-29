# Import Indy with Kids or FrightMaps listings

There are two different paths: load the older saved Explorer data, or paste newer visible listings. Neither automatically checks whether a home is operating.

## Use the existing Explorer discoveries

1. Open GlowRoute and choose your holiday/year drive.
2. Open **Discover displays → Browse → Load Explorer's older discoveries**.
3. Choose **Christmas / 2025** for the older Indy with Kids guide, or **Halloween / 2026** for the older FrightMaps references. The button reads the saved JSON in your Holiday Display Explorer GitHub repository only when pressed. It does not fetch the live guides and does not add anything automatically.
4. Select addresses and choose **Review selected listings**. To reuse an older same-holiday address in a newer drive, explicitly check **Archive · add only as unverified** in the review. Its original source year stays attached. Adding it does not confirm current operation.
5. Apply the reviewed changes. Review locations and current-season operation before planning a visit. Source-only/city-only FrightMaps records stay browsable but cannot be selected as route stops.

The audited historical file contained 307 discoveries, including 167 original-2025 Indy entries and 140 FrightMaps entries. These counts describe that saved file, not current coverage. Seven Indy references also lacked a numbered street address. The file has no coordinates: address stops need normal pin review/manual routing; radius discovery needs reliable pins. The public curated directory is unchanged.

If loading fails, open [the original JSON file](https://github.com/jacobmgoodnight/Holiday-Display-Explorer/blob/main/public/data/source-candidates.json), use **Download raw file**, then choose **Load review snapshot** under Nearby search & filters. Keep this import local; do not republish the old snapshot without confirmed rights.

## Paste newer listings, once or weekly

1. Choose **Discover displays → Paste newer website listings**, or **Bulk import / paste list**.
2. Next to the source you want, choose **Paste listings**. Open that source's link in another tab. Copy the **visible names and full street addresses** you are permitted to use. Include the guide's title/year if possible. Copying a group of listings or a full guide may work; review the result because layouts vary. Photos, article descriptions and hidden location data are not imported.
3. Return to GlowRoute and paste. Check **Original source link**, **Holiday on the listing**, and **Year on the listing**. A dated copied heading can fill the year. A mismatch between that heading and your chosen year blocks import until corrected. The date you copy a guide is not its season year. At inspection, the Indy Christmas guide was titled **2025**.
4. Choose **Preview addresses**. Check/edit display names and addresses, deselect unwanted rows, and review ignored lines. Indy cards with explicit Address fields support rural numbered roads and names such as Pass; descriptions are not used as names.
5. Keep **Add new displays and skip duplicates**, then choose **Add … selected displays**. You can repeat this next week. Same normalized addresses are skipped; new addresses are offered for review. Existing ratings, notes, favorites and approved pins remain intact. Missing listings are not deleted, and changes to existing names/hours/addresses are not silently applied. Check the original source before updating those existing records manually.

For a small list, this format is reliable:

```text
Example Family Lights — 123 Example Road, Example City, IN
Example Haunt — 456 Example Lane, Example City, IN
```

These are formatting examples, not display recommendations. Review up to 500 unique addresses; each project holds at most 70 records and a route at most 68 display stops. Use separate drives for different areas.

## FrightMaps location and access limits

Many FrightMaps discovery results contain only a name and city. That is insufficient for routing. Open an individual listing and use an explicitly published/permitted street address, if available, or obtain it from the display operator. Do not reconstruct an address from a display name, nearby landmarks or hidden coordinates. A pasted city-only list explains this limitation instead of inventing a stop.

Automated FrightMaps page fetching remains inactive. Its [terms §7](https://frightmaps.com/terms) prohibit scraping; manual paste is a user-operated local import, not authorization to automate fetching or publicly redistribute listings. Both providers' scheduled adapters remain disabled pending independent permission. Weekly manual paste does not change that. See [feed permissions](../feeds/README.md).

The old **Load website / source snapshot** control remains for compatibility. For the recognized Indy pages it loads **small saved samples** (19 Halloween 2026 / 12 Christmas 2025 addresses), not the full live guide. Use the steps above for the larger older file or newer pasted listings.
