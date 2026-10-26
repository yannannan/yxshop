# Design QA

## Current iteration — website analytics overview, 2026-10-25

- Selected target: first displayed SEO workspace image, `C:/Users/Administrator/.codex/generated_images/01a16199-c23a-7443-8df4-a3163cfdc134/exec-82ebd1f2-91f2-4b18-9789-ac4885493919.png`, inspected before implementation.
- Preserved composition: existing global header, white left workspace navigation, cream content background, orange selected state / main action, domain selector and right-hand analysis panels. New profile, metric, keyword, history and findings sections follow the subsequently approved functional requirements.
- Existing brand assets and Heroicons are reused; no new raster imagery was needed. Desktop uses a 244px sidebar; smaller screens use a horizontal navigation strip and stacked cards.
- Functional evidence: actual component SSR checks, request / ownership / duplicate / billing / queue / source parsing tests, production-handler rendering, CSS and source checks. No browser, application server, real database or user cloud storage was opened.
- Visual comparison final result: **blocked — pending user browser acceptance**, per the user's standing project instruction assigning local runtime / visual acceptance to the user. There is no implementation screenshot and no claim of pixel comparison or live engine verification.
- Deployment and acceptance: `docs/站长分析综合看板与部署.md`.

The entries below retain earlier iterations and do not override this current status.

## Current iteration — personal account center, 2026-10-25

- Selected visual target: the first displayed personal-center design, `C:/Users/Administrator/.codex/generated_images/01a16199-c23a-7443-8df4-a3163cfdc134/exec-26a6d6ac-8865-4e77-b75e-8c30191ae3b0.png`.
- Implemented structure: left account navigation, identity and remaining-points summary, recent tool / order rows, global avatar account dropdown; responsive horizontal account navigation on mobile.
- User refinement: points only; replace the top talent-entry link with AI lead generation and AI operations destinations. Existing talent application business remains available in the technical-services section.
- Evidence: source target inspected, real default-avatar asset generated, isolated ownership / save / identity-state checks and direct production-handler rendering performed. No browser or application preview server was started.
- Per the user's standing project instructions, local runtime and visual/browser acceptance belong to the user. No implementation screenshot exists, so a same-viewport source-versus-render comparison cannot be claimed.
- Visual comparison final result: **blocked — pending user browser acceptance**. This is not a failed source build or a claim that real business data was tested.
- Deployment and acceptance checklist: `docs/个人中心设计与部署.md`.

The sections below describe older technical-service iterations and do not override this current account-center status.

## Comparison target

- Source visual truth: the approved technical-service detail mock, `C:\Users\Administrator\.codex\generated_images\01a03be2-e2ca-73f2-932e-0964fdd0169f\exec-71ab7aa1-7efd-4660-b372-26a7bb2ce4bb.png`.
- Current issue evidence: the two user-supplied screenshots from 2026-09-11.
- This iteration has no implementation browser capture: the user explicitly prohibited browser access.

## Evidence and interaction checks

- The header navigation exposes `AI商城服务`, `上门技术服务`, and `我的订单`.
- The Banner-bottom channel switch has exactly one active channel; selecting “上门技术服务” replaces the digital-product catalogue with three service cards.
- Fixed-price cards show purchase wording and price/unit. The price-negotiated card shows “价格面议” and “沟通确认价格”.
- Service-detail routes render for fixed-price and price-negotiated services. The price-negotiated flow displays “确认服务价格”, not a false direct-payment step.
- “在线免费技术支持” opens the service-context chat UI.

## Findings

- Current visual draft uses three clearly scoped demo provider portraits from `public/technical-services/`; production must replace them with provider-uploaded, consented profile images after technical-talent onboarding exists.
- 2026-09-10: channel cards now only switch the visible business channel and retain the Banner in view. Top navigation intentionally scrolls to its destination.
- 2026-09-10: corrected header grid ownership, responsive navigation overflow, CTA sizing, and technical-service type scale. The desktop mall, technical channel, and price-negotiated detail route were recaptured after the change.
- 2026-09-11: cards now use the approved avatar/verification/skills/service-price hierarchy, an explicit blue online-support entry, and separate view-service / purchase entries. Detail now has a left technical-personnel archive and a right-side `服务与购买` first tab, followed by personnel, case, and credential tabs. Price amount and unit have separate layout elements.
- Visual regression comparison is pending user-provided test evidence because browser verification is intentionally disallowed.

