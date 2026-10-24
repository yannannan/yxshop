"use client";

import Image from 'next/image';
import { useState } from 'react';
import { toolChargeLabels, toolPagePath, toolPriceSummary, type ToolService } from '../lib/tool-services';
import { paginate } from '../lib/homepage-display';
import { CatalogPagination } from './catalog-pagination';

export function ToolDirectory({ tools, loading = false, error = '', title = '让日常工作，更简单一点', pageSize = 6, page, moreHref = '/tools' }: { tools: ToolService[]; loading?: boolean; error?: string; title?: string; pageSize?: 6 | 12; page?: number; moreHref?: string | null }) {
  const [localPage, setLocalPage] = useState(1);
  const result = paginate(tools, page ?? localPage, pageSize);
  return <section className="tool-directory" aria-labelledby="tool-directory-title">
    <header className="tool-directory-heading"><div><span className="section-kicker">TOOLS & UTILITIES</span><h2 id="tool-directory-title">{title}</h2><p>清理、提取、签名与制作，从这里找到需要的工具。共 {tools.length} 个工具。</p></div>{moreHref && <a href={moreHref}>更多工具 →</a>}</header>
    {/* 工具是独立操作页，使用浏览器原生导航，入口不等待客户端路由完成。 */}
    {loading ? <p className="tool-directory-empty" role="status">正在读取工具…</p> : error ? <p className="tool-directory-empty" role="alert">{error}</p> : tools.length ? <div className="tool-entry-grid">{result.items.map(tool => <a className="tool-entry-card" href={toolPagePath(tool.slug)} key={tool.id}>
      <div className="tool-entry-logo">{tool.logo ? <Image unoptimized src={tool.logo} alt="" width={72} height={72} /> : <span className="tool-logo-fallback" aria-hidden="true">{tool.name.slice(0, 1)}</span>}</div>
      <h3>{tool.name}</h3><p>{tool.description || '查看工具介绍与使用方式。'}</p>
      <span className={`tool-charge-badge ${tool.chargeType}`}>{toolChargeLabels[tool.chargeType]}{tool.chargeType === 'points' ? ` · ${tool.pointsCost} 积分/次` : ''}{tool.chargeType === 'paid' ? ` · ${toolPriceSummary(tool)}` : ''}</span>
      <div className="tool-entry-bottom"><span>{tool.entryConfigured ? '查看并使用' : '查看工具介绍 · 入口待配置'}</span><b aria-hidden="true">↗</b></div>
    </a>)}</div> : <p className="tool-directory-empty">暂无已启用的工具。</p>}
    {!loading && !error && <CatalogPagination page={result.page} totalPages={result.totalPages} onChange={page === undefined ? setLocalPage : undefined} href={page === undefined ? undefined : '/tools'} label="工具分页" />}
  </section>;
}
