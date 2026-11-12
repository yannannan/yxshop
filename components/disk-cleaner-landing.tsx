/* eslint-disable @next/next/no-img-element -- Software images are uploaded by administrators. */
/* eslint-disable @next/next/no-html-link-for-pages -- Product download navigation uses native links. */
import { ArrowDownTrayIcon, ArrowRightIcon, CheckIcon, CircleStackIcon, ComputerDesktopIcon, GiftIcon, Squares2X2Icon, SparklesIcon } from '@heroicons/react/24/outline';
import { getI18n } from '../lib/i18n-server';
import { publicSoftware } from '../lib/software-release-service';
import { softwareDownloadPath, softwareSize } from '../lib/software-release';
import { siteOrigin, toolPagePath, type ToolService } from '../lib/tool-services';
import { LanguageSwitcher } from './language-switcher';
import { SoftwareShowcase } from './software-showcase';
import { SoftwareDownloadButton } from './software-download-button';

export async function DiskCleanerLanding({ tool }: { tool: ToolService }) {
  const { t, locale } = await getI18n(), { page, release, versions, downloadReady } = await publicSoftware(tool.id, tool.chargeType === 'free');
  const business = (zh: string, en: string) => locale === 'en' ? en || zh : zh;
  const headline = business(page.headline, page.headlineEn) || t('让 C 盘，轻松一点。');
  const summary = business(page.summary, page.summaryEn) || t('面向 Windows 电脑的免费 C 盘清理工具。了解产品功能，获取最新发布版本，让系统盘的日常整理更简单。');
  const features = page.features.length ? page.features.map(row => ({ title: business(row.title, row.titleEn), detail: business(row.detail, row.detailEn) })) : [
    { title: t('C盘空间整理'), detail: t('围绕系统盘空间整理，了解清理工具的功能与适用范围。') },
    { title: t('Windows桌面端'), detail: t('下载 EXE 安装包，在 Windows 电脑上使用。') },
    { title: t('免费获取'), detail: t('无需购买套餐，不消耗商城积分。') },
    { title: t('版本信息透明'), detail: t('版本、适用系统与更新说明，随每次发布清晰呈现。') },
  ];
  const icons = [CircleStackIcon, ComputerDesktopIcon, GiftIcon, Squares2X2Icon];
  const schema = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: t('免费C盘清理工具'), applicationCategory: 'UtilitiesApplication', url: `${siteOrigin()}${toolPagePath(tool.slug)}`, description: summary,
    ...(release ? { softwareVersion: release.version, operatingSystem: release.systems, ...(downloadReady ? { downloadUrl: `${siteOrigin()}${softwareDownloadPath(release.id)}` } : {}) } : {}),
    ...(tool.chargeType === 'free' ? { offers: { '@type': 'Offer', price: 0, priceCurrency: 'CNY' } } : {}), publisher: { '@type': 'Organization', name: '宇星脉通' } };
  return <div className="cleaner-site">
    <header className="cleaner-header"><a href="/tools/c-drive-cleaner.html" className="cleaner-brand"><img src="/tool-logos/c-drive-cleaner.svg" width="42" height="42" alt="" /><div><strong>{t('C盘清理工具')}</strong><small>{t('宇星脉通')}</small></div></a>
      <nav aria-label={t('产品导航')}><a href="#features">{t('产品功能')}</a><a href="#screenshots">{t('界面预览')}</a><a href="#versions">{t('版本更新')}</a></nav>
      <div className="cleaner-header-actions"><LanguageSwitcher /><a className="cleaner-nav-download" href="#download"><ArrowDownTrayIcon aria-hidden="true" />{t('免费下载')}</a></div>
    </header>
    <main>
      <section className="cleaner-hero"><div className="cleaner-hero-inner"><div className="cleaner-hero-copy"><span className="cleaner-eyebrow"><i />{t('宇星脉通 · 免费桌面工具')}</span><h1>{headline}</h1><p>{summary}</p>
        <div className="cleaner-hero-actions"><SoftwareDownloadButton id={release?.id} name={release?.fileName} ready={downloadReady} /><a href="#features" className="cleaner-secondary">{t('了解产品')}<ArrowRightIcon aria-hidden="true" /></a></div>
        <div className="cleaner-release-meta">{release ? <><span>v{release.version}</span><i /><span>{softwareSize(release.fileSize)}</span><i /><span>{release.systems}</span></> : <span>{t('首个版本正在准备中，发布后即可下载。')}</span>}</div>
        <div className="cleaner-hero-badges">{[t('免费使用'), t('Windows应用'), t('独立桌面工具')].map(label => <span key={label}><CheckIcon aria-hidden="true" />{label}</span>)}</div>
      </div><div className="cleaner-hero-visual">{page.screenshots[0] ? <figure className="cleaner-hero-screenshot"><div className="cleaner-window-bar"><span /><span /><span /><small>{t('免费C盘清理工具')}</small></div><img src={page.screenshots[0].url} alt={business(page.screenshots[0].caption, page.screenshots[0].captionEn) || t('软件界面')} /></figure> : <DiskIllustration label={t('C盘空间整理')} />}
        <span className="cleaner-floating-label"><SparklesIcon aria-hidden="true" />{t('给系统盘，留出更多空间')}</span>
      </div></div></section>
      <div className="cleaner-product-strip"><span><GiftIcon aria-hidden="true" />{t('免费获取')}</span><span><ComputerDesktopIcon aria-hidden="true" />Windows EXE</span><span><CircleStackIcon aria-hidden="true" />{t('专注C盘空间整理')}</span></div>
      <section className="cleaner-section" id="features"><div className="cleaner-section-heading"><span>PRODUCT FEATURES</span><h2>{t('从日常整理，找回轻松。')}</h2><p>{t('认识你的 C 盘清理工具。')}</p></div><div className="cleaner-feature-grid">{features.map((row, index) => { const Icon = icons[index % icons.length]; return <article key={index}><span className="cleaner-feature-icon"><Icon aria-hidden="true" /></span><h3>{row.title}</h3><p>{row.detail}</p></article>; })}</div></section>
      <section className="cleaner-preview-section" id="screenshots"><div className="cleaner-section-heading"><span>PRODUCT EXPERIENCE</span><h2>{t('好用，看得见。')}</h2><p>{t('了解产品界面，再开始使用。')}</p></div>
        {page.screenshots.length ? <SoftwareShowcase screenshots={page.screenshots} /> : <div className="cleaner-preview-pending"><img src="/tool-logos/c-drive-cleaner.svg" width="80" height="80" alt="" /><strong>{t('软件界面截图即将上线')}</strong><p>{t('产品截图将在这里展示。')}</p></div>}
      </section>
      <section className="cleaner-section cleaner-get-started"><div className="cleaner-section-heading"><span>GET STARTED</span><h2>{t('下载之后，开始整理。')}</h2></div><div className="cleaner-steps">{[[t('获取安装包'), t('下载当前发布的 Windows 版本。')], [t('打开桌面软件'), t('按安装包或软件窗口提示操作。')], [t('查看并使用功能'), t('根据软件内的实际功能完成 C 盘整理。')]].map(([title, detail], index) => <article key={title}><b>0{index + 1}</b><div><h3>{title}</h3><p>{detail}</p></div></article>)}</div></section>
      <section className="cleaner-section cleaner-versions" id="versions"><div className="cleaner-section-heading cleaner-heading-inline"><div><span>WHAT’S NEW</span><h2>{t('每一次更新，都在这里。')}</h2></div><span className="cleaner-version-caption">{t('版本更新')}</span></div>
        {versions.length ? <div className="cleaner-version-list">{versions.map(row => <article key={row.id}><div className="cleaner-version-label"><strong>v{row.version}</strong>{row.id === release?.id && <span>{t('当前版本')}</span>}<time dateTime={row.publishedAt}>{new Date(row.publishedAt).toLocaleDateString(locale, { timeZone: 'Asia/Shanghai' })}</time></div><div><p className="cleaner-system-note">{row.systems}</p><p className="cleaner-release-notes">{row.notes || t('本版本暂无补充更新说明。')}</p></div></article>)}</div> : <div className="cleaner-empty-release">{t('首个版本正在准备中，发布后即可下载。')}</div>}
      </section>
      <section className="cleaner-download-section" id="download"><div><span className="cleaner-eyebrow">{t('免费C盘清理工具')}</span><h2>{t('下一次整理，就从这里开始。')}</h2><p>{release ? `${t('当前版本')} v${release.version} · ${release.systems} · ${softwareSize(release.fileSize)}` : t('发布后，本页将提供最新版本安装包。')}</p><SoftwareDownloadButton id={release?.id} name={release?.fileName} ready={downloadReady} />
        {release && <details className="cleaner-file-details"><summary>{t('安装包信息与校验')}</summary><dl><div><dt>{t('文件名称')}</dt><dd>{release.fileName}</dd></div><div><dt>SHA256</dt><dd><code>{release.sha256}</code></dd></div></dl></details>}
      </div><div className="cleaner-download-mark" aria-hidden="true"><img src="/tool-logos/c-drive-cleaner.svg" width="132" height="132" alt="" /></div></section>
      <section className="cleaner-section cleaner-faq"><div className="cleaner-section-heading"><h2>{t('你可能还想了解')}</h2></div>{[[t('下载需要购买套餐吗？'), t('本工具免费提供，无需购买套餐，也不消耗商城积分。')], [t('支持哪些 Windows 系统？'), release?.systems || t('请以发布版本标注的支持系统为准。')], [t('网页可以直接清理电脑吗？'), t('这是桌面软件的介绍与下载页。需要下载并在 Windows 电脑上运行软件，网页不会直接清理你的电脑。')]].map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section>
    </main>
    <footer className="cleaner-footer"><a href="/">{t('宇星脉通')}</a><span>{t('免费C盘清理工具')}</span><a href="/tools">{t('返回工具服务')} ↗</a></footer>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />
  </div>;
}
function DiskIllustration({ label }: { label: string }) {
  return <div className="cleaner-disk-art" role="img" aria-label={label}><div className="cleaner-orbit orbit-one" /><div className="cleaner-orbit orbit-two" /><span className="cleaner-art-spark spark-one">✦</span><span className="cleaner-art-spark spark-two">✦</span>
    <svg viewBox="0 0 440 370" aria-hidden="true"><defs><linearGradient id="cleaner-metal" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" /><stop offset="1" stopColor="#d6e8e2" /></linearGradient><linearGradient id="cleaner-green" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#39da96" /><stop offset="1" stopColor="#0c955f" /></linearGradient><filter id="cleaner-shadow"><feDropShadow dx="0" dy="18" stdDeviation="18" floodColor="#13754c" floodOpacity=".18" /></filter></defs><g filter="url(#cleaner-shadow)"><path d="M84 109Q84 89 106 85L319 50Q341 47 348 67L387 236Q392 260 366 266L143 314Q119 320 111 293Z" fill="#b9d4ca" /><path d="M86 94Q84 74 106 70L319 35Q341 32 348 52L382 211Q387 235 361 241L138 289Q114 295 107 268Z" fill="url(#cleaner-metal)" stroke="#fff" strokeWidth="3" /><ellipse cx="231" cy="155" rx="94" ry="84" transform="rotate(-13 231 155)" fill="#eff7f3" stroke="#bed8ce" strokeWidth="2" /><ellipse cx="231" cy="155" rx="67" ry="60" transform="rotate(-13 231 155)" fill="#fff" stroke="#d2e7dd" strokeWidth="9" /><circle cx="231" cy="155" r="24" fill="#cfdfd7" /><circle cx="231" cy="155" r="12" fill="#fff" /><path d="M291 153L320 232L221 230Z" fill="#b6d1c5" /><circle cx="319" cy="233" r="17" fill="#e5f2eb" stroke="#fff" strokeWidth="4" /><path d="M106 89L110 107M322 54L328 71M128 255L132 273M350 211L355 228" stroke="#a0bbaf" strokeWidth="5" strokeLinecap="round" /></g><g transform="translate(271 190) rotate(13)"><rect width="116" height="123" rx="27" fill="url(#cleaner-green)" stroke="#fff" strokeWidth="6" /><path d="M72 27L46 64M32 61L61 75L57 100L20 82Z" fill="#fff" /><path d="M29 79L25 88M40 84L36 94M51 88L47 98" stroke="#1ab778" strokeWidth="2" /></g></svg><span className="cleaner-art-free">FREE</span>
  </div>;
}
