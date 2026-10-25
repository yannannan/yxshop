import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

for (const environmentName of ['rsc', 'ssr']) {
  test(`开发 ${environmentName} 编译环境加载真实综合看板接口与解析器，不启动服务或连接业务库`, { timeout: 30000 }, async () => {
    const code = `
import assert from 'node:assert/strict';
import net from 'node:net';
import { createRequire } from 'node:module';
import { resolveConfig, createRunnableDevEnvironment } from 'vite';
// Instantiate only the compiler environment, never createServer() or listen().
net.Server.prototype.listen = () => { throw Error('Listening is forbidden in this test'); };
net.Socket.prototype.connect = () => { throw Error('Network access is forbidden in this test'); };
globalThis.fetch = () => { throw Error('Network access is forbidden in this test'); };
const require = createRequire(import.meta.url);
require('mysql2/promise').createPool = () => { throw Error('Business database access is forbidden in this test'); };
const config = await resolveConfig({ configFile: './vite.config.ts', envDir: false, cacheDir: './vendor/video-engine/site-analysis-dev-test', server: { hmr: false, watch: null }, logLevel: 'silent' }, 'serve');
const environment = createRunnableDevEnvironment(${JSON.stringify(environmentName)}, config, { hot: false, runnerOptions: { hmr: false, sourcemapInterceptor: false } });
await environment.init();
try {
  const route = await environment.runner.import('/app/api/tools/site-analysis/route.ts');
  const response = await route.GET(new Request('http://localhost/api/tools/site-analysis?tool=50'));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\\/json/);
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.deepEqual(await response.json(), { authenticated: false });
  const rejected = await route.POST(new Request('http://localhost/api/tools/site-analysis', { method: 'POST' }));
  assert.equal(rejected.status, 401);
  assert.equal(typeof (await rejected.json()).message, 'string');
  const parser = await environment.runner.import('/lib/site-analysis-parser.ts');
  const page = parser.parseSitePage(Buffer.from('<html><head><title>网站分析</title></head><body><main>中文内容</main></body></html>'), 'https://example.org/');
  assert.equal(page.title, '网站分析'); assert.equal(page.text, '中文内容');
  console.log('development module checks passed');
} finally { await environment.close(); }
`;
    const { stdout } = await execute(process.execPath, ['--input-type=module', '-e', code], { cwd: new URL('../', import.meta.url), timeout: 25000, windowsHide: true, maxBuffer: 100000 });
    assert.match(stdout, /development module checks passed/);
  });
}