## Required fidelity surfaces

- Fonts and typography: existing Arial / Microsoft YaHei stack is retained; primary service title, price, and action hierarchy are distinct and readable.
- Spacing and layout rhythm: two equal channel panels, a three-card desktop grid, rounded panels, and the information hierarchy match the approved direction.
- Colors and visual tokens: existing dark navy, orange, white, and muted blue tokens remain consistent with the source visual.
- Image quality and asset fidelity: the existing official logo and uploaded product images are retained. The three demo provider portraits are used consistently by cards and detail pages, and must later be replaced by authenticated provider uploads.
- Copy and content: delivery terms use “在线沟通” and “预约到指定地点”; pricing uses either a fixed unit price or “价格面议”.

## Implementation checklist

- [x] Top navigation and Banner-bottom channel selector are synchronized, with distinct scroll behavior.
- [x] Only the active business channel renders its catalogue.
- [x] Technical-service cards distinguish delivery method from pricing method.
- [x] Service detail and consultation UI are reachable.
- [ ] Add persisted technical-talent, service, order, and chat backend models before enabling real payment or message delivery.

## Follow-up polish

- Replace demo portraits with provider-uploaded profile portraits once the technical-talent onboarding model is available.
- Add a mobile visual regression capture after the responsive mobile design is finalized.

final result: blocked

## 2026-10-26 SEO overview adjustment

- Reference: the user's five screenshots ending in `5481fb80`, `f28a16c5`, `d84d255e`, `eec6409f` and `cbeddaa9`, and the stated changes to those screens.
- Implemented: larger type; full-URL selection without task creation; keyword purpose; dark workbench / progress / export with a distinct report divider; two-column label / value profile with Title, Keywords and Description; four responsive overview panels, scrollable keyword candidates and honest missing-data states.
- Both languages include profile guidance and analytics setup copy. Collected site text is retained. Font counts are suggestions, not truncation limits or search-engine guarantees.
- Traffic and geography currently show “not connected”. The expandable guide distinguishes DNS TXT / file ownership verification from visit collection by a future tracking script; no actual tracker or verification endpoint is exposed in this iteration.
- Code verification: 397 regressions and production build pass; changed-file ESLint and CSS syntax checks pass. Existing 20 unrelated TypeScript errors remain.
- Visual comparison: **blocked / pending user acceptance**. The standing user instruction prohibits opening browsers or starting preview / development services. No screenshot comparison, breakpoint rendering or real-database acceptance is claimed. The CSS defines desktop four cards, narrower two cards and small-screen one card, with profile columns stacking and tables scrolling.

final result for this iteration: blocked (visual verification only; code checks complete)

## 2026-10-26 Analysis conditions and report polish

- Target: improve the existing approved overview without changing collection, access or charging behavior. Rename the conditions heading to 分析条件 / Analysis settings and use 分析报告 / Analysis report below the summary.
- Implemented: navy conditions panel with a clear website-input group, orange primary action, checkbox engine controls and separated notes; grouped report identity, status, metadata, real progress and stage icons; five native report-section anchors; consistent profile, overview-card and table presentation.
- Existing full-address selection, explicit-submit behavior, bilingual content and honest missing-data states remain. No decorative chart or new data source was added. Mobile stacking, horizontal navigation, print styling and reduced-motion handling are defined.
- Visual comparison remains **blocked / pending user acceptance**, following the standing prohibition on browser verification and starting preview / development services. This entry does not claim rendered breakpoint or screenshot acceptance.
- Code verification: 397 regressions and production build pass; updated interface checks cover bilingual labels and all five anchor targets. Changed-file ESLint and CSS syntax pass. Primary action / filter-label color contrast is 4.75 / 4.89. The existing 20 unrelated TypeScript errors remain; no new diagnostics in the changed components.

