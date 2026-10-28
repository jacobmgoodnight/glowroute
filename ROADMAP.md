# GlowRoute roadmap

v1.5 focuses on correctness, resilient requests, a smaller planning surface and practical Live Drive use. These follow-ups are proposals, not shipped capabilities. Effort assumes one maintainer and includes tests/documentation.

| Priority / target | Improvement | User impact | Effort | Technical risk | Worth pursuing? |
| --- | --- | --- | --- | --- | --- |
| P1 · v1.6 | Stronger season labels, reviewed/last-updated details and source notes in directory rows; optional operating dates/hours only when sourced | High: fewer wasted outings | 1–3 days | Low–medium: schema/season semantics | Yes; keep older entries clearly historical and fields optional |
| P1 · v1.6 | Directory selection tools, sorting by locality/year and clearer included/excluded import feedback | High for larger lists | 2–3 days | Low | Yes; native controls, preserve personal metadata |
| P1 · v1.6 | Import review improvements: select/deselect all, explicit rejected-row diagnostics, preserve a reviewed preview when mode changes, personal metadata round-trip for stop-only exports | High for users bringing their own city lists | 2–4 days | Medium: legacy formats and duplicate policy | Yes; full project backups remain the reliable way to preserve all preferences today |
| P1 · v1.6 | Owner/public-source contribution checklist, corrections/takedowns and seasonal review cadence | High trust and privacy benefit | 1–2 days plus seasonal maintenance | Low technically; ongoing editorial work | Yes, with a realistic maintainer workload |
| P2 · v1.6 | Additional regional public catalogs with explicit permission/licensing and durable attribution | High in covered areas | 2–5 days per source plus rights review | Medium–high maintenance | Only after permission and freshness checks; no automatic scraping or implied partnerships |
| P2 · v1.6 | Display categories and public descriptions | Medium | 1–2 days | Low if optional and sourced | Yes when contributors provide reliable data; keep private notes separate |
| P2 · later | Repeat-road measurement with partial-segment matching and a dedicated reduced-backtracking search | Medium | 4–8 days | Medium–high: geometry and performance | Prototype against realistic routes first; do not claim a global optimum |
| P2 · later | Improve budget heuristics and explain exactly why each optional stop was excluded | Medium–high | 3–5 days | Medium: preferences, feasibility and runtime | Yes after collecting representative route fixtures |
| P2 · later | Accessibility review with Safari/VoiceOver and Android/TalkBack, physical-device Maps handoff, real outing feedback | High | 2–4 days plus access to devices | Low code risk; browser differences | Yes; automated Chromium tests are not a substitute |
| P2 · growth gate | Configurable service deployment, aggregate quota controls and an appropriate geocoder/router before large-scale promotion | High reliability value at scale | 3–7 days plus hosting decisions | Medium–high operational work | Necessary if usage outgrows demo policies; no reliable unlimited free SLA was established |
| P3 · later | Further extract DOM/live-drive orchestration from `app.js` along natural boundaries | Maintainer benefit | 2–4 days | Medium regression risk | Do incrementally when maintenance warrants it, with current real-module tests |
| P3 · conditional | Licensed optional images | Low–medium | 2–4 days plus moderation/storage policy | High ongoing rights, privacy and bandwidth cost | Defer until a sustainable source/permission policy exists |

No current plan for accounts, cloud profiles, hosted community ratings/databases, social feeds, AI recommendations, a framework/build migration or native turn-by-turn navigation. Keep local-only projects, GitHub Pages hosting and the MIT license.
