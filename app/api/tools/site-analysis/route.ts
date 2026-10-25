import { analysisFailure, analysisHeaders, analysisWorkspace, ownedAnalysisRun, queueAnalysis, siteAnalysisTool, siteAnalysisUser, updateAnalysisIssue } from '@/lib/site-analysis-service';
import { SiteAnalysisError } from '@/lib/site-analysis';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const user = await siteAnalysisUser(request);
    if (!user) return Response.json({ authenticated: false }, { headers: analysisHeaders });
    const query = new URL(request.url).searchParams, tool = await siteAnalysisTool(Number(query.get('tool')));
    if (query.has('run')) return Response.json({ run: await ownedAnalysisRun(Number(user.id), query.get('run')!, tool.id) }, { headers: analysisHeaders });
    return Response.json(await analysisWorkspace(Number(user.id), tool, Number(query.get('page') || 1), query.get('site') || ''), { headers: analysisHeaders });
  } catch (error) { return analysisFailure(error); }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin'), target = new URL(request.url);
    let permittedOrigin = !origin || origin === target.origin;
    // Nginx terminates TLS and passes the original Host and X-Forwarded-Proto.
    // Allow that same-host HTTPS upgrade only; never trust a forwarded host to admit another origin.
    if (origin && !permittedOrigin) {
      try { const source = new URL(origin); permittedOrigin = target.protocol === 'http:' && source.protocol === 'https:' && source.host === target.host && request.headers.get('x-forwarded-proto')?.split(',')[0].trim() === 'https'; } catch { permittedOrigin = false; }
    }
    if (!permittedOrigin || request.headers.get('sec-fetch-site') === 'cross-site') throw new SiteAnalysisError('请从本站发起分析', 403);
    const user = await siteAnalysisUser(request);
    if (!user) throw new SiteAnalysisError('请登录后保存分析报告', 401);
    if (!request.headers.get('content-type')?.includes('application/json')) throw new SiteAnalysisError('分析参数格式不正确');
    const reader = request.body?.getReader(); if (!reader) throw new SiteAnalysisError('分析参数格式不正确');
    let length = 0; const chunks: Uint8Array[] = [];
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength; if (length > 16000) { await reader.cancel(); throw new SiteAnalysisError('分析参数过大', 413); } chunks.push(value); } } finally { reader.releaseLock(); }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SiteAnalysisError('分析参数格式不正确');
    const tool = await siteAnalysisTool(Number(body.tool));
    if (body.action === 'issue') return Response.json({ run: await updateAnalysisIssue(Number(user.id), tool.id, body) }, { headers: analysisHeaders });
    if (body.action !== undefined) throw new SiteAnalysisError('分析操作不正确');
    return Response.json({ run: await queueAnalysis(Number(user.id), tool, body) }, { status: 202, headers: analysisHeaders });
  } catch (error) { return analysisFailure(error); }
}
