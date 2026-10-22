import Image from 'next/image';
import Link from 'next/link';
import { toolChargeLabels, toolPagePath, toolPriceSummary, type ToolService } from '../lib/tool-services';

export function ToolDirectory({ tools, loading = false, error = '' }: { tools: ToolService[]; loading?: boolean; error?: string }) {
  return <section className="tool-directory" aria-labelledby="tool-directory-title">
    <header className="tool-directory-heading"><div><span className="section-kicker">TOOLS & UTILITIES</span><h2 id="tool-directory-title">让日常工作，更简单一点</h2><p>清理、提取、签名与制作，从这里找到需要的工具。</p></div><Link href="/tools">全部工具 →</Link></header>
    {loading ? <p className="tool-directory-empty" role="status">正在读取工具…</p> : error ? <p className="tool-directory-empty" role="alert">{error}</p> : tools.length ? <div className="tool-entry-grid">{tools.map(tool => <Link className="tool-entry-card" href={toolPagePath(tool.slug)} key={tool.id}>
      <div className="tool-entry-top">{tool.logo ? <Image unoptimized src={tool.logo} alt="" width={56} height={56} /> : <span className="tool-logo-fallback">{tool.name.slice(0, 1)}</span>}<span className={`tool-charge-badge ${tool.chargeType}`}>{toolChargeLabels[tool.chargeType]}{tool.chargeType === 'paid' ? ` · ${toolPriceSummary(tool)}` : ''}</span></div>
      <h3>{tool.name}</h3><p>{tool.description || '查看工具介绍与使用方式。'}</p><div className="tool-entry-bottom"><span>{tool.entryConfigured ? '查看并使用' : '查看工具介绍 · 入口待配置'}</span><b aria-hidden="true">↗</b></div>
    </Link>)}</div> : <p className="tool-directory-empty">暂无已启用的工具。</p>}
  </section>;
}
