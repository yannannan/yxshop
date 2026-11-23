# AI workspace UI assets

The 20 transparent PNG icons in `icons/` are rasterized at 96 × 96 from the installed `@heroicons/react/24/outline` package (Heroicons, MIT license). They are consumed at 16–25 CSS pixels. No custom SVG drawing is used.

Source and regeneration: `scripts/generate-ai-workspace-icons.mjs`.

The interface uses native editable content and a sandboxed HTML website preview; those are UI, not screenshot/image substitutes. Sample companies and `example.com` addresses are illustrative data. No real customer photographs or identities are used.

## Human agent portraits — 2026-11-23

`people/market-advisor.png`, `people/content-strategist.png`, `people/campaign-advisor.png` and `people/website-architect.png` are original fictional-person portraits generated with the built-in Image Gen tool. They do not depict staff members or real customers. The user supplied an agent-card screenshot as a conceptual reference, not as an identity to copy. The rejected robot imagery is not included in the project.

The project copies are 192px-wide PNGs with preserved transparency, approximately 49–54 KB each. They are displayed inside the scoped workspace sidebar. Full-resolution generated originals remain under `C:/Users/Administrator/.codex/generated_images/01a16199-c23a-7443-8df4-a3163cfdc134/`.

Prompt shared by all four portraits (built-in generation, transparent background):

> Use case: photorealistic-natural. Asset type: fictional HUMAN professional digital-assistant portrait for an enterprise AI agent card. A polished realistic studio photograph of ONE adult Chinese business professional, approachable and confident, natural human face, realistic skin and hair. Front three-quarter upper-body portrait, head to mid torso, shoulders and both edges entirely within frame, looking toward the camera, neat business wardrobe, very soft cool studio illumination. Restrained official enterprise aesthetic, navy/white palette. Transparent background, clean silhouette, no props, no furniture, no text, no logos, no robot, no helmet, no mechanical or synthetic face, no sci-fi costume, no cartoon, no illustration. Composition centered, generous crop-safe space above head.

Individual prompt additions and original outputs:

- `market-advisor`: “An adult woman around 32, shoulder-length straight dark hair, navy tailored blazer with ivory blouse; market expansion consultant.” Original: `exec-312efadc-a4c8-4524-b64e-0ddeeb2381cf.png`.
- `content-strategist`: “An adult man around 30, neat short dark hair, light blue shirt and navy business-casual blazer; content strategy consultant.” Original: `exec-02745a22-072c-465e-ae63-75688807718b.png`.
- `campaign-advisor`: “An adult woman around 35, dark hair loosely tied back, charcoal blazer and pale blue blouse; customer marketing advisor.” Original: `exec-2f8a1fa7-337e-4252-95f1-dac9c081b8f0.png`.
- `website-architect`: “An adult man around 36, neat short dark hair, thin dark eyeglasses, charcoal business-casual blazer and ivory shirt; website experience consultant.” Original: `exec-d1efd7fe-1516-4f53-957c-7eac9327daef.png`.
