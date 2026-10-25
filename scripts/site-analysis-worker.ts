import { randomUUID } from 'node:crypto';
import { runNextSiteAnalysis } from '../lib/site-analysis-service';

const id = randomUUID(), controller = new AbortController();
for (const name of ['SIGTERM','SIGINT'] as const) process.on(name, () => controller.abort());
console.info('[站长分析] 采集进程已启动', id);
while (!controller.signal.aborted) {
  try { await runNextSiteAnalysis(id, undefined, controller.signal); }
  catch (error) { console.error('[站长分析] 队列暂不可用', (error as { code?: string }).code || 'unavailable', '请确认10号SQL已执行'); }
  if (!controller.signal.aborted) await new Promise<void>(resolve => {
    const done = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', done); resolve(); };
    const timer = setTimeout(done, 3000); controller.signal.addEventListener('abort', done, { once: true });
  });
}
console.info('[站长分析] 采集进程已停止');
process.exit(0);
