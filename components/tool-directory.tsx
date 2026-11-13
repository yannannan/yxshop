"use client";
import { useI18n } from '@/components/language-provider';


import Image from 'next/image';
import { useState } from 'react';
import { toolChargeLabels, toolPagePath, toolPriceSummary, type ToolService } from '../lib/tool-services';
import { paginate } from '../lib/homepage-display';
import { CatalogPagination } from './catalog-pagination';

const toolCardIcons: Record<string, string> = {
  'document-signature': 'document-signature', 'stamp-maker': 'stamp-maker', 'handprint-maker': 'handprint-maker',
  'video-extractor': 'video-extractor', 'image-processor': 'image-processor', 'c-drive-cleaner': 'c-drive-cleaner',
  'webmaster-tools': 'webmaster-tools', 'webmaster-analysis': 'webmaster-tools', 'webmaster': 'webmaster-tools',
  'site-analysis': 'webmaster-tools', 'site-analyzer': 'webmaster-tools', 'website-analysis': 'webmaster-tools',
};

export function ToolDirectory({ tools, loading = false, error = '', title = '让日常工作，更简单一点', pageSize = 6, page, moreHref = '/tools' }: { tools: ToolService[]; loading?: boolean; error?: string; title?: string; pageSize?: 6 | 12; page?: number; moreHref?: string | null }) {
  const { t } = useI18n();
  const [localPage, setLocalPage] = useState(1);
  const result = paginate(tools, page ?? localPage, pageSize);
  return <section className="tool-directory" aria-labelledby="tool-directory-title">
    <header className="tool-directory-heading"><div><span className="section-kicker">TOOLS & UTILITIES</span><h2 id="tool-directory-title">{t(title)}</h2><p>{t("清理、提取、签名与制作，从这里找到需要的工具。共 ")}{t(tools.length)}{t(" 个工具。")}</p></div>{moreHref && <a href={moreHref}>{t("更多工具 →")}</a>}</header>
    {/* 工具是独立操作页，使用浏览器原生导航，入口不等待客户端路由完成。 */}
    {loading ? <p className="tool-directory-empty" role="status">{t("正在读取工具…")}</p> : error ? <p className="tool-directory-empty" role="alert">{t(error)}</p> : tools.length ? <div className="tool-entry-grid">{result.items.map(tool => {
      const builtInIcon = Object.hasOwn(toolCardIcons, tool.slug) ? toolCardIcons[tool.slug] : '';
      const logo = builtInIcon ? `/tool-icons/${builtInIcon}.svg` : tool.logo || '/tool-icons/tool.svg';
      return <a className="tool-entry-card" data-tool-entry={tool.slug} href={toolPagePath(tool.slug)} key={tool.slug}>
      <div className="tool-entry-top"><div className="tool-entry-logo"><Image unoptimized src={logo} alt="" width={48} height={48} /></div><h3 title={t(tool.name)}>{t(tool.name)}</h3></div>
      <p title={tool.description ? t(tool.description) : undefined}>{tool.description ? t(tool.description) : t('查看工具介绍与使用方式。')}</p>
      <div className="tool-entry-bottom"><span className={`tool-charge-badge ${tool.chargeType}`}>{t(toolChargeLabels[tool.chargeType])}{t(tool.chargeType === 'points' ? ` · ${tool.pointsCost} 积分/次` : '')}{t(tool.chargeType === 'paid' ? ` · ${toolPriceSummary(tool)}` : '')}</span><span className="tool-entry-action"><span>{t(tool.entryConfigured ? '查看并使用' : '查看工具介绍 · 入口待配置')}</span><Image unoptimized src="/tool-icons/arrow-up-right.svg" alt="" width={15} height={15} /></span></div>
    </a>; })}</div> : <p className="tool-directory-empty">{t("暂无已启用的工具。")}</p>}
    {!loading && !error && <CatalogPagination page={result.page} totalPages={result.totalPages} onChange={page === undefined ? setLocalPage : undefined} href={page === undefined ? undefined : '/tools'} label={t("工具分页")} />}
  </section>;
}
