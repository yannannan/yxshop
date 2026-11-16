# AI获客功能素材说明

2026-11-15，使用内置 image_gen 生成三张功能场景位图；不是实拍、当前产品截图或真实采集结果。
仅做WebP编码与响应式缩放，未用代码替代图片生成。原始PNG保留在Codex生成目录，部署使用本目录的WebP。
2026-11-16增加完整简体中文版：中文页面使用-zh位图，英文页面继续使用原英文位图，轮播与下方功能板块一致切换。平台品牌Facebook、YouTube、TikTok、WhatsApp保留官方写法；国内平台名称和全部界面说明使用中文。

| 功能（英文版） | 正式素材 | 响应式版本 |
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

## 简体中文版（2026-11-16）

用内置image_gen编辑对应英文位图进行文字本地化，保留画面、配色、布局与功能含义。仅做WebP编码和响应式缩放，未用代码绘制或覆盖翻译文字。

| 功能 | 正式素材 | 响应式版本 |
| --- | --- | --- |
| 关键词与多平台检索 | keyword-discovery-zh.webp | keyword-discovery-zh-small.webp |
| 数据分析与精度筛选 | precision-analysis-zh.webp | precision-analysis-zh-small.webp |
| 客户画像与线索管理 | lead-profiles-zh.webp | lead-profiles-zh-small.webp |

### 中文版最终编辑提示词（内置模式）

#### keyword-discovery-zh

编辑参考：`keyword-discovery.webp`

生成PNG：`C:\Users\Administrator\.codex\generated_images\01a16199-c23a-7443-8df4-a3163cfdc134\exec-e448de68-15a0-403e-b88b-4e4f6b984fc4.png`

```text
Use case: text-localization. Edit the provided image into a Simplified Chinese edition for the same website carousel. Preserve the exact 3:2 composition, monitor frame, perspective, background, bright ice-blue/white technology palette, cards, icons, photographs, spacing and feature meaning. Replace ALL English UI/campaign text with accurate, crisp, correctly spelled Simplified Chinese text. This is a localized sibling of the English artwork, not a redesign. Keep recognizable international platform brand names Facebook, YouTube, TikTok, WhatsApp and LinkedIn in their official Latin spelling if present; translate domestic platform names and all other interface text. Use a clean professional Chinese sans-serif font, allow minor font-size adjustment and natural Chinese reflow inside the existing text areas. No fake real contacts, no extra charts, no added features, no garbled text. Important: preserve visible concept/sample tags in Chinese so this stays an illustrative concept. Exact translations: "Yuxing AI" -> "宇星AI"; "Lead Prospecting" -> "智能获客"; "CONCEPT PREVIEW" -> "功能示意"; "KEYWORD DISCOVERY" -> "关键词与多平台检索"; subtitle -> "用行业关键词，发现国内与海外的潜在合作客户"; sidebar "Keyword Discovery" -> "关键词检索", "Prospect Results" -> "获客结果", "Saved Leads" -> "线索管理", "Settings" -> "设置"; search "Electric vehicles" -> "电动车"; "International" -> "国际海外", "China" -> "中国国内"; "Industry • Region • Channel" -> "行业 · 地区 · 渠道"; "Alibaba.com" -> "阿里国际站", "Douyin" -> "抖音", "Taobao" -> "淘宝", "JD.com" -> "京东"; "EV distributor" -> "电动车经销商", "Parts supplier" -> "零部件供应商", "Retail partner" -> "零售合作商"; every "SAMPLE" -> "示例". Translate any other incidental English interface words if present.
```

#### precision-analysis-zh

编辑参考：`precision-analysis.webp`

生成PNG：`C:\Users\Administrator\.codex\generated_images\01a16199-c23a-7443-8df4-a3163cfdc134\exec-578d94d4-11b4-4feb-8715-c569fb86d050.png`

