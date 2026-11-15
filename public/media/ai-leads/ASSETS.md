# AI获客功能素材说明

2026-11-15，使用内置 image_gen 生成三张功能场景位图；不是实拍、当前产品截图或真实采集结果。
仅做WebP编码与响应式缩放，未用代码替代图片生成。原始PNG保留在Codex生成目录，部署使用本目录的WebP。
页面中文/英文说明使用HTML，图片中的英文为概念画面的一部分。

| 功能 | 正式素材 | 响应式版本 |
| --- | --- | --- |
| 关键词与多平台检索 | keyword-discovery.webp | keyword-discovery-small.webp |
| 数据分析与精度筛选 | precision-analysis.webp | precision-analysis-small.webp |
| 客户画像与线索管理 | lead-profiles.webp | lead-profiles-small.webp |

assets.json记录尺寸、字节数与SHA256；图片均随项目发布，无远程热链。

## 最终生成提示词（内置模式）

### keyword-discovery

原始PNG：`C:\Users\Administrator\.codex\generated_images\01a16199-c23a-7443-8df4-a3163cfdc134\exec-88166912-ae5c-4202-8a94-5a59d5893829.png`

```text
Use case: ads-marketing / ui-mockup. Generate a polished raster product campaign visual for Yuxing AI lead prospecting landing page. Landscape 3:2 composition, very high quality physically rendered screen mockup, photograph-like materials, no flat/vector illustration. Bright sophisticated technology palette: porcelain white, ice blue, royal blue, subtle teal. The entire image is ONE large frontal desktop product screen, slightly elevated on a clean pale blue studio background, with realistic screen reflections and fine physical depth. Do not include people, generic city skylines, ports, globes, robots or floating decorative icons. Show a highly readable conceptual prospecting application. Main heading exactly "KEYWORD DISCOVERY". Top small label "CONCEPT PREVIEW". A large search field contains exactly "Electric vehicles". Region toggles "International" and "China". Underneath a neat grid of named channel tiles, text only without imitated official logos: "Facebook", "YouTube", "TikTok", "WhatsApp", "Alibaba.com", "Douyin", "Taobao", "JD.com", "1688". Small search criteria line "Industry • Region • Channel". Bottom a short example result list with generic business avatars, "EV distributor", "Parts supplier", "Retail partner", each marked "SAMPLE". The visual must specifically express using one industry keyword to discover potential business partners on domestic and overseas platforms. No invented performance percentages, no live scraping claims, no real personal contacts, no phone numbers or email addresses. Crisp legible restrained typography, professional enterprise SaaS campaign art direction. Fill most of frame with the product screen rather than tiny laptop in empty room. The image will be paired with Chinese/English HTML explanatory copy outside image. No marketing slogan.
```

### precision-analysis

原始PNG：`C:\Users\Administrator\.codex\generated_images\01a16199-c23a-7443-8df4-a3163cfdc134\exec-8be11a31-a414-4ce3-a617-73537f1a2070.png`

```text
Use case: ads-marketing / ui-mockup. Generate a premium landscape 3:2 raster product scene illustrating PRECISE LEAD FILTERING for a light blue enterprise AI prospecting website, physically realistic glass screen and porcelain-white panels on pale icy-blue studio background, blue and subtle teal accents. No vector illustration. A large frontal screen fills 90 percent of composition, legible interface, very restrained realistic reflections and dimensional frame. Header text exactly "ANALYZE & FILTER", small "CONCEPT PREVIEW". The screen has left panel "Search criteria", keyword "Ophthalmic equipment", region "International", customer type "Distributor". Middle shows structured sample business information rows with clean generic image avatars, "Business name", "Account ID", "Public bio", "Contact fields", each with checkmark controls. Right panel "Review relevance", a short readable stack of chips "Industry match", "Product interest", "Partner type", "Source platform", and two generic review cards marked "SAMPLE". Bottom small text "Review • Filter • Organize". This is a conceptual interface not a measured product report: no percentages, no large metrics, no real names, no personal contact details, no real data. Do not show generic dashboards, unrelated charts, office people, robot, globe or city. The story is transforming public platform business information into a filtered organized business lead. Clean strong hierarchy, believable premium SaaS product campaign material, soft daylight, sharp screen typography.
```

### lead-profiles

原始PNG：`C:\Users\Administrator\.codex\generated_images\01a16199-c23a-7443-8df4-a3163cfdc134\exec-4c56819b-28c1-44e2-8001-3aabea02b3e7.png`

```text
Use case: ads-marketing / ui-mockup. Create a premium 3:2 landscape raster product campaign image showing CUSTOMER PROFILES AND LEAD MANAGEMENT, matching an enterprise light-blue AI prospecting landing page. Photograph-like physically rendered large white product screen with subtle glass reflections, royal blue and teal interface accents, pale blue studio backdrop. Screen fills almost entire frame, frontal gentle perspective, no vector illustration, no office stock scene, no city, no globes, no decorative robots. Exact heading "LEADS & PROFILES", small "CONCEPT PREVIEW". Left of screen: a clean lead management board with three columns labelled exactly "New", "Qualified", "Follow-up". Generic cards "EV distributor", "Equipment buyer", "Retail partner", each with small "SAMPLE" tag, tiny neutral avatar photographs, source chips "Facebook", "Alibaba.com", "Douyin". Right of screen: a customer profile drawer titled "Partner profile" with a neutral company/avatar thumbnail, rows "Industry", "Market", "Channel", "Source", and a small activity timeline "Keyword search", "Added to review", "Follow-up planned". Bottom search history strip "Search history" and example query "Electric vehicles". Make it specifically express classification, customer context and saved review history in ONE coherent product composition. No numeric success claims, no real business/contact/person identities, no names or emails, no charts unrelated to CRM. High readability, generous white space INSIDE the interface, crisp realistic screen edges, restrained professional product marketing polish.
```
