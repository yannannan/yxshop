import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
const require = createRequire(import.meta.url), root = new URL('../', import.meta.url);
function loader(mocks = {}, globals = {}) {
  const cache = new Map();
  const load = name => {
    const file = new URL(name, root); if (cache.has(file.href)) return cache.get(file.href).exports;
    const loaded = { exports: {} }; cache.set(file.href, loaded);
    const source = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file.pathname.replace(/\.mjs$/, '.ts'), compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    vm.runInNewContext(source, { module: loaded, exports: loaded.exports, Buffer, Request, Response, URL, URLSearchParams, TextDecoder, AbortSignal, AbortController, Intl, Date, crypto: globalThis.crypto, setTimeout, clearTimeout, setInterval, clearInterval, console: { info() {}, error() {}, warn() {} }, process: { env: { NODE_ENV: 'production' } }, ...globals, require: spec => {
      if (Object.hasOwn(mocks, spec)) return mocks[spec];
      if (spec.startsWith('.')) { const relative = new URL(spec + (/\.(?:tsx?|mjs)$/.test(spec) ? '' : '.ts'), file); return load(relative.href); }
      return require(spec);
    } }, { filename: file.pathname });
    return loaded.exports;
  };
  return load;
}
const load = loader(), model = load('lib/site-analysis.ts'), parser = load('lib/site-analysis-parser.ts'), network = load('lib/site-analysis-network.ts'), collector = load('lib/site-analysis-collector.ts');
const id = '11111111-1111-4111-8111-111111111111', otherId = '22222222-2222-4222-8222-222222222222';
const html = '<html lang="zh-CN"><head><title>宇星软件 | 示例网站</title><meta name="description" content="提供网站分析与软件开发"><meta name="keywords" content="网站分析,软件开发"></head><body><main><h1>网站分析工具</h1><p>网站分析用于网站运营。软件开发帮助企业提供网站分析功能。</p><a href="/about">关于软件开发</a><a href="https://external.example.org/">外站</a><a href="/admin">后台</a></main><script>secret keyword</script></body></html>';
function fakeIO({ blocked = false, engineBlocked = false, brokenPage = false, dynamic = false } = {}) {
  const requests = [];
  const io = { async request(url) {
    requests.push(url); const parsed = new URL(url); let body, status = 200, contentType = 'text/html;charset=utf-8';
    if (parsed.pathname === '/robots.txt') { body = blocked ? 'User-agent: *\nDisallow: /' : engineBlocked && parsed.hostname === 'www.bing.com' ? 'User-agent: *\nDisallow: /search' : 'User-agent: *\nDisallow: /admin'; contentType = 'text/plain'; }
    else if (parsed.pathname === '/sitemap.xml') { body = '<urlset><url><loc>https://example.org/about</loc></url><url><loc>https://internal.example.org/no</loc></url></urlset>'; contentType = 'application/xml'; }
    else if (parsed.pathname === '/about') { body = brokenPage ? 'unavailable' : html.replace('宇星软件 | 示例网站','关于宇星软件'); status = brokenPage ? 503 : 200; }
    else body = dynamic ? '<html><head><title>App</title></head><body><div id="app"></div><script src="/app.js"></script></body></html>' : html;
    return { url, status, bytes: Buffer.from(body), contentType };
  }, async dns() { return { addresses: ['93.184.216.34'], cname: [], nameservers: ['ns.example.org'] }; }, async registration() { return { source: 'https://rdap.example.net/domain/example.org', data: { events: [{ eventAction: 'registration', eventDate: '2020-01-01T00:00:00Z' }], entities: [{ roles: ['registrar'], vcardArray: ['vcard', [['fn', {}, 'text', 'Registrar']]] }] } }; } };
  return { io, requests };
}
const clone = value => JSON.parse(JSON.stringify(value));
test('分析请求对HTML错误页和损坏JSON显示明确提示，保留业务错误与取消行为', async () => {
  const invalid = '分析服务返回异常响应，请重试或联系管理员检查服务日志';
  const english = loader()('lib/i18n.ts').translator('en');
  assert.match(english(invalid), /invalid response/);
  for (const response of [new Response('<!DOCTYPE html><title>Build error</title>', {status:500}), new Response('{broken', {status:502}), Response.json(null), Response.json([])]) {
    const client = loader({}, {fetch: async () => response})('lib/site-analysis-client.ts');
    await assert.rejects(client.siteAnalysisRequest('?tool=50'), error => error.message === invalid);
  }
  const failure = loader({}, {fetch: async () => Response.json({message:'站长分析尚未初始化，请管理员执行10号增量SQL'}, {status:503})})('lib/site-analysis-client.ts');
  await assert.rejects(failure.siteAnalysisRequest('?tool=50'), /10号增量SQL/);
  const malformed = loader({}, {fetch: async () => Response.json({message:{unsafe:'detail'}}, {status:500})})('lib/site-analysis-client.ts');
  await assert.rejects(malformed.siteAnalysisRequest(''), /分析服务暂不可用/);
  const aborted = new DOMException('Stopped', 'AbortError');
  const cancelled = loader({}, {fetch: async () => ({json: async () => {throw aborted;}})})('lib/site-analysis-client.ts');
  await assert.rejects(cancelled.siteAnalysisRequest(''), error => error === aborted);
});

