'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- Tool entries use native navigation. */
/* eslint-disable @next/next/no-img-element -- Local WebP campaign assets ship with the deployment. */
import { useEffect, useState } from 'react';
import { useI18n } from './language-provider';
import { acquisitionPlatforms } from '../lib/ai-leads-design';

function FeatureImage({ name, alt, priority = false }: { name: string; alt: string; priority?: boolean }) {
  const { locale } = useI18n();
  const imageName = locale === 'en' ? name : name + '-zh';
  return <img src={'/media/ai-leads/' + imageName + '.webp'}
    srcSet={'/media/ai-leads/' + imageName + '-small.webp 900w, /media/ai-leads/' + imageName + '.webp 1536w'}
    sizes="(max-width: 720px) calc(100vw - 40px), (max-width: 1100px) 80vw, 50vw"
    width={1536} height={1024} alt={alt} loading={priority ? 'eager' : 'lazy'}
    decoding="async" fetchPriority={priority ? 'high' : undefined} />;
}

export function AiLeadsLanding() {
  const { locale } = useI18n();
  const [region, setRegion] = useState('all');
  const [slide, setSlide] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const tx = (zh: string, en: string) => locale === 'en' ? en : zh;
  const scenes = [
    { image: 'keyword-discovery', title: tx('关键词与多平台检索', 'Keywords & platform discovery'), description: tx('用产品或行业关键词，定义国内、海外与代理商获客方向。', 'Define domestic, international and distribution opportunities with a product or industry keyword.'), alt: tx('关键词检索功能示意：电动车关键词、国内海外范围及多个平台选择', 'Concept: electric vehicle keyword, domestic and international scopes, and platform selection') },
    { image: 'precision-analysis', title: tx('数据分析与精度筛选', 'Analysis & precise filtering'), description: tx('围绕目标行业与信息字段，筛选更相关的客户线索。', 'Review relevant leads through industry criteria and selected information fields.'), alt: tx('分析筛选功能示意：眼科设备检索条件、商家信息字段与相关性筛选', 'Concept: ophthalmic equipment search criteria, business information fields and relevance filters') },
    { image: 'lead-profiles', title: tx('客户画像与线索管理', 'Profiles & lead management'), description: tx('按分类和跟进状态组织线索，保留客户背景与检索记录。', 'Organize leads by category and status, with customer context and search history.'), alt: tx('线索管理功能示意：新线索、意向客户、待跟进分类和客户画像', 'Concept: new, qualified and follow-up lead categories with a customer profile') },
  ];

  useEffect(() => {
    if (!playing || hovered || focused) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      if (!motion.matches && !document.hidden) timer = setInterval(() => setSlide(current => (current + 1) % 3), 6000);
    };
    sync();
    motion.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      if (timer !== undefined) clearInterval(timer);
      motion.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [playing, hovered, focused]);

  const showSlide = (next: number) => { setSlide((next + scenes.length) % scenes.length); setPlaying(false); };
  const steps = [
    [tx('定义目标', 'Define a goal'), tx('输入关键词和营销方向。', 'Enter keywords and your marketing focus.')],
    [tx('选择范围', 'Set the scope'), tx('选择平台、数量与信息字段。', 'Choose platforms, volume and fields.')],
    [tx('分析筛选', 'Analyze & filter'), tx('按行业与相关性梳理线索。', 'Review industry context and relevance.')],
    [tx('分类跟进', 'Organize & follow up'), tx('结合客户画像与记录推进。', 'Work with profiles and review history.')],
  ];

  return <div className="al-site al-landing">
    <main>
      <section className="al-launch-hero"><div className="al-launch-grid al-container">
        <div className="al-hero-copy">
          <span className="al-launch-kicker">{tx('AI分析 · 多平台线索 · 国内与海外', 'AI INSIGHTS · MULTI-PLATFORM LEADS · LOCAL & GLOBAL')}</span>
          <h1>{tx('AI智能获客', 'AI Lead Intelligence')}<span>{tx('找对市场，', 'Find your market.')}<br />{tx('看见下一位客户。', 'Discover your next customer.')}</span></h1>
          <p>{tx('从产品关键词出发，把多平台检索、数据精度筛选、客户画像与线索管理连接起来。让每一步获客，都有明确方向。', 'Start with a product keyword. Connect platform discovery, focused filtering, customer profiles and lead management in one clear prospecting journey.')}</p>
          <div className="al-launch-actions"><a className="al-primary" href="/ai-leads/workspace">{tx('开始我的获客', 'Start prospecting')}<span aria-hidden="true">→</span></a><a className="al-launch-secondary" href="#markets">{tx('了解获客场景', 'Explore the use cases')}<span aria-hidden="true">↓</span></a></div>
          <p className="al-launch-preview">{tx('采集能力暂未开放 · 体验不扣积分', 'Collection is not enabled · Preview uses no points')}</p>
          <div className="al-launch-targets"><span>{tx('国际海外获客', 'International markets')}</span><span>{tx('中国国内获客', 'China market')}</span><span>{tx('代理商与渠道拓展', 'Agents & distributors')}</span></div>
        </div>
        <div className="al-launch-carousel" role="region" aria-roledescription={tx('轮播图', 'carousel')} aria-label={tx('获客功能示意', 'Prospecting feature concepts')}
          onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)}
          onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
          <div className="al-launch-carousel-meta"><span>{tx('功能场景示意', 'FEATURE CONCEPTS')}</span><span>0{slide + 1}<i> / 03</i></span></div>
          <div className="al-launch-slides" aria-live="off">{scenes.map((scene, index) => <figure key={scene.image} hidden={slide !== index} aria-hidden={slide !== index}>
            <FeatureImage name={scene.image} alt={scene.alt} priority={index === 0} />
            <figcaption><strong>{scene.title}</strong><p>{scene.description}</p></figcaption>
          </figure>)}</div>
          <div className="al-launch-carousel-controls"><div className="al-launch-dots">{scenes.map((scene, index) => <button type="button" key={scene.image} aria-label={scene.title} aria-pressed={slide === index} onClick={() => showSlide(index)}><span /></button>)}</div>
            <div><button type="button" aria-label={tx('上一张', 'Previous scene')} onClick={() => showSlide(slide - 1)}>←</button><button type="button" aria-label={tx('下一张', 'Next scene')} onClick={() => showSlide(slide + 1)}>→</button><button type="button" aria-pressed={playing} onClick={() => setPlaying(value => !value)}>{playing ? tx('暂停', 'Pause') : tx('播放', 'Play')}</button></div>
          </div>
          <p className="al-launch-image-note">{tx('AI生成的功能场景示意，非已上线界面或真实采集结果。', 'AI-generated feature concepts, not live screens or collected results.')}</p>
        </div>
      </div></section>

      <section className="al-launch-section al-container" id="markets" aria-labelledby="al-markets-title">
        <div className="al-launch-heading"><div><span className="al-launch-kicker">{tx('01 / 目标市场与平台', '01 / MARKETS & PLATFORMS')}</span><h2 id="al-markets-title">{tx('你的客户在哪里，', 'Where are your customers?')}<br />{tx('获客方向就从哪里开始。', 'Start your search there.')}</h2></div><p>{tx('连接内容、电商和企业渠道。围绕你的产品，寻找采购商、品牌商、代理商及经销合作机会。', 'Explore content, commerce and business channels for buyers, brands, agents and distribution partnerships relevant to your product.')}</p></div>
        <div className="al-launch-markets"><article><span className="al-launch-market-label">{tx('国际海外', 'INTERNATIONAL')}</span><h3>{tx('跨境业务，拓展全球渠道', 'Explore international channels')}</h3><p>{tx('面向海外社交内容、跨境电商与企业渠道，规划目标客户与代理商检索。', 'Plan customer and distributor discovery across international social, commerce and business channels.')}</p><div className="al-launch-tags">{['Facebook', 'YouTube', 'TikTok', 'WhatsApp', 'Alibaba.com', 'LinkedIn'].map(name => <span key={name}>{name}</span>)}</div></article>
          <article><span className="al-launch-market-label">{tx('中国国内', 'CHINA')}</span><h3>{tx('本土市场，聚焦相关商家', 'Find relevant local businesses')}</h3><p>{tx('面向国内内容平台、电商商家与产业链，明确行业、产品及渠道合作方向。', 'Define industry, product and partnership criteria across China’s content, commerce and supply-chain channels.')}</p><div className="al-launch-tags">{[tx('抖音', 'Douyin'), tx('淘宝', 'Taobao'), tx('京东', 'JD.com'), '1688', tx('BOSS直聘', 'BOSS Zhipin'), tx('企业官网 / 代理商', 'Business sites / agents')].map(name => <span key={name}>{name}</span>)}</div></article></div>
        <div className="al-launch-platforms"><div className="al-platform-heading"><div><h3>{tx('按业务组合你的平台', 'Build your platform mix')}</h3><p>{tx('以下为接入规划，当前可体验条件配置与示例管理。', 'Planned coverage. Criteria and sample management are available in the preview.')}</p></div><div className="al-segment" role="group" aria-label={tx('平台区域', 'Platform region')}>{[['all', tx('全部', 'All')], ['china', tx('国内', 'China')], ['global', tx('海外', 'International')]].map(([value, label]) => <button type="button" key={value} aria-pressed={region === value} onClick={() => setRegion(value)}>{label}</button>)}</div></div>
          <div className="al-platform-showcase">{acquisitionPlatforms.filter(p => region === 'all' || p.region === region || p.region === 'both').map(p => <article key={p.id}><strong>{locale === 'en' ? p.en : p.zh}</strong><small>{p.region === 'china' ? tx('国内场景', 'China market') : p.region === 'global' ? tx('海外场景', 'International') : tx('企业与代理商', 'Businesses & agents')}</small></article>)}</div>
        </div>
      </section>

      <section className="al-launch-band" id="capabilities"><div className="al-container al-launch-feature" aria-labelledby="al-analysis-title">
        <figure><FeatureImage name="precision-analysis" alt={scenes[1].alt} /><figcaption>{tx('数据分析与字段筛选 · 功能场景示意', 'Analysis & field filters · Feature concept')}</figcaption></figure>
        <div><span className="al-launch-kicker">{tx('02 / 关键词与数据精度', '02 / KEYWORDS & DATA RELEVANCE')}</span><h2 id="al-analysis-title">{tx('目标越明确，', 'Clearer goals.')}<br />{tx('线索越有方向。', 'More focused leads.')}</h2><p>{tx('输入眼科设备、电动车等产品关键词，补充营销方向，再通过平台、数量和字段条件，定义你真正需要的信息。', 'Enter a product keyword such as ophthalmic equipment or electric vehicles. Add your marketing focus, then choose platforms, volume and the fields you need.')}</p>
          <dl><div><dt>{tx('关键词检索', 'Keyword discovery')}</dt><dd>{tx('用产品、行业和合作方向界定客户范围。', 'Define the audience through product, industry and partnership context.')}</dd></div><div><dt>{tx('信息精度筛选', 'Information filters')}</dt><dd>{tx('头像、账号名称默认选中，可补充账号ID、主页介绍、手机号与邮箱字段。', 'Avatar and name are selected by default. Add account ID, bio, phone and email fields.')}</dd></div><div><dt>{tx('AI分析方向', 'AI analysis direction')}</dt><dd>{tx('结合行业相关性、来源平台与合作类型理解线索；字段是否可用以实际数据源为准。', 'Review industry relevance, platform sources and partnership types. Field availability depends on the eventual data source.')}</dd></div></dl>
          <a className="al-launch-text-link" href="/ai-leads/workspace">{tx('预览我的获客条件', 'Preview your prospecting criteria')} <span aria-hidden="true">→</span></a>
        </div>
      </div></section>

      <section className="al-launch-section al-container al-launch-feature al-launch-feature-reverse" aria-labelledby="al-profiles-title">
        <figure><FeatureImage name="lead-profiles" alt={scenes[2].alt} /><figcaption>{tx('客户画像与分类跟进 · 功能场景示意', 'Customer profiles & follow-up · Feature concept')}</figcaption></figure>
        <div><span className="al-launch-kicker">{tx('03 / 客户画像与线索管理', '03 / PROFILES & LEAD MANAGEMENT')}</span><h2 id="al-profiles-title">{tx('找到客户之后，', 'Discovery is the start.')}<br />{tx('让每条线索有处可去。', 'Give every lead a next step.')}</h2><p>{tx('不止看到一个账号。把客户背景、业务方向、分类状态和后续记录联系起来，让下一步行动更清晰。', 'See more than an account. Connect customer context, business interests, categories and review history to clarify your next step.')}</p>
          <dl><div><dt>{tx('客户画像', 'Customer profiles')}</dt><dd>{tx('结合行业、市场、来源与合作方向，理解客户背景。', 'Understand the industry, market, source and partnership context.')}</dd></div><div><dt>{tx('线索分类与跟进', 'Categories & follow-up')}</dt><dd>{tx('从新线索、意向客户到待跟进，按自己的业务节奏整理。', 'Organize new, qualified and follow-up leads around your workflow.')}</dd></div><div><dt>{tx('检索与管理记录', 'Search & review history')}</dt><dd>{tx('回看关键词与条件组合，逐步完善获客计划。当前演示记录仅在本次页面会话保留。', 'Review keywords and criteria to refine your plan. Demo history lasts only for the current page session.')}</dd></div></dl>
          <a className="al-launch-text-link" href="/ai-leads/workspace">{tx('体验线索管理', 'Explore lead management')} <span aria-hidden="true">→</span></a>
        </div>
      </section>

      <section className="al-launch-workflow" id="workflow"><div className="al-container"><div className="al-launch-heading"><div><span className="al-launch-kicker">{tx('04 / 开始你的获客计划', '04 / YOUR PROSPECTING PLAN')}</span><h2>{tx('四步，理清一条获客路径。', 'Four steps. One clear journey.')}</h2></div></div><div className="al-launch-steps">{steps.map(([title, detail], index) => <article key={title}><b>0{index + 1}</b><h3>{title}</h3><p>{detail}</p></article>)}</div></div></section>

      <section className="al-launch-faq al-container"><div><span className="al-launch-kicker">{tx('开始之前', 'BEFORE YOU START')}</span><h2>{tx('关于当前体验版', 'About this preview')}</h2></div><div>{[
        [tx('现在可以直接采集真实客户吗？', 'Can I collect real prospects now?'), tx('当前提供条件配置、示例线索、客户画像与记录的界面体验。真实采集和AI模型服务尚未接入，图中为功能场景示意。', 'Explore criteria, sample leads, profiles and history. Real collection and AI model services are not connected. Images illustrate planned feature scenarios.')],
        [tx('体验会扣积分或保存真实客户吗？', 'Does the preview use points or store real customers?'), tx('体验不扣积分，账户与宇星脉通共用。示例记录只保留在本次页面会话，刷新后清除。', 'The preview uses no points and shares your Yuxing Maitong account. Sample history stays in the current page session and clears on reload.')],
      ].map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">＋</span></summary><p>{answer}</p></details>)}</div></section>

      <section className="al-launch-final"><div className="al-container"><span className="al-launch-kicker">{tx('从你的业务开始', 'START WITH YOUR BUSINESS')}</span><h2>{tx('把下一个增长方向，变成清晰的获客计划。', 'Turn your next growth direction into a clear prospecting plan.')}</h2><p>{tx('选择市场、配置条件，先体验适合自己的获客工作台。', 'Choose a market, set your criteria and explore a workspace for your business.')}</p><a className="al-primary" href="/ai-leads/workspace">{tx('开始我的获客', 'Start prospecting')}<span aria-hidden="true">→</span></a><small>{tx('界面预览 · 不进行真实采集 · 不扣积分', 'UI preview · No real collection · No points used')}</small></div></section>
    </main>
    <footer className="al-launch-footer al-container"><a href="/">{tx('宇星脉通', 'Yuxing Maitong')}</a><span>{tx('AI智能获客 · 从关键词到客户线索', 'AI Lead Intelligence · From keywords to prospect context')}</span><a href="/tools">{tx('返回工具服务', 'Back to tools')} ↗</a></footer>
  </div>;
}
