import { createHash, randomUUID } from 'node:crypto';
import { env } from '@/db/mysql-runtime';
import { getVerifiedSessionPhone } from '@/db/setup';
import { consumePoints, lockPointsUser, pointsBalance, PointsError } from './points-service';
import { usableToolOrder, type ToolOrderAccess } from './tool-entitlements';
import { analysisOptions, compareReports, SiteAnalysisError, type AnalysisSite, type SiteReport, type SiteRun } from './site-analysis';
import { normalizeSite } from './site-analysis-network';
import { collectSiteReport } from './site-analysis-collector';
import { listAnalysisSites, requireVerifiedSite } from './site-management-service';
import { isWebsiteAnalysis } from './tool-services';
export { siteAnalysisSlugs } from './tool-services';

type Tool = { id: number; name: string; tool_slug: string; tool_charge_type: string; tool_points_cost: number };
type RunRow = { id: string; site_id: string; user_id: number; product_id: number; host: string; source_url: string; request_hash: string; options_json: string; billing_mode: string; points_cost: number; status: SiteRun['status']; progress: number; stage: string; attempts: number; claim_token: string; lease_until: string; draft_json: string; error_message: string; charged: number; points_spent: number; created_at: string; updated_at: string; completed_at: string };
const validId = (id: unknown): id is string => typeof id === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
export const isSiteAnalysisTool = (tool: { slug?: string; tool_slug?: string; name: string }) => isWebsiteAnalysis(tool.slug || tool.tool_slug, tool.name);
function publicRun(row: RunRow, includeReport = true): SiteRun {
  return { id: row.id, siteId: row.site_id, host: row.host, status: row.status, progress: Number(row.progress), stage: row.stage, error: row.error_message, createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at, charged: Boolean(row.charged), pointsSpent: Number(row.points_spent), report: includeReport && row.draft_json ? JSON.parse(row.draft_json) : null };
}
export async function siteAnalysisUser(request: Request) {
  let phone: string | null;
  try { phone = getVerifiedSessionPhone(request); } catch (error) { if (error instanceof URIError) return null; throw error; }
  if (!phone) return null;
  return env.DB.prepare("SELECT id FROM users WHERE phone=? AND status='active'").bind(phone).first<{ id: number }>();
}
export async function siteAnalysisTool(id: number) {
  if (!Number.isSafeInteger(id) || id < 1) throw new SiteAnalysisError('站长工具编号不正确');
  const tool = await env.DB.prepare("SELECT id,name,tool_slug,tool_charge_type,tool_points_cost FROM products WHERE id=? AND product_type='tool' AND status='active'").bind(id).first<Tool>();
  if (!tool || !isSiteAnalysisTool(tool)) throw new SiteAnalysisError('站长工具不存在或已停用', 404);
  return tool;
}
async function access(userId: number, tool: Tool) {
  const orders = ['points','paid'].includes(tool.tool_charge_type) ? (await env.DB.prepare("SELECT id,tool_billing_cycle,tool_paid_at,tool_uses_remaining FROM orders WHERE user_id=? AND product_id=? AND status IN ('paid','pending_delivery','delivered') ORDER BY created_at,id").bind(userId, tool.id).all<ToolOrderAccess>()).results.filter(o => usableToolOrder(o)) : [];
  const balance = tool.tool_charge_type === 'points' ? await pointsBalance(userId) : null;
  return { chargeType: tool.tool_charge_type, pointsCost: Number(tool.tool_points_cost), balance, hasMembership: orders.length > 0, canAnalyze: tool.tool_charge_type === 'free' || orders.length > 0 || tool.tool_charge_type === 'points' && Number(tool.tool_points_cost) > 0 && balance !== null && balance >= Number(tool.tool_points_cost) };
}
export async function analysisWorkspace(userId: number, tool: Tool, requested = 1, siteId = '') {
  if (siteId && !validId(siteId)) throw new SiteAnalysisError('站点编号不正确');
  const sites: AnalysisSite[] = await listAnalysisSites(userId);
  const clause = siteId ? ' AND site_id=?' : '', args = siteId ? [userId, tool.id, siteId] : [userId, tool.id];
  const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM site_analysis_runs WHERE user_id=? AND product_id=?${clause}`).bind(...args).first<{ total: number }>();
  const total = Number(count?.total || 0), page = Math.max(1, Math.min(Math.ceil(total / 10) || 1, Math.floor(requested) || 1));
  const history = (await env.DB.prepare(`SELECT * FROM site_analysis_runs WHERE user_id=? AND product_id=?${clause} ORDER BY created_at DESC,id DESC LIMIT 10 OFFSET ?`).bind(...args, (page - 1) * 10).all<RunRow>()).results;
  const worker = await env.DB.prepare('SELECT id FROM site_analysis_workers WHERE heartbeat_at>=? LIMIT 1').bind(new Date(Date.now() - 60000).toISOString()).first();
  return { authenticated: true, sites, history: history.map(r => publicRun(r, false)), page, total, workerReady: Boolean(worker) || process.env.NODE_ENV !== 'production', access: await access(userId, tool) };
}
export async function ownedAnalysisRun(userId: number, id: string, toolId: number) {
  if (!validId(id)) throw new SiteAnalysisError('分析记录编号不正确');
  const row = await env.DB.prepare('SELECT * FROM site_analysis_runs WHERE id=? AND user_id=? AND product_id=?').bind(id, userId, toolId).first<RunRow>();
  if (!row) throw new SiteAnalysisError('分析记录不存在或不属于当前账号', 404);
  if (row.status === 'queued' && process.env.NODE_ENV !== 'production') startLocalAnalysis();
  const run = publicRun(row);
  if (run.report) {
    const annotations = (await env.DB.prepare('SELECT issue_key,state FROM site_analysis_issue_actions WHERE run_id=? AND user_id=?').bind(id, userId).all<{ issue_key: string; state: 'pending' | 'resolved' | 'ignored' }>()).results;
    for (const issue of run.report.issues) issue.state = annotations.find(a => a.issue_key === digest(`${issue.code}\0${issue.url}`))?.state || 'pending';
  }
  return run;
}
export async function updateAnalysisIssue(userId: number, toolId: number, body: Record<string, unknown>) {
  const run = await ownedAnalysisRun(userId, String(body.run || ''), toolId);
  if (!['completed','partial'].includes(run.status) || !run.report) throw new SiteAnalysisError('报告完成后才能标记事项', 409);
  const issue = run.report.issues.find(issue => issue.code === body.code && issue.url === body.url);
  if (!issue || !['pending','resolved','ignored'].includes(String(body.state))) throw new SiteAnalysisError('事项或处理状态不正确');
  await env.DB.prepare('INSERT INTO site_analysis_issue_actions (run_id,user_id,issue_key,state,updated_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE state=VALUES(state),updated_at=VALUES(updated_at)').bind(run.id, userId, digest(`${issue.code}\0${issue.url}`), body.state, now()).run();
  return ownedAnalysisRun(userId, run.id, toolId);
}
export async function queueAnalysis(userId: number, tool: Tool, body: Record<string, unknown>) {
  if (!validId(body.id)) throw new SiteAnalysisError('分析任务编号不正确');
  const site = normalizeSite(body.domain), options = analysisOptions(body.options), hash = digest(JSON.stringify({ site, options, product: tool.id }));
  const existing = await env.DB.prepare('SELECT * FROM site_analysis_runs WHERE id=? AND user_id=? AND product_id=?').bind(body.id, userId, tool.id).first<RunRow>();
  if (existing) { if (existing.request_hash !== hash) throw new SiteAnalysisError('任务编号与分析条件不匹配', 409); return publicRun(existing); }
  const rights = await access(userId, tool);
  if (!rights.canAnalyze) throw new SiteAnalysisError(tool.tool_charge_type === 'pending' ? '收费方式待确认，暂未开放分析' : tool.tool_charge_type === 'points' ? '积分不足，请充值后分析' : '暂无有效套餐，请购买后分析', tool.tool_charge_type === 'pending' ? 409 : 402);
  const run = await env.DB.transaction(async db => {
    await lockPointsUser(db, userId);
    const duplicate = await db.prepare('SELECT * FROM site_analysis_runs WHERE id=? FOR UPDATE').bind(body.id).first<RunRow>();
    if (duplicate) { if (Number(duplicate.user_id) !== userId || duplicate.request_hash !== hash) throw new SiteAnalysisError('任务编号与分析条件不匹配', 409); return publicRun(duplicate); }
    const active = (await db.prepare("SELECT * FROM site_analysis_runs WHERE user_id=? AND status IN ('queued','running') ORDER BY created_at").bind(userId).all<RunRow>()).results;
    const same = active.find(r => r.request_hash === hash); if (same) return publicRun(same);
    if (active.length >= 2) throw new SiteAnalysisError('已有分析正在进行，请完成后再试', 429);
    const recent = await db.prepare('SELECT COUNT(*) AS total FROM site_analysis_runs WHERE user_id=? AND created_at>=?').bind(userId, new Date(Date.now() - 3600000).toISOString()).first<{ total: number }>();
    if (Number(recent?.total || 0) >= 20) throw new SiteAnalysisError('本小时分析次数较多，请稍后再试', 429);
    const record = await requireVerifiedSite(db, userId, site.host);
    const timestamp = now();
    await db.prepare("INSERT INTO site_analysis_runs (id,site_id,user_id,product_id,host,source_url,request_hash,options_json,billing_mode,points_cost,status,progress,stage,attempts,claim_token,lease_until,draft_json,error_message,charged,points_spent,billing_order_id,created_at,updated_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,'queued',0,'queued',0,'','','','',0,0,'',?,?,'')").bind(body.id, record.id, userId, tool.id, site.host, site.url, hash, JSON.stringify(options), tool.tool_charge_type, tool.tool_points_cost || 0, timestamp, timestamp).run();
    return { id: String(body.id), siteId: record.id, host: site.host, status: 'queued' as const, progress: 0, stage: 'queued', error: '', createdAt: timestamp, updatedAt: timestamp, completedAt: '', charged: false, pointsSpent: 0, report: null };
  });
  if (process.env.NODE_ENV !== 'production') startLocalAnalysis();
  return run;
}
async function finalize(row: RunRow, token: string, report: SiteReport, status: 'completed' | 'partial', message = '') {
  return env.DB.transaction(async db => {
    await lockPointsUser(db, Number(row.user_id));
    const current = await db.prepare('SELECT * FROM site_analysis_runs WHERE id=? FOR UPDATE').bind(row.id).first<RunRow>();
    if (!current || current.status !== 'running' || current.claim_token !== token) throw new SiteAnalysisError('分析任务已由其他进程接管', 409);
    let charged = false, spent = 0, orderId = '';
    if (status === 'completed') {
      const tool = await db.prepare("SELECT id,name,tool_slug,tool_charge_type,tool_points_cost FROM products WHERE id=? AND product_type='tool' AND status='active' FOR UPDATE").bind(row.product_id).first<Tool>();
      if (!tool || !isSiteAnalysisTool(tool) || tool.tool_charge_type !== row.billing_mode || tool.tool_charge_type === 'points' && Number(tool.tool_points_cost) !== Number(row.points_cost)) throw new SiteAnalysisError('工具收费配置已变化，本次未扣费', 409);
      if (['paid','points'].includes(tool.tool_charge_type)) {
        const orders = (await db.prepare("SELECT id,tool_billing_cycle,tool_paid_at,tool_uses_remaining FROM orders WHERE user_id=? AND product_id=? AND status IN ('paid','pending_delivery','delivered') ORDER BY created_at,id FOR UPDATE").bind(row.user_id, row.product_id).all<ToolOrderAccess>()).results.filter(o => usableToolOrder(o)).sort((a,b) => Number(a.tool_billing_cycle === 'times') - Number(b.tool_billing_cycle === 'times'));
        const order = orders[0];
        if (order) {
          orderId = order.id; charged = order.tool_billing_cycle === 'times';
          if (charged) await db.prepare('UPDATE orders SET tool_uses_remaining=tool_uses_remaining-1 WHERE id=? AND user_id=? AND tool_uses_remaining>0').bind(order.id, row.user_id).expectChanges(1).run();
          await db.prepare('INSERT INTO tool_usage_events (operation_id,order_id,created_at) VALUES (?,?,?)').bind(`site:${row.id}`, order.id, now()).run();
        } else if (tool.tool_charge_type === 'points') { const result = await consumePoints(db, Number(row.user_id), Number(row.product_id), Number(row.points_cost), `site:${row.id}`); charged = result.charged; spent = result.pointsSpent; }
        else throw new SiteAnalysisError('套餐已到期或次数不足，本次未扣费', 402);
      } else if (tool.tool_charge_type !== 'free') throw new SiteAnalysisError('该工具暂未开放分析', 409);
    }
    const previous = await db.prepare("SELECT r.id,p.report_json FROM site_analysis_runs r JOIN site_analysis_reports p ON p.run_id=r.id WHERE r.user_id=? AND r.site_id=? AND r.product_id=? AND r.id<>? AND r.options_json=? AND r.status IN ('completed','partial') ORDER BY r.created_at DESC,r.id DESC LIMIT 1").bind(row.user_id, row.site_id, row.product_id, row.id, row.options_json).first<{ id: string; report_json: string }>();
    if (previous) report.comparison = compareReports(JSON.parse(previous.report_json), report, previous.id);
    const timestamp = now(), json = JSON.stringify(report);
    await db.prepare('INSERT INTO site_analysis_reports (run_id,user_id,site_id,report_json,created_at) VALUES (?,?,?,?,?)').bind(row.id, row.user_id, row.site_id, json, timestamp).run();
    for (const page of report.pages) await db.prepare('INSERT INTO site_analysis_pages (run_id,url_hash,url,page_json) VALUES (?,?,?,?)').bind(row.id, digest(page.url), page.url, JSON.stringify(page)).run();
    for (const word of report.keywords) await db.prepare('INSERT INTO site_analysis_keywords (run_id,word_hash,keyword,kind,score,sources_json) VALUES (?,?,?,?,?,?)').bind(row.id, digest(word.word.toLowerCase()), word.word, word.kind, word.score, JSON.stringify(word.sources)).run();
    for (const rank of report.rankings) await db.prepare('INSERT INTO site_analysis_rankings (run_id,engine,word_hash,keyword,state,position,url,source_url,checked_at,message) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(row.id, rank.engine, digest(rank.keyword.toLowerCase()), rank.keyword, rank.state, rank.position, rank.url, rank.source, rank.checkedAt, rank.message).run();
    await db.prepare('UPDATE site_analysis_runs SET status=?,progress=100,stage=?,draft_json=?,charged=?,points_spent=?,billing_order_id=?,error_message=?,updated_at=?,completed_at=?,lease_until=? WHERE id=? AND claim_token=?').bind(status, 'report', json, charged ? 1 : 0, spent, orderId, message, timestamp, timestamp, '', row.id, token).expectChanges(1).run();
  });
}
export async function runNextSiteAnalysis(workerId: string, collect = collectSiteReport, stopSignal?: AbortSignal) {
  const timestamp = now();
  await env.DB.prepare('INSERT INTO site_analysis_workers (id,heartbeat_at) VALUES (?,?) ON DUPLICATE KEY UPDATE heartbeat_at=VALUES(heartbeat_at)').bind(workerId, timestamp).run();
  await env.DB.prepare("UPDATE site_analysis_runs SET status='failed',stage='interrupted',error_message=?,completed_at=?,updated_at=?,lease_until='' WHERE status='running' AND lease_until<? AND attempts>=3").bind('采集进程中断多次，本次未扣费，请重新分析', timestamp, timestamp, timestamp).run();
  const row = await env.DB.prepare("SELECT * FROM site_analysis_runs WHERE status='queued' OR (status='running' AND lease_until<? AND attempts<3) ORDER BY created_at,id LIMIT 1").bind(timestamp).first<RunRow>();
  if (!row) return false;
  const token = randomUUID(), lease = () => new Date(Date.now() + 60000).toISOString();
  const claim = await env.DB.prepare("UPDATE site_analysis_runs SET status='running',progress=1,stage='starting',attempts=attempts+1,claim_token=?,lease_until=?,updated_at=? WHERE id=? AND (status='queued' OR (status='running' AND lease_until<? AND attempts<3))").bind(token, lease(), timestamp, row.id, timestamp).run();
  if (claim.meta.changes !== 1) return true;
  const controller = new AbortController(); const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(180000), ...(stopSignal ? [stopSignal] : [])]);
  const heartbeat = setInterval(() => {
    void Promise.all([
      env.DB.prepare("UPDATE site_analysis_runs SET lease_until=?,updated_at=? WHERE id=? AND status='running' AND claim_token=?").bind(lease(), now(), row.id, token).run().then(result => { if (result.meta.changes !== 1) controller.abort(); }),
      env.DB.prepare('UPDATE site_analysis_workers SET heartbeat_at=? WHERE id=?').bind(now(), workerId).run(),
    ]).catch(() => controller.abort());
  }, 10000); heartbeat.unref();
  try {
    let lastEvent = '';
    const report = await collect(row.source_url, analysisOptions(JSON.parse(row.options_json)), async (draft, progress) => {
      // A collection deadline preserves partial results. Fencing and shutdown still stop stale writes.
      controller.signal.throwIfAborted(); stopSignal?.throwIfAborted();
      const stage = draft.stages.at(-1), key = stage?.key || '';
      await env.DB.prepare("UPDATE site_analysis_runs SET draft_json=?,progress=?,stage=?,updated_at=?,lease_until=? WHERE id=? AND status='running' AND claim_token=?").bind(JSON.stringify(draft), progress, key, now(), lease(), row.id, token).expectChanges(1).run();
      const signature = `${key}:${stage?.state}`;
      if (stage && lastEvent !== signature) { lastEvent = signature; await env.DB.prepare('INSERT INTO site_analysis_events (run_id,stage,state,message,created_at) VALUES (?,?,?,?,?)').bind(row.id, key, stage.state, stage.message, now()).run(); }
    }, undefined, signal);
    if (!report.pages.some(p => p.status >= 200 && p.status < 300)) throw new SiteAnalysisError('未能读取网站页面，基础结果已保存，本次未扣费', 422);
    const status = report.stages.some(s => ['failed','partial','restricted','unavailable'].includes(s.state)) ? 'partial' : 'completed';
    try { await finalize(row, token, report, status); }
    catch (error) {
      if (!(error instanceof SiteAnalysisError || error instanceof PointsError) || status !== 'completed') throw error;
      report.stages.push({ key: 'billing', state: 'partial', message: error.message, at: now() });
      await finalize(row, token, report, 'partial', error.message);
    }
    console.info('[站长分析]', row.id, '报告已保存');
  } catch (error) {
    if (stopSignal?.aborted) {
      await env.DB.prepare("UPDATE site_analysis_runs SET status='queued',stage='queued',claim_token='',lease_until='',updated_at=? WHERE id=? AND status='running' AND claim_token=?").bind(now(), row.id, token).run();
      return true;
    }
    const message = error instanceof SiteAnalysisError || error instanceof PointsError ? error.message : signal.aborted ? '采集已中断，已有结果保留，本次未扣费' : '分析服务暂不可用，已有结果保留，本次未扣费';
    await env.DB.prepare("UPDATE site_analysis_runs SET status='failed',stage='failed',error_message=?,completed_at=?,updated_at=?,lease_until='' WHERE id=? AND status='running' AND claim_token=?").bind(message, now(), now(), row.id, token).run();
    console.error('[站长分析]', row.id, '失败', error instanceof Error ? error.name : 'Error');
  } finally { clearInterval(heartbeat); }
  return true;
}
const local = globalThis as typeof globalThis & { __yxSiteAnalysis?: boolean };
function startLocalAnalysis() {
  if (local.__yxSiteAnalysis) return; local.__yxSiteAnalysis = true;
  void (async () => { const id = randomUUID(); try { while (await runNextSiteAnalysis(id)) { /* Durable queue is claimed atomically, including across dev reloads. */ } } catch { console.error('[站长分析] 本地采集队列暂不可用'); } finally { local.__yxSiteAnalysis = false; } })();
}
export const analysisHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
export function analysisFailure(error: unknown) {
  if (error instanceof SiteAnalysisError || error instanceof PointsError) {
    const retryAfter = error instanceof SiteAnalysisError && error.status === 429 && Number.isFinite(error.retryAfter) ? Math.max(1, Math.min(10, Math.ceil(error.retryAfter!))) : undefined;
    return Response.json({ message: error.message, ...(retryAfter ? { retryAfter } : {}) }, { status: error.status, headers: { ...analysisHeaders, ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}) } });
  }
  if (error instanceof SyntaxError) return Response.json({ message: '分析参数格式不正确' }, { status: 400, headers: analysisHeaders });
  const missing = ['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes((error as { code?: string })?.code || '');
  console.error('[站长分析] 请求失败', (error as { code?: string })?.code || 'unavailable');
  return Response.json({ message: missing ? '站长分析尚未初始化，请管理员依次执行10号和11号增量SQL' : '分析服务暂不可用，请稍后重试' }, { status: 503, headers: analysisHeaders });
}