test('分析请求保留JSON数据、私有读取与提交选项，不将错误当空列表', async () => {
  const requests = [], payload = {authenticated:true,sites:[],history:[]};
  const client = loader({}, {fetch: async (url, init) => {requests.push({url,init});return Response.json(payload);}})('lib/site-analysis-client.ts');
  assert.deepEqual(clone(await client.siteAnalysisRequest('?tool=50')), payload);
  const signal = new AbortController().signal;
  await client.siteAnalysisRequest('', {method:'POST',body:'{"tool":50}',headers:{'Content-Type':'application/json'},signal});
  assert.equal(requests[0].url, '/api/tools/site-analysis?tool=50');assert.equal(requests[0].init.cache,'no-store');
  assert.equal(requests[1].init.method,'POST');assert.equal(requests[1].init.body,'{"tool":50}');assert.equal(requests[1].init.signal,signal);
});

test('域名规范化保留主机范围与协议，拒绝 IP、认证信息、本地名和特殊端口', () => {
  assert.equal(network.normalizeSite('example.co.uk/path?q=1').url, 'https://example.co.uk/'); assert.equal(network.normalizeSite('https://www.example.co.uk').domain, 'example.co.uk');
  assert.equal(network.normalizeSite('https://例子.com').host, 'xn--fsqu00a.com');
  for (const value of ['','127.0.0.1','https://[::1]','http://10.0.0.1','file:///tmp/a','https://user:pass@example.org','https://example.org:8443','https://thing.local','https://example.org\\@localhost','a b']) assert.throws(() => network.normalizeSite(value), undefined, value);
});
test('采集参数限制页面数、关键词、引擎和当前支持设备；等价选项稳定序列化', () => {
  assert.equal(model.analysisOptions({}).maxPages, 20); assert.equal(JSON.stringify(model.analysisOptions({ engines:['bing','baidu','bing'] })), JSON.stringify(model.analysisOptions({ engines:['baidu','bing'] })));
  for (const value of [{maxPages:5000},{engines:['google']},{keywords:['x'.repeat(81)]},{keywords:[42]},{device:'mobile'},{language:'bad'}]) assert.throws(() => model.analysisOptions(value));
});
test('真实 HTML 解析保留标题、关键词、链接和索引声明，正文排除脚本及导航', () => {
  const page = parser.parseSitePage(Buffer.from(html), 'https://example.org/'); assert.equal(page.title, '宇星软件 | 示例网站'); assert.equal(page.language, 'zh-CN'); assert.ok(!page.text.includes('secret keyword')); assert.equal(page.declared.length, 2); assert.ok(page.links.includes('https://example.org/about'));
  const noindex = parser.parseSitePage(Buffer.from('<title>A</title><meta name="robots" content="noindex,nofollow"><link rel="canonical" href="/main">'), 'https://example.org/'); assert.equal(noindex.noindex, true); assert.equal(noindex.canonical, 'https://example.org/main');
});
test('关键词跨来源去重并保留来源，网站声明词不会被直接标成有排名', () => {
  const page = parser.parseSitePage(Buffer.from(html), 'https://example.org/'), rows = parser.extractSiteKeywords([page], ['网站分析','Website SEO']);
  const word = rows.find(w => w.word === '网站分析'); assert.equal(word.kind, 'manual'); assert.ok(word.sources.some(s => s.kind === 'declared')); assert.equal(rows.filter(w => w.word === '网站分析').length, 1); assert.ok(!rows.some(w => w.word === 'secret'));
});
test('网站采集完成基础报告，限制同源范围并保存缺省注册主体状态', async () => {
  const f = fakeIO(), snapshots = [], report = await collector.collectSiteReport('example.org', model.analysisOptions({maxPages:5}), async (value, progress) => snapshots.push({ value: clone(value), progress }), f.io);
  assert.equal(report.pages.length, 2); assert.equal(report.profile.registrar, 'Registrar'); assert.equal(report.profile.registrant, ''); assert.equal(report.profile.registeredAt, '2020-01-01T00:00:00Z'); assert.ok(report.keywords.length); assert.equal(report.engines.find(e => e.id === 'google').state, 'unavailable'); assert.ok(!f.requests.some(url => /external|internal|\/admin/.test(url))); assert.equal(snapshots.at(-1).progress,95); assert.equal(report.stages.find(s=>s.key==='pages').state,'complete');
});
test('robots 禁止采集时不读取首页，不伪造内容；个别页面失败保留部分报告', async () => {
  const blocked = fakeIO({blocked:true}), report = await collector.collectSiteReport('example.org',model.analysisOptions({maxPages:5}),async()=>{},blocked.io); assert.equal(report.pages.length,0); assert.ok(!blocked.requests.includes('https://example.org/')); assert.equal(report.stages.find(s=>s.key==='pages').state,'failed');
  const partial = fakeIO({brokenPage:true}), next = await collector.collectSiteReport('example.org',model.analysisOptions({maxPages:5}),async()=>{},partial.io); assert.equal(next.pages.length,2); assert.equal(next.stages.find(s=>s.key==='pages').state,'partial'); assert.ok(next.issues.some(i=>i.code==='http'));
});
test('动态首页通过注入的渲染器读取；渲染失败只保留静态资料并标记部分完成', async () => {
  const f = fakeIO({dynamic:true}); let rendered = 0; f.io.render = async () => { rendered++; return Buffer.from(html); };
  const report = await collector.collectSiteReport('example.org',model.analysisOptions({maxPages:5}),async()=>{},f.io); assert.equal(rendered,1); assert.equal(report.pages[0].rendered,true);
  f.io.render = async () => { throw Error('browser unavailable'); }; const failed = await collector.collectSiteReport('example.org',model.analysisOptions({maxPages:5}),async()=>{},f.io); assert.ok(failed.issues.some(i=>i.code==='dynamic')); assert.equal(failed.stages.find(s=>s.key==='pages').state,'partial');
});
test('搜索采集被 robots 限制时记录受限，禁止继续查询和虚构零排名', async () => {
  const f = fakeIO({engineBlocked:true}), report = await collector.collectSiteReport('example.org',model.analysisOptions({maxPages:5,engines:['bing']}),async()=>{},f.io), engine = report.engines.find(e=>e.id==='bing');
  assert.equal(engine.state,'restricted'); assert.equal(engine.hits,null); assert.equal(engine.top10,null); assert.ok(!f.requests.some(url=>url.includes('/search?')));
});
test('自然结果解析区分命中、完整范围未命中、验证页和不足结果', () => {
  const make = (target, missing=false) => Buffer.from('<ol id="b_results">'+Array.from({length:10},(_,i)=>`<li class="b_algo"><h2><a ${missing&&i===0?'':`href="${i===2&&target?'https://example.org/post':`https://competitor${i}.org/`}"`}>Result</a></h2></li>`).join('')+'</ol>');
  assert.equal(parser.parseSearchResults('bing',make(true),'https://www.bing.com/search?q=test','test','example.org').position,3);
  assert.equal(parser.parseSearchResults('bing',make(false),'https://www.bing.com/search?q=test','test','example.org').state,'not_found');
  assert.equal(parser.parseSearchResults('bing',make(false,true),'https://www.bing.com/search?q=test','test','example.org').state,'failed');
  assert.equal(parser.parseSearchResults('bing',Buffer.from('<title>安全验证</title>'),'https://www.bing.com/','test','example.org').state,'restricted');
});
test('历史对比只比较相同条件与成功查询，失败不计为排名下降', () => {
  const first=collector.blankReport('example.org',model.analysisOptions({})), next=clone(first);
  first.keywords=[{word:'old'}];next.keywords=[{word:'new'}];first.rankings=[{engine:'bing',keyword:'a',state:'found',position:3},{engine:'bing',keyword:'b',state:'found',position:2}];next.rankings=[{engine:'bing',keyword:'a',state:'found',position:1},{engine:'bing',keyword:'b',state:'failed',position:null}];
  const compared=model.compareReports(first,next,'previous');assert.equal(compared.up,1);assert.equal(compared.down,0);assert.equal(compared.comparable,1);assert.equal(compared.added,1);
  next.options.maxPages=50;assert.equal(model.compareReports(first,next,'previous'),null);
});
test('网络连接固定已校验公网 IP，重定向到内网在第二次连接前拒绝，压缩正文受解压后限额约束', async () => {
  const video = load('lib/video-network.ts'); let calls = 0, compressed = false, redirect = true;
  const mockRequest = (_url, options, callback) => {
    calls++; options.lookup('public.example.org',{all:false},(error,address,family)=>{assert.equal(error,null);assert.equal(address,'93.184.216.34');assert.equal(family,4);});
    const request = new EventEmitter(); request.setTimeout=()=>request;request.end=()=>queueMicrotask(()=>{
      const response=Readable.from([compressed?gzipSync(Buffer.alloc(10000,65)):Buffer.from('ok')]);response.statusCode=redirect?302:200;response.headers=redirect?{location:'http://127.0.0.1/private'}:{'content-type':'text/html',...(compressed?{'content-encoding':'gzip'}:{})};callback(response);
    });return request;
  };
  const net=loader({'node:http':{request:mockRequest},'node:https':{request:mockRequest},'./video-network':{async videoUrlAddress(raw){const url=new URL(raw);if(url.hostname==='127.0.0.1')return video.videoUrlAddress(raw);return{url,address:{address:'93.184.216.34',family:4}};}}})('lib/site-analysis-network.ts');
  await assert.rejects(net.siteRequest('https://public.example.org/',AbortSignal.timeout(1000)),/本地|内网/);assert.equal(calls,1);
  redirect=false;compressed=true;await assert.rejects(net.siteRequest('https://public.example.org/',AbortSignal.timeout(1000),100),/大小限制/);
  compressed=false;const result=await net.siteRequest('https://public.example.org/#fragment',AbortSignal.timeout(1000));assert.equal(result.bytes.toString(),'ok');assert.equal(result.url,'https://public.example.org/');
});
test('同一落地页面的多个跳转入口不会产生重复页面记录', async () => {
  const f=fakeIO(), original=f.io.request;f.io.request=async url=>{const result=await original(url);if(new URL(url).pathname==='/about')result.url='https://example.org/';return result;};
  const report=await collector.collectSiteReport('example.org',model.analysisOptions({maxPages:5}),async()=>{},f.io);assert.equal(report.pages.length,1);assert.equal(new Set(report.pages.map(p=>p.url)).size,1);
});

