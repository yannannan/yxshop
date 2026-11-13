/* eslint-disable @next/next/no-img-element -- Software images are uploaded by administrators. */
/* eslint-disable @next/next/no-html-link-for-pages -- Product download navigation uses native links. */
import { ArrowRightIcon, CheckIcon, ComputerDesktopIcon, MagnifyingGlassIcon, ShieldCheckIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { getI18n } from '../lib/i18n-server';
import { publicSoftware } from '../lib/software-release-service';
import { defaultSoftwarePage, softwareDownloadPath, softwareSize } from '../lib/software-release';
import { siteOrigin, toolPagePath, type ToolService } from '../lib/tool-services';
import { StorefrontHeader } from './storefront-header';
import { SoftwareShowcase } from './software-showcase';
import { SoftwareDownloadButton } from './software-download-button';

export async function DiskCleanerLanding({ tool }: { tool: ToolService }) {
  const { t, locale } = await getI18n(), { page, release, versions, downloadReady } = await publicSoftware(tool.id, tool.chargeType === 'free');
  const business = (zh: string, en: string) => locale === 'en' ? en || zh : zh;
  const headline = business(page.headline, page.headlineEn) || business(defaultSoftwarePage.headline, defaultSoftwarePage.headlineEn);
  const summary = business(page.summary, page.summaryEn) || business(defaultSoftwarePage.summary, defaultSoftwarePage.summaryEn);
  const features = (page.features.length ? page.features : defaultSoftwarePage.features).map(row => ({ title: business(row.title, row.titleEn), detail: business(row.detail, row.detailEn) }));
  const icons = [ComputerDesktopIcon, MagnifyingGlassIcon, SparklesIcon, ShieldCheckIcon];
  const interfaceDetails = [
    { image: 'overview', title: t('系统状态与清理进展，集中掌握。'), detail: t('系统与设备信息、C盘释放记录，以及各块磁盘的容量概况集中展示。'), points: [t('查看系统与设备摘要'), t('了解近期C盘释放记录'), t('从总览切换到磁盘分析')] },
    { image: 'disks', title: t('各块磁盘的使用情况，一眼可比。'), detail: t('用容量卡片和环形图，直观对比已用空间与剩余空间。'), points: [t('查看每块磁盘的总容量'), t('对比已用与剩余空间'), t('选择需要进一步分析的磁盘')] },
    { image: 'analysis', label: t('磁盘分析'), title: t('空间用在哪里，一眼看明白。'), detail: t('从整块磁盘到具体文件，用分类图表和列表梳理空间占用。'), points: [t('按空间分类与文件类型查看占用'), t('选择大文件阈值，定位需要关注的文件'), t('扫描结果可导出为 HTML 报告')] },
    { image: 'file-report', title: t('从文件类型，找到需要关注的大文件。'), detail: t('结合文件类型排行与大文件列表，进一步了解磁盘占用来源。'), points: [t('查看文件类型占用排行'), t('按阈值列出大文件'), t('核对文件路径、大小与修改时间')] },
    { image: 'cleanup', label: t('C盘清理'), title: t('先分析，再决定清理哪些。'), detail: t('临时文件、应用缓存与需要确认的项目分开展示，把整理的选择留给你。'), points: [t('先查看分析结果，再勾选清理项目'), t('区分可清理缓存与需要确认的内容'), t('查看项目路径，了解文件来自哪里')] },
    { image: 'residuals', label: t('残留清理'), title: t('整理安装与卸载后留下的痕迹。'), detail: t('扫描更新、安装和应用使用留下的残留项目，逐项确认后再处理。'), points: [t('残留项目默认不勾选，按需选择'), t('查看项目说明、占用大小与所在位置'), t('已选残留项目按软件提示移入回收站')] },
    { image: 'ai-mall', title: t('磁盘整理之外，服务一处直达。'), detail: t('在软件内浏览宇星脉通的数字服务与实用工具，也可切换到浏览器查看。'), points: [t('软件内浏览商城内容'), t('查找数字服务与实用工具'), t('支持在浏览器中打开')] },
    { image: 'ai-tools', title: t('常用工具入口，随时发现。'), detail: t('在工具服务中查看清理、视频提取、文件签名等工具介绍，按需进入对应服务。'), points: [t('查看工具简介与使用方式'), t('按需进入工具服务'), t('各工具详情独立展示')] },
  ].map(({ image, title, detail, points }) => ({ url: `/software/c-drive-cleaner/${image}.png`, title, detail, points })).filter(row => page.screenshots.some(shot => shot.url === row.url));
  const heroScreenshots = ['overview', 'cleanup', 'analysis'].map(name => defaultSoftwarePage.screenshots.find(shot => shot.url === `/software/c-drive-cleaner/${name}.png`)!).filter(Boolean);
  const schema = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: t('宇星磁盘管家'), applicationCategory: 'UtilitiesApplication', url: `${siteOrigin()}${toolPagePath(tool.slug)}`, description: summary,
    ...(release ? { softwareVersion: release.version, operatingSystem: release.systems, ...(downloadReady ? { downloadUrl: `${siteOrigin()}${softwareDownloadPath(release.id)}` } : {}) } : {}),
    ...(tool.chargeType === 'free' ? { offers: { '@type': 'Offer', price: 0, priceCurrency: 'CNY' } } : {}), publisher: { '@type': 'Organization', name: '宇星脉通' } };
  return <><StorefrontHeader channel="mall" /><div className="cleaner-site">
    <main>
      <section className="cleaner-hero"><div className="cleaner-hero-inner"><div className="cleaner-hero-copy"><span className="cleaner-eyebrow"><i />{t('宇星脉通 · Windows桌面工具')}</span><h1>{headline.split(/\r?\n/).map((line, index) => <span className={index === 0 ? 'cleaner-hero-title' : 'cleaner-hero-tagline'} key={index}>{line}</span>)}</h1><p>{summary}</p>
        <div className="cleaner-hero-actions"><SoftwareDownloadButton id={release?.id} name={release?.fileName} ready={downloadReady} /><a href="#features" className="cleaner-secondary">{t('了解产品')}<ArrowRightIcon aria-hidden="true" /></a></div>
        <div className="cleaner-release-meta">{release ? <><span>v{release.version}</span><i /><span>{softwareSize(release.fileSize)}</span><i /><span>{release.systems}</span></> : <span>{t('首个版本正在准备中，发布后即可下载。')}</span>}</div>
        <div className="cleaner-hero-badges">{[t('免登录下载'), t('Windows应用'), t('不扣商城积分')].map(label => <span key={label}><CheckIcon aria-hidden="true" />{label}</span>)}</div>
      </div><div className="cleaner-hero-visual">{heroScreenshots.length ? <SoftwareShowcase screenshots={heroScreenshots} variant="hero" /> : <DiskIllustration label={t('C盘空间整理')} />}
      </div>
      <div className="cleaner-product-strip"><span><MagnifyingGlassIcon aria-hidden="true" />{t('磁盘分析')}</span><span><SparklesIcon aria-hidden="true" />{t('C盘清理')}</span><span><ShieldCheckIcon aria-hidden="true" />{t('残留清理')}</span><span><ComputerDesktopIcon aria-hidden="true" />Windows EXE</span></div>
      </div></section>
      <section className="cleaner-section" id="features"><div className="cleaner-section-heading"><span>{t('产品功能')}</span><h2>{t('磁盘整理，从看清占用开始。')}</h2><p>{t('分析、查看、选择、清理，每一步都有依据。')}</p></div><div className="cleaner-feature-grid">{features.map((row, index) => { const Icon = icons[index % icons.length]; return <article key={index}><span className="cleaner-feature-icon"><Icon aria-hidden="true" /></span><h3>{row.title}</h3><p>{row.detail}</p></article>; })}</div></section>
      <section className="cleaner-preview-section" id="screenshots"><div className="cleaner-section-heading"><span>{t('界面预览')}</span><h2>{t('真实界面，提前了解。')}</h2><p>{t('从首页到清理项目，查看宇星磁盘管家的实际功能。')}</p></div>
        {page.screenshots.length ? <SoftwareShowcase screenshots={page.screenshots} details={interfaceDetails} /> : <div className="cleaner-preview-pending"><img src="/tool-logos/c-drive-cleaner-sky.svg" width="80" height="80" alt="" /><strong>{t('软件界面截图即将上线')}</strong><p>{t('产品截图将在这里展示。')}</p></div>}
      </section>
      <section className="cleaner-section cleaner-get-started"><div className="cleaner-section-heading"><span>{t('开始使用')}</span><h2>{t('三步，开始磁盘整理。')}</h2></div><div className="cleaner-steps">{[[t('获取安装包'), t('免费下载安装包，无需登录商城。')], [t('选择磁盘分析'), t('在软件中选择磁盘，查看空间分布与扫描结果。')], [t('确认后再清理'), t('查看项目说明与路径，勾选需要整理的项目。')]].map(([title, detail], index) => <article key={title}><b>0{index + 1}</b><div><h3>{title}</h3><p>{detail}</p></div></article>)}</div></section>
      <section className="cleaner-section cleaner-versions" id="versions"><div className="cleaner-section-heading cleaner-heading-inline"><div><span>{t('版本更新')}</span><h2>{t('每一次更新，都在这里。')}</h2></div><span className="cleaner-version-caption">{t('宇星磁盘管家')}</span></div>
        {versions.length ? <div className="cleaner-version-list">{versions.map(row => <article key={row.id}><div className="cleaner-version-label"><strong>v{row.version}</strong>{row.id === release?.id && <span>{t('当前版本')}</span>}<time dateTime={row.publishedAt}>{new Date(row.publishedAt).toLocaleDateString(locale, { timeZone: 'Asia/Shanghai' })}</time></div><div><p className="cleaner-system-note">{row.systems}</p><p className="cleaner-release-notes">{row.notes || t('本版本暂无补充更新说明。')}</p></div></article>)}</div> : <div className="cleaner-empty-release">{t('首个版本正在准备中，发布后即可下载。')}</div>}
      </section>
      <section className="cleaner-download-section" id="download"><div><span className="cleaner-eyebrow">{t('免费C盘清理工具')}</span><h2>{t('下一次整理，就从这里开始。')}</h2><p>{release ? `${t('当前版本')} v${release.version} · ${release.systems} · ${softwareSize(release.fileSize)}` : t('发布后，本页将提供最新版本安装包。')}</p><SoftwareDownloadButton id={release?.id} name={release?.fileName} ready={downloadReady} />
        {release && <details className="cleaner-file-details"><summary>{t('安装包信息与校验')}</summary><dl><div><dt>{t('文件名称')}</dt><dd>{release.fileName}</dd></div><div><dt>SHA256</dt><dd><code>{release.sha256}</code></dd></div></dl></details>}
      </div><div className="cleaner-download-mark" aria-hidden="true"><img src="/tool-logos/c-drive-cleaner-sky.svg" width="132" height="132" alt="" /></div></section>
      <section className="cleaner-section cleaner-faq"><div className="cleaner-section-heading"><h2>{t('你可能还想了解')}</h2></div>{[[t('下载需要登录或消耗积分吗？'), t('安装包免费提供，无需登录商城，也不消耗商城积分。软件内的账号与功能权益，以软件内说明为准。')], [t('支持哪些 Windows 系统？'), release?.systems || t('请以发布版本标注的支持系统为准。')], [t('网页可以直接清理电脑吗？'), t('这是桌面软件的介绍与下载页。需要下载并在 Windows 电脑上运行软件，网页不会直接清理你的电脑。')]].map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section>
    </main>
    <footer className="cleaner-footer"><a href="/">{t('宇星脉通')}</a><span>{t('免费C盘清理工具')}</span><a href="/tools">{t('返回工具服务')} ↗</a></footer>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />
  </div></>;
}
function DiskIllustration({ label }: { label: string }) {
  return <div className="cleaner-disk-art" role="img" aria-label={label}><div className="cleaner-orbit orbit-one" /><div className="cleaner-orbit orbit-two" /><span className="cleaner-art-spark spark-one">✦</span><span className="cleaner-art-spark spark-two">✦</span>
    <svg viewBox="0 0 440 370" aria-hidden="true"><defs><linearGradient id="cleaner-metal" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" /><stop offset="1" stopColor="#d8e8f3" /></linearGradient><linearGradient id="cleaner-sky" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#67c8ff" /><stop offset="1" stopColor="#1986c4" /></linearGradient><filter id="cleaner-shadow"><feDropShadow dx="0" dy="18" stdDeviation="18" floodColor="#2471a1" floodOpacity=".18" /></filter></defs><g filter="url(#cleaner-shadow)"><path d="M84 109Q84 89 106 85L319 50Q341 47 348 67L387 236Q392 260 366 266L143 314Q119 320 111 293Z" fill="#c3dbea" /><path d="M86 94Q84 74 106 70L319 35Q341 32 348 52L382 211Q387 235 361 241L138 289Q114 295 107 268Z" fill="url(#cleaner-metal)" stroke="#fff" strokeWidth="3" /><ellipse cx="231" cy="155" rx="94" ry="84" transform="rotate(-13 231 155)" fill="#f0f7fd" stroke="#c6dfef" strokeWidth="2" /><ellipse cx="231" cy="155" rx="67" ry="60" transform="rotate(-13 231 155)" fill="#fff" stroke="#d4e8f6" strokeWidth="9" /><circle cx="231" cy="155" r="24" fill="#d5e3ed" /><circle cx="231" cy="155" r="12" fill="#fff" /><path d="M291 153L320 232L221 230Z" fill="#bfd9ea" /><circle cx="319" cy="233" r="17" fill="#e9f3fc" stroke="#fff" strokeWidth="4" /><path d="M106 89L110 107M322 54L328 71M128 255L132 273M350 211L355 228" stroke="#a8c4d8" strokeWidth="5" strokeLinecap="round" /></g><g transform="translate(271 190) rotate(13)"><rect width="116" height="123" rx="27" fill="url(#cleaner-sky)" stroke="#fff" strokeWidth="6" /><path d="M72 27L46 64M32 61L61 75L57 100L20 82Z" fill="#fff" /><path d="M29 79L25 88M40 84L36 94M51 88L47 98" stroke="#218bc1" strokeWidth="2" /></g></svg><span className="cleaner-art-free">FREE</span>
  </div>;
}
