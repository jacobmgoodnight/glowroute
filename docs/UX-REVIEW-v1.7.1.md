# Map editing and next workflow priorities

Reviewed public product pages on **2026-11-03**. This is a documentation/website comparison, not hands-on testing of competitor native apps or proof of their routing quality, listing accuracy or accessibility.

## What the published experiences emphasize

| Product / primary source | Published behavior | Inference for GlowRoute |
| --- | --- | --- |
| [ChristmasPrism](https://www.christmasprism.com/) | Prominent map exploration and a short sequence: choose displays, order stops and share the plan. | Make the next planning action obvious. A longer feature list is not a substitute for a clear path from discovery to a drive. |
| [FrightMaps](https://frightmaps.com/) and its [routes page](https://frightmaps.com/routes) | Map discovery with distance/scare/admission filters; city routes connect stops to listings and navigation. | Keep discovery filters contextual and connect a selected display to its map location and route. Coverage claims do not justify copying listings or bypassing source permission. |
| [MyRouteOnline manual-edit guide](https://www.myrouteonline.com/user-guides/manually-change-route-plan-order) | An optimized result can be edited by selecting an address on the map to reorder or delete it. | A route map should offer actions on the selected stop, with clear consequences and a way to recover from a mistake. |

The final column contains design judgments, not claims that these competitors solve GlowRoute's exact use cases. Accounts, social features, contests, hosted ratings and a large public database are outside this change.

## v1.7.1 response

After optimizing, **Edit stops on map** or a numbered pin exposes **Move earlier**, **Move later**, **Remove from drive** and **Adjust map pin**. The popup identifies the display and its position. Removal keeps its saved record and personal feedback; a must-see removal confirms clearing its flag. **Undo last edit** reverses the latest removal or reorder. Pin correction has explicit **Save pin / Cancel** actions and retains the written address.

Start and Finish stay fixed. Other stops retain their relative order; manual edits do not claim a new optimum. Road geometry, estimates, navigation links and schedules refresh, with failures reported clearly. On mobile, a focused map provides **Back to itinerary**. Live Drive continues to use **Visited** and **Skip & reroute**; route-edit controls do not compete with those actions. No saved-data migration, backend or new runtime package is needed.

## What should follow

| Priority | Change | User impact | Effort | Technical risk | Decision |
| --- | --- | --- | --- | --- | --- |
| 1 | Group the existing interface into Discover, Plan and Drive, with a clear primary action and fewer simultaneous controls | High | 3–5 days | Medium: focus, navigation and interrupted state | Worth doing incrementally; retain saved projects and advanced controls |
| 2 | Link itinerary-row selection and map-pin selection in both directions | High | 1–2 days | Low–medium: scrolling and keyboard/mobile focus | Worth pursuing before new discovery features |
| 3 | Observe a few first-time users and passengers completing the basic outing workflow | High | 1–2 days plus access | Low | Validate labels and transitions before a broad visual redesign |
| Later | More public coverage or richer media | Coverage-dependent | Source-dependent | Rights, maintenance, privacy and data quality | Keep behind authorization and maintenance gates; not a shortcut to usability |

Effort includes regression testing and documentation for one maintainer. Automated browser results and publication status should be reported with the release; this review does not claim physical-device or competitor hands-on validation.