function fixture({chargeType='free',balance=300,failTable=''}={}) {
  let state={users:[{id:1,phone:'13800000000',status:'active'},{id:2,phone:'13900000000',status:'active'}],products:[{id:50,name:'站长分析工具',tool_slug:'webmaster-tools',tool_charge_type:chargeType,tool_points_cost:10}],orders:[],points_wallets:[{user_id:1,balance}],points_ledger:[],tool_usage_events:[],site_analysis_sites:[],site_analysis_runs:[],site_analysis_reports:[],site_analysis_pages:[],site_analysis_keywords:[],site_analysis_rankings:[],site_analysis_events:[],site_analysis_workers:[],site_analysis_issue_actions:[]};
  const queries=[];let gate=Promise.resolve();
  const DB={prepare(sql){let args=[],expected;
    const execute=async()=>{
      assert.equal((sql.match(/\?/g)||[]).length,args.length,sql);queries.push({sql,args:clone(args)});
      if(sql.startsWith('INSERT INTO ')){
        const match=/INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\)/.exec(sql);assert.ok(match,sql);const[,table,cols,values]=match;
        if(table===failTable)throw Error('mock write failure');let cursor=0;const record=Object.fromEntries(cols.split(',').map((key,i)=>{const token=values.split(',')[i].trim();return[key.trim(),token==='?'?args[cursor++]:token.startsWith("'")?token.slice(1,-1):Number(token)];}));
        const old=table==='site_analysis_workers'?state[table].find(r=>r.id===record.id):table==='site_analysis_issue_actions'?state[table].find(r=>r.run_id===record.run_id&&r.user_id===record.user_id&&r.issue_key===record.issue_key):null;
        if(old)Object.assign(old,record);else state[table].push(record);return{affectedRows:1};
      }
      if(sql.startsWith('SELECT')){
        if(sql.includes('FROM users'))return state.users.filter(r=>sql.includes('phone=?')?r.phone===args[0]&&r.status==='active':r.id===args[0]&&r.status==='active');
        if(sql.includes('FROM products'))return state.products.filter(r=>r.id===args[0]);
        if(sql.startsWith('SELECT r.id,p.report_json')){const runs=state.site_analysis_runs.filter(r=>r.user_id===args[0]&&r.site_id===args[1]&&r.product_id===args[2]&&r.id!==args[3]&&['completed','partial'].includes(r.status));return runs.map(r=>({id:r.id,report_json:state.site_analysis_reports.find(p=>p.run_id===r.id)?.report_json})).filter(r=>r.report_json).slice(-1);}
        const table=/FROM (\w+)/.exec(sql)?.[1];assert.ok(table&&Array.isArray(state[table]),sql);let rows=[...state[table]];
        if(table==='site_analysis_runs'){
          if(sql.includes('WHERE id=?'))rows=rows.filter(r=>r.id===args[0]&&(!sql.includes('AND user_id=?')||r.user_id===args[1])&&(!sql.includes('AND product_id=?')||r.product_id===args[2]));
          else if(sql.includes("WHERE status='queued' OR"))rows=rows.filter(r=>r.status==='queued'||r.status==='running'&&r.lease_until<args[0]&&r.attempts<3).slice(0,1);
          else if(sql.includes('WHERE user_id=?')){rows=rows.filter(r=>r.user_id===args[0]);if(sql.includes('AND product_id=?'))rows=rows.filter(r=>r.product_id===args[1]);if(sql.includes('AND site_id=?'))rows=rows.filter(r=>r.site_id===args[2]);if(sql.includes("status IN ('queued','running')"))rows=rows.filter(r=>['queued','running'].includes(r.status));if(sql.includes('created_at>=?'))rows=rows.filter(r=>r.created_at>=args[1]);}
        }else if(table==='site_analysis_sites')rows=rows.filter(r=>r.user_id===args[0]&&(!sql.includes('host=?')||r.host===args[1]));
        else if(table==='site_analysis_workers')rows=rows.filter(r=>r.heartbeat_at>=args[0]);
        else if(table==='orders')rows=rows.filter(r=>r.user_id===args[0]&&r.product_id===args[1]&&['paid','pending_delivery','delivered'].includes(r.status));
        else if(table==='points_wallets')rows=rows.filter(r=>r.user_id===args[0]);
        else if(table==='points_ledger')rows=rows.filter(r=>r.operation_id===args[0]);
        else if(table==='site_analysis_issue_actions')rows=rows.filter(r=>r.run_id===args[0]&&r.user_id===args[1]);
        if(sql.startsWith('SELECT COUNT'))return[{total:rows.length}];
        if(sql.includes('ORDER BY created_at DESC'))rows.reverse();if(sql.includes('LIMIT 10 OFFSET ?'))rows=rows.slice(args.at(-1),args.at(-1)+10);
        return clone(rows);
      }
      if(sql.startsWith('UPDATE site_analysis_sites')){const row=state.site_analysis_sites.find(r=>r.id===args[2]&&r.user_id===args[3]);if(row)Object.assign(row,{url:args[0],updated_at:args[1]});return{affectedRows:row?1:0};}
      if(sql.startsWith('UPDATE site_analysis_workers')){const row=state.site_analysis_workers.find(r=>r.id===args[1]);if(row)row.heartbeat_at=args[0];return{affectedRows:row?1:0};}
      if(sql.startsWith('UPDATE points_wallets')){const row=state.points_wallets.find(r=>r.user_id===args[2]&&r.balance>=args[3]);if(row)row.balance-=args[0];return{affectedRows:row?1:0};}
      if(sql.startsWith('UPDATE orders')){const row=state.orders.find(r=>r.id===args[0]&&r.user_id===args[1]&&r.tool_uses_remaining>0);if(row)row.tool_uses_remaining--;return{affectedRows:row?1:0};}
      if(sql.startsWith('UPDATE site_analysis_runs')){
        if(sql.includes('attempts>=3')){let changes=0;for(const r of state.site_analysis_runs)if(r.status==='running'&&r.lease_until<args[3]&&r.attempts>=3){Object.assign(r,{status:'failed',error_message:args[0],completed_at:args[1],updated_at:args[2]});changes++;}return{affectedRows:changes};}
        const claim=sql.includes('attempts=attempts+1'), draft=sql.includes('SET draft_json='), final=sql.includes('SET status=?'), heartbeat=sql.includes('SET lease_until='), reset=sql.includes("SET status='queued'");
        const runId=claim?args[3]:draft?args[5]:final?args[10]:heartbeat?args[2]:reset?args[1]:args[3],row=state.site_analysis_runs.find(r=>r.id===runId);
        if(!row)return{affectedRows:0};if(claim){if(row.status!=='queued'&&!(row.status==='running'&&row.lease_until<args[4]&&row.attempts<3))return{affectedRows:0};Object.assign(row,{status:'running',progress:1,stage:'starting',claim_token:args[0],lease_until:args[1],updated_at:args[2],attempts:row.attempts+1});}
        else{const token=draft?args[6]:final?args[11]:heartbeat?args[3]:reset?args[2]:args[4];if(row.status!=='running'||row.claim_token!==token)return{affectedRows:0};if(draft)Object.assign(row,{draft_json:args[0],progress:args[1],stage:args[2],updated_at:args[3],lease_until:args[4]});else if(final)Object.assign(row,{status:args[0],progress:100,stage:args[1],draft_json:args[2],charged:args[3],points_spent:args[4],billing_order_id:args[5],error_message:args[6],updated_at:args[7],completed_at:args[8],lease_until:args[9]});else if(heartbeat)Object.assign(row,{lease_until:args[0],updated_at:args[1]});else if(reset)Object.assign(row,{status:'queued',stage:'queued',claim_token:'',lease_until:'',updated_at:args[0]});else Object.assign(row,{status:'failed',error_message:args[0],completed_at:args[1],updated_at:args[2],lease_until:''});}return{affectedRows:1};
      }
      throw Error('Unexpected SQL: '+sql);
    };
    return{bind(...values){args=values;return this;},expectChanges(n){expected=n;return this;},async first(){return(await execute())[0]||null;},async all(){return{results:await execute()};},async run(){const value=await execute();if(expected!==undefined&&value.affectedRows!==expected)throw Error('changed');return{meta:{changes:value.affectedRows}};}};
  },async transaction(work){const previous=gate;let release;gate=new Promise(resolve=>release=resolve);await previous;const old=structuredClone(state);try{return await work(DB);}catch(e){state=old;throw e;}finally{release();}}};
  const mocks={'@/db/mysql-runtime':{env:{DB}}};const modules=loader(mocks,{process:{env:{NODE_ENV:'production',AUTH_SESSION_SECRET:'test-site-analysis-key'}}});
  const setup=loader({'./mysql-runtime':{env:{DB}}},{process:{env:{AUTH_SESSION_SECRET:'test-site-analysis-key'}}})('db/setup.ts');mocks['@/db/setup']=setup;
  const service=modules('lib/site-analysis-service.ts');mocks['@/lib/site-analysis-service']=service;mocks['@/lib/site-analysis']=modules('lib/site-analysis.ts');const route=modules('app/api/tools/site-analysis/route.ts');
  const request=({user=1,body,query='?tool=50',headers={}}={})=>new Request('https://shop.example/api/tools/site-analysis'+query,{method:body===undefined?'GET':'POST',headers:{...(user?{cookie:`mall_session=${encodeURIComponent(setup.createMallSession(user===1?'13800000000':'13900000000'))}`} : {}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const body=(overrides={})=>({id,tool:50,domain:'example.org',options:{maxPages:5},...overrides});
  const collect=async(url,options,progress)=>{const result=collector.blankReport(network.normalizeSite(url).host,options);result.pages=[parser.parseSitePage(Buffer.from(html),'https://example.org/')];result.keywords=parser.extractSiteKeywords(result.pages,[]);result.stages=[{key:'pages',state:'complete',message:'ok',at:new Date().toISOString()}];result.issues=[{code:'description',severity:'medium',title:'页面缺少描述',url:'https://example.org/about',advice:'检查描述'}];result.coverage={discovered:1,fetched:1,limited:false};await progress(result,90);return result;};
  return{service,route,request,body,queries,state:()=>state,collect};
}
test('匿名、伪造 Cookie 和停用用户不能创建或读取个人任务', async()=>{
  const f=fixture();assert.equal((await f.route.GET(f.request({user:0}))).status,200);assert.equal((await(await f.route.GET(f.request({user:0}))).json()).authenticated,false);
  assert.equal((await f.route.POST(f.request({user:0,body:f.body()}))).status,401);assert.equal((await f.route.POST(f.request({body:f.body(),headers:{cookie:'mall_session=fake'}}))).status,401);
  f.state().users[0].status='disabled';assert.equal((await f.route.POST(f.request({body:f.body()}))).status,401);assert.equal(f.state().site_analysis_runs.length,0);
});
test('任务创建保存站点与条件；相同请求幂等、并发提交复用活动任务、改参数复用编号被拒绝',async()=>{
  const f=fixture();const first=await f.route.POST(f.request({body:f.body({userId:2})}));assert.equal(first.status,202);assert.equal(f.state().site_analysis_runs[0].user_id,1);assert.equal(f.state().site_analysis_sites.length,1);
  await Promise.all([f.route.POST(f.request({body:f.body()})),f.route.POST(f.request({body:f.body({id:otherId})}))]);assert.equal(f.state().site_analysis_runs.length,1);
  assert.equal((await f.route.POST(f.request({body:f.body({domain:'other.org'})}))).status,409);assert.equal(f.state().points_ledger.length,0);
});
test('跨账号报告读取返回404；跨站写入、无效工具与过大参数在采集前被拒绝',async()=>{
  const f=fixture();await f.route.POST(f.request({body:f.body()}));assert.equal((await f.route.GET(f.request({user:2,query:'?tool=50&run='+id}))).status,404);
  assert.equal((await f.route.POST(f.request({body:f.body({id:otherId}),headers:{origin:'https://evil.example'}}))).status,403);
  assert.equal((await f.route.POST(f.request({body:f.body({tool:99})}))).status,404);assert.equal((await f.route.POST(f.request({body:f.body({domain:'x'.repeat(20000)})}))).status,413);
});
test('Linux Nginx HTTPS终止后同域POST可用，不接受伪造转发主机或其他站点来源',async()=>{
  const f=fixture(), headers={'Content-Type':'application/json',cookie:f.request().headers.get('cookie'),origin:'https://shop.example','x-forwarded-proto':'https'};
  const send=(extra={})=>f.route.POST(new Request('http://shop.example/api/tools/site-analysis',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(f.body())}));
  assert.equal((await send()).status,202);
  assert.equal((await send({origin:'https://evil.example','x-forwarded-host':'evil.example'})).status,403);
  assert.equal((await send({'x-forwarded-proto':'http'})).status,403);
  assert.equal((await send({origin:'null'})).status,403);
});
test('成功报告、页面、关键词和积分流水原子保存，重复领取和重复查看不再扣费',async()=>{
  const f=fixture({chargeType:'points'});await f.route.POST(f.request({body:f.body()}));assert.equal(f.state().points_wallets[0].balance,300);
  await f.service.runNextSiteAnalysis('worker',f.collect);assert.equal(f.state().site_analysis_runs[0].status,'completed');assert.equal(f.state().points_wallets[0].balance,290);assert.equal(f.state().site_analysis_reports.length,1);assert.equal(f.state().site_analysis_pages.length,1);assert.ok(f.state().site_analysis_keywords.length);
  await f.service.runNextSiteAnalysis('worker',f.collect);await f.route.GET(f.request({query:'?tool=50&run='+id}));assert.equal(f.state().points_wallets[0].balance,290);assert.equal(f.state().points_ledger.length,1);
});
test('部分成功报告保存但不扣积分；完整失败保留诊断草稿与失败记录',async()=>{
  const f=fixture({chargeType:'points'});await f.route.POST(f.request({body:f.body()}));await f.service.runNextSiteAnalysis('worker',async(...args)=>{const report=await f.collect(...args);report.stages.push({key:'engine:bing',state:'restricted',message:'blocked',at:new Date().toISOString()});return report;});assert.equal(f.state().site_analysis_runs[0].status,'partial');assert.equal(f.state().points_wallets[0].balance,300);assert.equal(f.state().site_analysis_reports.length,1);
  const failed=fixture();await failed.route.POST(failed.request({body:failed.body()}));await failed.service.runNextSiteAnalysis('worker',async(url,options,progress)=>{const r=collector.blankReport('example.org',options);await progress(r,30);throw Error('network unavailable');});assert.equal(failed.state().site_analysis_runs[0].status,'failed');assert.ok(failed.state().site_analysis_runs[0].draft_json);assert.equal(failed.state().site_analysis_reports.length,0);
});
test('保存报告失败回滚积分与流水；采集期间改价或余额变化保留未扣费的部分报告',async()=>{
  const broken=fixture({chargeType:'points',failTable:'site_analysis_reports'});await broken.route.POST(broken.request({body:broken.body()}));await broken.service.runNextSiteAnalysis('worker',broken.collect);assert.equal(broken.state().points_wallets[0].balance,300);assert.equal(broken.state().points_ledger.length,0);assert.equal(broken.state().site_analysis_runs[0].status,'failed');
  for(const change of ['price','balance']){const f=fixture({chargeType:'points'});await f.route.POST(f.request({body:f.body()}));if(change==='price')f.state().products[0].tool_points_cost=20;else f.state().points_wallets[0].balance=0;await f.service.runNextSiteAnalysis('worker',f.collect);assert.equal(f.state().site_analysis_runs[0].status,'partial');assert.equal(f.state().points_ledger.length,0);assert.equal(f.state().site_analysis_reports.length,1);}
});
test('有效时长套餐优先于次数，次数套餐只在成功完成时扣一次',async()=>{
  for(const membership of [true,false]){const f=fixture({chargeType:'points'});f.state().orders.push({id:'times',user_id:1,product_id:50,status:'paid',tool_billing_cycle:'times',tool_uses_remaining:2});if(membership)f.state().orders.push({id:'forever',user_id:1,product_id:50,status:'paid',tool_billing_cycle:'once',tool_uses_remaining:0});await f.route.POST(f.request({body:f.body()}));await f.service.runNextSiteAnalysis('worker',f.collect);assert.equal(f.state().orders[0].tool_uses_remaining,membership?2:1);assert.equal(f.state().points_wallets[0].balance,300);assert.equal(f.state().tool_usage_events.length,1);}
});
test('过期租约恢复、双进程竞争只生成一份报告；停止信号让未完成任务重新排队',async()=>{
  const f=fixture();await f.route.POST(f.request({body:f.body()}));Object.assign(f.state().site_analysis_runs[0],{status:'running',attempts:1,lease_until:'2000-01-01T00:00:00Z',claim_token:'old'});await Promise.all([f.service.runNextSiteAnalysis('one',f.collect),f.service.runNextSiteAnalysis('two',f.collect)]);assert.equal(f.state().site_analysis_reports.length,1);assert.equal(f.state().site_analysis_runs[0].attempts,2);
  const stopped=fixture();await stopped.route.POST(stopped.request({body:stopped.body()}));const abort=new AbortController();await stopped.service.runNextSiteAnalysis('one',async()=>{abort.abort();throw Error('stop');},abort.signal);assert.equal(stopped.state().site_analysis_runs[0].status,'queued');assert.equal(stopped.state().site_analysis_reports.length,0);
});
test('事项标记与原始报告分离保存，仅报告所有者可标记有效事项',async()=>{
  const f=fixture();await f.route.POST(f.request({body:f.body()}));await f.service.runNextSiteAnalysis('worker',f.collect);const body={action:'issue',tool:50,run:id,code:'description',url:'https://example.org/about',state:'resolved'};
  assert.equal((await f.route.POST(f.request({user:2,body}))).status,404);assert.equal((await f.route.POST(f.request({body:{...body,url:'https://evil.example'}}))).status,400);assert.equal((await f.route.POST(f.request({body}))).status,200);
  const owned=await(await f.route.GET(f.request({query:'?tool=50&run='+id}))).json();assert.equal(owned.run.report.issues[0].state,'resolved');assert.equal(JSON.parse(f.state().site_analysis_reports[0].report_json).issues[0].state,undefined);assert.equal(f.state().site_analysis_reports.length,1);
});
test('历史列表分页与站点列表按账号隔离，接口明确私有不缓存',async()=>{
  const f=fixture();await f.route.POST(f.request({body:f.body()}));const response=await f.route.GET(f.request());const data=await response.json();assert.equal(data.history.length,1);assert.equal(data.sites.length,1);assert.equal(data.history[0].report,null);assert.match(response.headers.get('cache-control'),/private, no-store/);
  const other=await(await f.route.GET(f.request({user:2}))).json();assert.equal(other.history.length,0);assert.equal(other.sites.length,0);
});
test('SQL只新增九张业务表并补空入口，日常升级不安装新的浏览器依赖',()=>{
  const ddl=readFileSync(new URL('sql/10_site_analysis_20261025.sql',root),'utf8');assert.equal((ddl.match(/CREATE TABLE IF NOT EXISTS /g)||[]).length,9);assert.doesNotMatch(ddl,/DROP TABLE|TRUNCATE|UPDATE users|SET tool_charge_type/i);assert.match(ddl,/uq_analysis_site\(user_id,host\)/);assert.match(ddl,/claim_token/);assert.match(ddl,/site_analysis_issue_actions/);
  const upgrade=readFileSync(new URL('upgrade.sh',root),'utf8');assert.match(upgrade,/--check/);assert.ok(!upgrade.includes('site-analysis-worker.ts'));const start=readFileSync(new URL('start.sh',root),'utf8');assert.match(start,/site-analysis-worker.sh/);
});
test('所选版面SSR保持左侧工作台、匿名入口和规划模块状态，英文界面可显示且不翻译采集内容',()=>{
  const english=loader()('lib/i18n.ts');
  for(const locale of ['zh-CN','en']){
    const ui=loader({'./language-provider':{useI18n:()=>({locale,t:english.translator(locale)})},'../lib/account-client':{useAccount:()=>({account:{authenticated:false},loading:false}),notifyAccountChanged(){}},react:{...React,useEffect(){},useRef:v=>({current:v}),useState:v=>[v,()=>{}]}})('components/site-analysis-dashboard.tsx');
    const markup=renderToStaticMarkup(React.createElement(ui.SiteAnalysisDashboard,{tool:{id:50,slug:'webmaster-tools'}}));assert.match(markup,/seo-sidebar/);assert.match(markup,/seo-main/);assert.ok(markup.includes(locale==='en'?'Overview':'综合看板'));assert.ok(markup.includes(locale==='en'?'Sign in to analyze':'登录并开始分析'));assert.match(markup,/disabled=""/);assert.ok(!markup.includes('example.com'));assert.match(markup,/href="\/tools"/);
  }
});
test('真实报告界面显示缺失/受限状态和业务原文，开始分析只提交当前表单条件与幂等编号', async()=>{
  const translation=loader()('lib/i18n.ts'), report=collector.blankReport('example.org',model.analysisOptions({}));report.profile.name='独有网站标题';report.keywords=[{word:'独有业务关键词',kind:'manual',score:100,sources:[{kind:'manual',url:''}]}];report.issues=[{code:'title',severity:'medium',title:'页面缺少标题',url:'https://example.org/',advice:'为页面设置清晰且独立的标题'}];report.engines.find(e=>e.id==='bing').state='restricted';
  const run={id,siteId:otherId,host:'example.org',status:'completed',progress:100,stage:'report',error:'',createdAt:'2026-10-25T00:00:00Z',updatedAt:'2026-10-25T00:00:00Z',completedAt:'2026-10-25T00:00:00Z',charged:false,pointsSpent:0,report};
  const slots={2:id,5:{owner:1,data:{sites:[{id:otherId,host:'example.org',url:'https://example.org/'}],history:[run],total:1,page:1,workerReady:true,access:{canAnalyze:true,chargeType:'free',pointsCost:0,balance:null,hasMembership:false}}},6:{owner:1,run},9:'https://new.example.org/path'};let cursor=0,submitted;
  const react={...React,useEffect(){},useRef:value=>({current:value}),useState:initial=>{const index=cursor++;if(!(index in slots))slots[index]=initial;return[slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];}};
  const moduleLoader=loader({'./language-provider':{useI18n:()=>({locale:'en',t:translation.translator('en')})},'../lib/account-client':{useAccount:()=>({account:{authenticated:true,user:{id:1}},loading:false}),notifyAccountChanged(){}},react},{window:{location:{href:'https://shop.example/tools/webmaster-tools.html'},history:{replaceState(){}}},async fetch(_path,options){submitted=JSON.parse(options.body);return Response.json({run:{...run,id:otherId,status:'queued',report:null}});}});
  const {SiteAnalysisDashboard}=moduleLoader('components/site-analysis-dashboard.tsx');const tree=SiteAnalysisDashboard({tool:{id:50,slug:'webmaster-tools'}}), markup=renderToStaticMarkup(tree);
  assert.ok(markup.includes('独有网站标题'));assert.ok(markup.includes('独有业务关键词'));assert.ok(markup.includes('Access restricted'));assert.ok(markup.includes('Unavailable'));assert.ok(markup.includes('Not connected')||markup.includes('No available data source connected'));
  function elements(node){if(Array.isArray(node))return node.flatMap(elements);return React.isValidElement(node)?[node,...elements(node.props.children)]:[];}
  await elements(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(submitted.domain,'https://new.example.org/path');assert.equal(submitted.tool,50);assert.ok(submitted.id);assert.equal(submitted.userId,undefined);assert.equal(submitted.options.device,'desktop');assert.equal(submitted.options.maxPages,20);
});
