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