```text
Use case: text-localization. Edit the provided image into a Simplified Chinese edition for the same website carousel. Preserve the exact 3:2 composition, monitor frame, perspective, background, bright ice-blue/white technology palette, cards, icons, photographs, spacing and feature meaning. Replace ALL English UI/campaign text with accurate, crisp, correctly spelled Simplified Chinese text. This is a localized sibling of the English artwork, not a redesign. Keep recognizable international platform brand names Facebook, YouTube, TikTok, WhatsApp and LinkedIn in their official Latin spelling if present; translate domestic platform names and all other interface text. Use a clean professional Chinese sans-serif font, allow minor font-size adjustment and natural Chinese reflow inside the existing text areas. No fake real contacts, no extra charts, no added features, no garbled text. Important: preserve visible concept/sample tags in Chinese so this stays an illustrative concept. Exact translations: "AI Prospecting" -> "AI智能获客"; "Enterprise Lead Discovery" -> "企业客户线索发现"; top navigation "Prospect" -> "获客检索", "Leads" -> "客户线索", "Lists" -> "线索列表", "Settings" -> "设置"; large heading "ANALYZE & FILTER" -> "数据分析与精度筛选"; "CONCEPT PREVIEW" -> "功能示意"; flow "Public platform business information" -> "公开平台商家信息"; "Filtered & organized business lead" -> "筛选整理客户线索"; "Search criteria" -> "检索条件"; "Keyword" -> "关键词"; "Ophthalmic equipment" -> "眼科设备"; "Region" -> "目标地区"; "International" -> "国际海外"; "Customer type" -> "客户类型"; "Distributor" -> "代理经销商"; button "Filter leads" -> "筛选线索"; all three repeated rows: "Business name" -> "账号名称", "Account ID" -> "账号ID", "Public bio" -> "主页介绍", "Contact fields" -> "联系字段"; "Review relevance" -> "相关性筛选"; "Industry match" -> "行业匹配", "Product interest" -> "产品意向", "Partner type" -> "合作类型", "Source platform" -> "来源平台"; every "SAMPLE" -> "示例"; footer "Review • Filter • Organize" -> "分析 · 筛选 · 整理". Translate every other incidental English UI label.
```

#### lead-profiles-zh

编辑参考：`lead-profiles.webp`

生成PNG：`C:\Users\Administrator\.codex\generated_images\01a16199-c23a-7443-8df4-a3163cfdc134\exec-0826a722-dce8-4ffa-9c47-845d1288637c.png`

```text
Use case: text-localization. Edit the provided image into a Simplified Chinese edition for the same website carousel. Preserve the exact 3:2 composition, monitor frame, perspective, background, bright ice-blue/white technology palette, cards, icons, photographs, spacing and feature meaning. Replace ALL English UI/campaign text with accurate, crisp, correctly spelled Simplified Chinese text. This is a localized sibling of the English artwork, not a redesign. Keep recognizable international platform brand names Facebook, YouTube, TikTok, WhatsApp and LinkedIn in their official Latin spelling if present; translate domestic platform names and all other interface text. Use a clean professional Chinese sans-serif font, allow minor font-size adjustment and natural Chinese reflow inside the existing text areas. No fake real contacts, no extra charts, no added features, no garbled text. Important: preserve visible concept/sample tags in Chinese so this stays an illustrative concept. Exact translations: brand "AI Prospecting" -> "AI智能获客"; top menu "Leads" -> "客户线索", "Profiles" -> "客户画像", "Review History" -> "管理记录", "AI Search" -> "AI检索"; main heading "LEADS & PROFILES" -> "客户画像与线索管理"; "CONCEPT PREVIEW" -> "功能示意"; subtitle -> "分类管理客户线索，了解客户背景，保留检索与跟进记录"; "Lead management" -> "线索管理"; description -> "按业务流程分类整理潜在客户"; "Filter" -> "筛选"; "Add lead" -> "添加线索"; columns "New" -> "新线索", "Qualified" -> "意向客户", "Follow-up" -> "待跟进"; example cards "EV distributor" -> "电动车经销商", "Equipment buyer" -> "设备采购商", "Retail partner" -> "零售合作商"; every "SAMPLE" -> "示例"; "Alibaba.com" -> "阿里国际站", "Douyin" -> "抖音"; "Partner profile" -> "客户画像"; "Industry" -> "所属行业", "EV & Charging" -> "电动车与充电设备"; "Market" -> "目标市场", "Southeast Asia" -> "东南亚"; "Channel" -> "渠道类型", "Distribution" -> "代理经销"; "Source" -> "线索来源"; "Activity timeline" -> "跟进记录"; "Keyword search" -> "关键词检索"; "Searched Electric vehicles" -> "已检索：电动车"; "Added to review" -> "加入待评估"; "Saved to lead review list" -> "已保存到线索评估列表"; "Follow-up planned" -> "安排跟进"; "Schedule follow-up and share customer context" -> "记录跟进计划与客户背景"; bottom "Search history" -> "检索记录", "Electric vehicles" -> "电动车", "Saved review history" -> "已保存管理记录". Translate any other English explanations into short natural Chinese.
```
