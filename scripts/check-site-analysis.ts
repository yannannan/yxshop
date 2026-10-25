// Direct, read-only collection diagnostics. No business DB, port, billing, or automatic browser installation.
import { analysisOptions, engineDefinitions } from '../lib/site-analysis';
import { collectSiteReport } from '../lib/site-analysis-collector';
const domain = process.argv[2];
if (!domain) { console.error('用法：node --import tsx scripts/check-site-analysis.ts example.com [--engines]'); process.exitCode = 2; }
else {
  try {
    let previous = '';
    const report = await collectSiteReport(domain, analysisOptions({ maxPages: 5, engines: process.argv.includes('--engines') ? engineDefinitions.map(engine => engine.id) : [] }), async (draft, progress) => {
      const stage = draft.stages.at(-1), key = `${stage?.key}:${stage?.state}`;
      if (key !== previous) { previous = key; console.error(`[站长采集 ${progress}%] ${stage?.key} ${stage?.state} ${stage?.message}`); }
    });
    console.log(JSON.stringify(report, null, 2)); if (!report.pages.length) process.exitCode = 1;
  } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
