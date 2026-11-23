"use client";
import { useI18n } from '@/components/language-provider';


import Image from 'next/image';
import { useState } from 'react';
import { isWebsiteAnalysis, toolChargeLabels, toolPagePath, toolPriceSummary, type ToolService } from '../lib/tool-services';
import { paginate } from '../lib/homepage-display';
import { CatalogPagination } from './catalog-pagination';
import { ArrowUpRightIcon, SparklesIcon, DocumentTextIcon, FingerPrintIcon, CheckBadgeIcon, GlobeAltIcon, VideoCameraIcon, PhotoIcon, ComputerDesktopIcon, Squares2X2Icon, UserGroupIcon } from '@heroicons/react/24/outline';

const toolCardIcons: Record<string, string> = {
  'ai-leads': 'ai-leads', 'document-signature': 'document-signature', 'stamp-maker': 'stamp-maker', 'handprint-maker': 'handprint-maker',
  'video-extractor': 'video-extractor', 'image-processor': 'image-processor', 'c-drive-cleaner': 'c-drive-cleaner',
  'webmaster-tools': 'webmaster-tools', 'webmaster-analysis': 'webmaster-tools', 'webmaster': 'webmaster-tools',
  'site-analysis': 'webmaster-tools', 'site-analyzer': 'webmaster-tools', 'website-analysis': 'webmaster-tools',
};

const glassIcons = { 'ai-leads': SparklesIcon, 'document-signature': DocumentTextIcon, 'stamp-maker': CheckBadgeIcon, 'handprint-maker': FingerPrintIcon, 'video-extractor': VideoCameraIcon, 'image-processor': PhotoIcon, 'c-drive-cleaner': ComputerDesktopIcon, 'webmaster-tools': GlobeAltIcon };
export type PortalShortcut = { name: string; href: string; count: number };

export function ToolDirectory({ tools, loading = false, error = '', onRetry, title = '让日常工作，更简单一点', pageSize = 8, page, moreHref = '/tools', shortcuts = [], portal = false }: { tools: ToolService[]; loading?: boolean; error?: string; onRetry?: () => void; title?: string; pageSize?: 8 | 12; page?: number; moreHref?: string | null; shortcuts?: PortalShortcut[]; portal?: boolean }) {
  const { t } = useI18n();
  const [localPage, setLocalPage] = useState(1);
  const result = paginate(tools, page ?? localPage, pageSize);
  return <section className={`tool-directory${portal ? ' portal-directory' : ''}`} aria-labelledby="tool-directory-title">
    <header className="tool-directory-heading"><div><span className="section-kicker">TOOLS & UTILITIES</span><h2 id="tool-directory-title">{t(title)}</h2><p>{loading || error ? t('清理、提取、签名与制作，从这里找到需要的工具。') : <>{t("清理、提取、签名与制作，从这里找到需要的工具。共 ")}{t(tools.length)}{t(" 个工具。")}</>}</p></div>{moreHref && <a href={moreHref}>{t("更多工具 →")}</a>}</header>
    {/* 工具是独立操作页，使用浏览器原生导航，入口不等待客户端路由完成。 */}
    {loading ? <p className="tool-directory-empty" role="status">{t("正在读取工具…")}</p> : error ? <div className="tool-directory-empty" role="alert"><p>{t(error)}</p>{onRetry && <button type="button" className="account-secondary" onClick={onRetry}>{t('重试读取')}</button>}</div> : tools.length || shortcuts.length ? <div className="tool-entry-grid">{result.items.map(tool => {
      const builtInIcon = isWebsiteAnalysis(tool.slug, tool.name) ? 'webmaster-tools' : Object.hasOwn(toolCardIcons, tool.slug) ? toolCardIcons[tool.slug] : '';
      const logo = builtInIcon ? `/tool-icons/${builtInIcon}.svg` : tool.logo || '/tool-icons/tool.svg';
      const Icon = glassIcons[builtInIcon as keyof typeof glassIcons];
      return <a className="tool-entry-card" data-tool-entry={tool.slug === 'ai-leads' ? undefined : tool.slug} href={toolPagePath(tool.slug)} key={tool.slug}>
      <div className="tool-entry-top"><div className="tool-entry-logo">{Icon ? <Icon aria-hidden="true" strokeWidth={1.35} /> : <Image unoptimized src={logo} alt="" width={48} height={48} />}</div><h3 title={t(tool.name)}>{t(tool.name)}</h3></div>
      <p title={tool.description ? t(tool.description) : undefined}>{tool.description ? t(tool.description) : t('查看工具介绍与使用方式。')}</p>
      <div className="tool-entry-bottom"><span className={`tool-charge-badge ${tool.slug === 'ai-leads' ? 'preview' : tool.chargeType}`}>{t(tool.slug === 'ai-leads' ? '界面预览' : toolChargeLabels[tool.chargeType])}{t(tool.slug !== 'ai-leads' && tool.chargeType === 'points' ? ` · ${tool.pointsCost} 积分/次` : '')}{t(tool.slug !== 'ai-leads' && tool.chargeType === 'paid' ? ` · ${toolPriceSummary(tool)}` : '')}</span><span className="tool-entry-action"><span>{t(tool.entryConfigured ? '查看并使用' : '查看工具介绍 · 入口待配置')}</span><ArrowUpRightIcon aria-hidden="true" /></span></div>
    </a>; })}{shortcuts.map((shortcut, index) => { const Icon = index % 2 ? UserGroupIcon : Squares2X2Icon; return <a className="portal-shortcut" href={shortcut.href} key={shortcut.href}><div className="tool-entry-logo"><Icon aria-hidden="true" strokeWidth={1.35} /></div><h3>{t(shortcut.name)}</h3><span>{t(`共 ${shortcut.count} 件商品`)}</span><ArrowUpRightIcon className="portal-shortcut-arrow" aria-hidden="true" /></a>; })}</div> : <p className="tool-directory-empty">{t("暂无已启用的工具。")}</p>}
    {!loading && !error && <CatalogPagination page={result.page} totalPages={result.totalPages} onChange={page === undefined ? setLocalPage : undefined} href={page === undefined ? undefined : '/tools'} label={t("工具分页")} />}
  </section>;
}