final result for this polish: blocked (visual verification only; code checks complete)

## 2026-10-26 Site information screenshot refinement

- Reference: `codex-clipboard-55cc7e5c-dadb-4b2e-8267-ded846da83cc.png`, with the user's four requested corrections.
- Implemented: Site information / 站点基本信息 as the section title and navigation label; page metadata and site facts share one white surface with a subtle divider; no separate gray facts backplate. Metadata labels align across Title / Keywords / Description, length hints are quieter, and the inferred-industry note is inline.
- The full domain profile is open by default with a native collapsible control. Existing public domain / DNS fields, counts, raw content, missing-data states and safe external links remain. Responsive stacking and print pagination are defined.
- Verification: 55 targeted regressions pass (43 analytics, 6 language and 6 production-handler checks); production build, changed-file ESLint and CSS syntax pass. Existing 20 unrelated type errors remain.
- Visual verification is **blocked / pending user acceptance**, following the standing user instruction not to open browsers or start app / preview services. The supplied screenshot was inspected; no rendered comparison or visual acceptance is claimed.

final result for this refinement: blocked (visual verification only; code checks complete)

## 2026-10-26 Engine identity and scrollable report panels

- Reference: `codex-clipboard-aae5e205-7d26-4b98-a348-0973f94622aa.png` and the requested Google / Bing / DuckDuckGo / Yandex additions. Existing Baidu remains.
- All five engines use locally stored official favicons, names and domains across the form, report table and index-count list. Assets were validated as ICO files and confirmed in the production package; no visual asset acceptance is claimed.
- Each report panel has a prominent heading. The index-count list and country-share table have bounded 260px vertical scroll regions with keyboard focus. Country / traffic-share headers remain visible, and unavailable traffic / index data remains explicitly missing.
- The previous site-profile refinement and expanded domain archive remain included. Existing report anchors, raw data, collection limits, ownership and charging checks remain.
- Verification: 400 regressions and production build pass; changed-file ESLint and CSS syntax pass. Three new parser / rules / challenge tests cover the new engines. Existing 20 unrelated type errors remain.
- Visual comparison remains **blocked / pending user acceptance** under the standing instruction not to open browsers or start preview / app services. Public HTTP / robots checks do not constitute browser QA or successful live ranking acceptance.

final result for this addition: blocked (visual verification only; code checks complete)

## 2026-10-26 Analysis conditions screenshot refinement

- Reference: `codex-clipboard-728d5c4a-2f34-490a-aedf-4665457d641a.png`. The requested scope is the existing analysis conditions panel.
- Replaced the large dark editing surface and nested plate with a compact navy heading, white form and quiet footer. Website / scope columns share a width, and address / keyword inputs share their starting edge.
- Engine controls use equal-width pale-blue selected cards, existing local brand icons and native checkboxes. The actual selected count is translated in both languages. Container-width breakpoints define five, three, two and single-column layouts, with visible keyboard focus and reduced-motion support.
- Query guidance is one full-width note. Existing explicit-submit behavior, field descriptions, access warnings, charging rules and the separate dark report summary remain.
- Code verification: 58 analytics / language / production-handler checks and the production build pass. Changed-file ESLint and CSS syntax checks pass; relevant text color contrast ranges from 4.51 to 11.46. Existing 20 unrelated TypeScript diagnostics remain, with none in the changed components.
- Visual comparison is **blocked / pending user acceptance** under the standing user instruction not to open browsers or start app / preview services. No rendered breakpoint, screenshot comparison or visual acceptance is claimed.

final result for this refinement: blocked (visual verification only; code checks complete)

## 2026-10-26 Single-row analysis conditions

