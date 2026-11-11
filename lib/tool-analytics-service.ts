import { env } from '@/db/mysql-runtime';
import { toolEntryRows, type ToolRow } from './tool-entries';
import { analyticsSlug, analyticsStart, emptyToolMetrics, toolFeatures, type ToolAnalytics, type ToolAnalyticsRow } from './tool-analytics';

// All success sources use the exact operation keys used in the billing transaction.
// UNION rows are grouped by operation before rollup, so retries and dual result/ledger rows count once.
const moduleFromOperation = `CASE WHEN operation_id LIKE 'signature:handprint:%' THEN 'handprint' WHEN operation_id LIKE 'signature:create:%' THEN 'create' WHEN operation_id LIKE 'signature:sign:%' THEN 'sign' WHEN operation_id LIKE 'stamp:%' THEN 'make' WHEN operation_id LIKE 'video:%' THEN 'extract' WHEN operation_id LIKE 'site:%' THEN 'analyze' ELSE '' END`;
const sources: Record<string, string> = {
  document_signatures: "SELECT product_id,user_id,CONCAT('signature:create:',user_id,':',id) operation_id,'create' module_key,0 points_spent,created_at FROM document_signatures",
  document_handprints: "SELECT product_id,user_id,CONCAT('signature:handprint:',user_id,':',id) operation_id,'handprint' module_key,0 points_spent,created_at FROM document_handprints",
  signed_documents: "SELECT product_id,user_id,CONCAT('signature:sign:',user_id,':',id) operation_id,'sign' module_key,0 points_spent,created_at FROM signed_documents",
  image_processing_results: "SELECT product_id,user_id,CONCAT('image:',id) operation_id,action module_key,0 points_spent,created_at FROM image_processing_results",
  tool_generation_results: "SELECT product_id,user_id,CONCAT('stamp:',id) operation_id,'make' module_key,0 points_spent,created_at FROM tool_generation_results",
  video_extraction_tasks: "SELECT product_id,user_id,CONCAT('video:',id) operation_id,'extract' module_key,0 points_spent,updated_at created_at FROM video_extraction_tasks WHERE status='ready'",
  site_analysis_runs: "SELECT product_id,user_id,CONCAT('site:',id) operation_id,'analyze' module_key,0 points_spent,completed_at created_at FROM site_analysis_runs WHERE status IN ('completed','partial')",
  points_ledger: `SELECT product_id,user_id,operation_id,${moduleFromOperation} module_key,-delta points_spent,created_at FROM points_ledger WHERE kind='consume' AND delta<0 AND product_id IS NOT NULL`,
  tool_usage_events: `SELECT o.product_id,o.user_id,e.operation_id,${moduleFromOperation.replaceAll('operation_id', 'e.operation_id')} module_key,0 points_spent,e.created_at FROM tool_usage_events e JOIN orders o ON o.id=e.order_id`,
};
type Rollup = { tool_slug: string | null; module_key: string | null; uses: number; users: number; points: number; last_used: string };

export async function readToolAnalytics(period: string): Promise<ToolAnalytics> {
  const since = analyticsStart(period), warnings: string[] = [];
  const products = (await env.DB.prepare("SELECT * FROM products WHERE product_type='tool' ORDER BY sort_order,id").all<ToolRow>()).results;
  const entries = toolEntryRows(products, []);
  const names = [...Object.keys(sources), 'tool_activity_events'];
  const found = (await env.DB.prepare(`SELECT TABLE_NAME AS table_name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${names.map(() => '?').join(',')})`).bind(...names).all<{ table_name: string }>()).results;
  const available = new Set(found.map(row => row.table_name));
  const fragments = Object.entries(sources).filter(([table]) => available.has(table)).map(([, sql]) => sql);
  if (!available.has('points_ledger')) warnings.push('积分流水尚未初始化，消耗积分暂不可核验。');
  if (Object.keys(sources).some(table => !available.has(table))) warnings.push('部分工具记录表尚未初始化，仅统计已有数据源。');
  const tools: ToolAnalyticsRow[] = entries.map(entry => ({ ...emptyToolMetrics(), slug: entry.tool_slug, name: entry.name,
    modules: Object.entries(toolFeatures(entry.tool_slug)).map(([key, name]) => ({ ...emptyToolMetrics(), key, name })) }));
  const totals = emptyToolMetrics();
  if (fragments.length) {
    const grouped = `SELECT product_id,user_id,operation_id,MAX(module_key) module_key,MAX(points_spent) points_spent,MIN(created_at) created_at FROM (${fragments.join(' UNION ALL ')}) raw_events GROUP BY product_id,user_id,operation_id`;
    const attributed = `SELECT CASE WHEN p.tool_slug='document-signature' AND e.module_key='handprint' THEN 'handprint-maker' ELSE p.tool_slug END tool_slug,e.* FROM (${grouped}) e JOIN products p ON p.id=e.product_id AND p.product_type='tool'`;
    const result = (await env.DB.prepare(`SELECT a.tool_slug,a.module_key,COUNT(*) uses,COUNT(DISTINCT user_id) users,COALESCE(SUM(points_spent),0) points,MAX(created_at) last_used FROM (${attributed}) a${since ? ' WHERE created_at>=?' : ''} GROUP BY a.tool_slug,a.module_key WITH ROLLUP`).bind(...(since ? [since] : [])).all<Rollup>()).results;
    for (const row of result) {
      const tool = tools.find(item => item.slug === row.tool_slug);
      const destination = row.tool_slug === null ? totals : row.module_key === null ? tool : tool?.modules.find(item => item.key === row.module_key);
      let target = destination;
      if (!target && tool && row.module_key !== null) { const feature = { ...emptyToolMetrics(), key: row.module_key, name: row.module_key ? `其他功能（${row.module_key}）` : '其他功能' }; tool.modules.push(feature); target = feature; }
      if (target) Object.assign(target, { uses: Number(row.uses), users: Number(row.users), points: Number(row.points), lastUsed: row.last_used || '' });
    }
  }
  const clicksReady = available.has('tool_activity_events');
  if (clicksReady) {
    const clicks = (await env.DB.prepare(`SELECT tool_slug,module_key,event_type,COUNT(*) total FROM tool_activity_events${since ? ' WHERE created_at>=?' : ''} GROUP BY tool_slug,module_key,event_type`).bind(...(since ? [since] : [])).all<{ tool_slug: string; module_key: string; event_type: string; total: number }>()).results;
    for (const row of clicks) {
      const tool = tools.find(item => item.slug === analyticsSlug(row.tool_slug, row.module_key));
      if (!tool) continue;
      const key = row.event_type === 'entry' ? 'clicks' : row.event_type === 'view' ? 'views' : 'featureClicks';
      const count = Number(row.total); tool[key] += count; totals[key] += count;
      const feature = tool.modules.find(item => item.key === row.module_key); if (feature) feature[key] += count;
    }
  } else warnings.push('点击统计尚未启用，请执行15号增量SQL；历史点击无法追溯补录。');
  return { period, since, generatedAt: new Date().toISOString(), totals, tools, warnings, clicksReady };
}