- Reference: `codex-clipboard-1b56c988-704d-4d6e-b51b-408f0dbfbbdb.png`. Merge the two input rows and place the page selector immediately after the site selector.
- Desktop order is site, page limit, address, priority keywords and Analyze. The keyword description remains below the row with its accessible association. Engine selection remains separate. Narrow panels reflow without changing the logical control order.
- Verification: 6 existing form / report checks, 12 language / production-handler checks, production build, component ESLint and CSS syntax pass. The existing 20 unrelated TypeScript diagnostics remain. No collection, access, pricing or database changes.
- Visual comparison remains **blocked / pending user acceptance** under the standing no-browser / no-preview instruction; no rendered breakpoint or screenshot acceptance is claimed.

final result for this layout adjustment: blocked (visual verification only; code checks complete)

## 2026-10-26 Overview grid and business keyword priority

- Reference: `codex-clipboard-d54790c1-989e-428c-b813-38ed86445f7e.png`. The four overview panels now use two desktop columns and two rows, retaining a single column on small screens.
- Keyword tags have a fixed 128px width, centered text, CSS ellipsis and a native full-text title. The actual full keyword remains available to assistive technology and the filtering callback; scroll and candidate totals remain.
- A shared local rule ranks observed candidates using explicit user / metadata sources, titles, H1s, descriptions and the existing inferred industry. Generic words and repeated body frequency receive less weight. New collection prioritizes before the existing 200-candidate cap; existing reports sort both tags and detail rows without changing stored reports or issuing queries.
- Verification: 49 analytics, 6 language and 8 production / development-module checks pass (63 total), including 3 new regressions for relevance, candidate retention and full-keyword interactions. Production build, changed-file ESLint and CSS syntax pass. The existing 20 unrelated TypeScript diagnostics remain.
- Visual comparison is **blocked / pending user acceptance** under the standing instruction not to open browsers or start app / preview services. No live collection, business database access, rendered breakpoint or screenshot acceptance is claimed.

final result for this overview refinement: blocked (visual verification only; code checks complete)

## 2026-10-26 Four-column overview

- Reference: `codex-clipboard-5d204ac4-5393-42c1-843d-03b9968344ad.png`. The latest request supersedes the two-by-two desktop layout: four panels now share one row. Below 1100px they use two columns, and below 480px one column; print retains two columns.
- Business keyword priority, fixed-width centered tags, ellipsis, full-text title and filtering remain.
- CSS syntax, production build and 6 production-handler checks pass. Visual comparison is **blocked / pending user acceptance** under the standing no-browser / no-preview instruction; no rendered comparison is claimed.

final result for this column change: blocked (visual verification only; code checks complete)

## 2026-10-26 Site management and unique verification / tracking script

- Reference: `codex-clipboard-53ae1382-90c6-421c-842f-9135a166b6ea.png`. Site management is now the first sidebar entry and default view. It has a dedicated add-site form, status cards, a per-site installation panel, copy / verify actions and inline deletion confirmation. The previous analysis form is shown only in the overview.
- New analysis requires an owned, active, verified site in both the interface and API. Each site receives its own script for server-side installation verification and anonymous visits. Deletion retains reports and events, stops new work and invalidates the script; re-adding rotates the token and requires verification again.
- Existing navy / orange colors, white cards, responsive columns, form labels, native controls, status / error announcements and both languages are retained. Traffic shows real last-30-day session shares and PV. Country data is explicitly unknown until a geolocation source is connected; historical reports and search-index missing-data states remain honest.
- Code verification: 417 regressions and production build pass, including the complete bilingual management interaction, ownership / lifecycle / race checks, real development module loading and standalone production tracking-script execution. Changed-file ESLint and CSS parsing pass. Existing 20 unrelated TypeScript diagnostics remain.
- Visual comparison and real-site installation are **blocked / pending user acceptance** under the standing instruction not to open browsers, start app / preview services or connect to the business database. No rendered screenshot, breakpoint or live installation acceptance is claimed.

final result for this feature: blocked (visual / live integration verification only; code checks complete)
