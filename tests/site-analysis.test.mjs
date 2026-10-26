import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
    vm.runInNewContext(source, { module: loaded, exports: loaded.exports, Buffer, btoa, atob, Request, Response, URL, URLSearchParams, TextDecoder, AbortSignal, AbortController, Intl, Date, crypto: globalThis.crypto, setTimeout, clearTimeout, setInterval, clearInterval, console: { info() {}, error() {}, warn() {} }, process: { env: { NODE_ENV: 'production' } }, ...globals, require: spec => {
      if (Object.hasOwn(mocks, spec)) return mocks[spec];
      if (spec.startsWith('.')) { const relative = new URL(spec + (/\.(?:tsx?|mjs)$/.test(spec) ? '' : existsSync(new URL(`${spec}.tsx`, file)) ? '.tsx' : '.ts'), file); return load(relative.href); }
      return require(spec);
    } }, { filename: file.pathname });
    return loaded.exports;
  };
  return load;
}
const load = loader(), model = load('lib/site-analysis.ts'), parser = load('lib/site-analysis-parser.ts'), network = load('lib/site-analysis-network.ts'), collector = load('lib/site-analysis-collector.ts');
const id = '11111111-1111-4111-8111-111111111111', otherId = '22222222-2222-4222-8222-222222222222';
const siteScripts = load('lib/site-script.ts');

test('接入地址固定为www.yxstar.shop的HTTPS，22位短标识完整保留站点编号并拒绝非规范别名',()=>{
  const ids=[id,otherId,'00000000-0000-0000-0000-000000000000','ffffffff-ffff-ffff-ffff-ffffffffffff',...Array.from({length:50},()=>crypto.randomUUID())];
  for(const siteId of ids){
    const key=siteScripts.siteScriptId(siteId);assert.equal(key.length,22);assert.equal(key,Buffer.from(siteId.replaceAll('-',''),'hex').toString('base64url'));
    assert.equal(siteScripts.siteIdFromScriptId(key),siteId);assert.equal(siteScripts.siteScriptId(siteId.toUpperCase()),key);
    const url=new URL(siteScripts.siteScriptUrl(siteId));assert.equal(url.origin,'https://www.yxstar.shop');assert.equal(url.pathname,'/s/'+key);
    assert.equal(siteScripts.siteScriptSnippet(siteId),`<script async src="${url.href}"></script>`);assert.ok(siteScripts.siteScriptSnippet(siteId).length<90);
  }
  assert.equal(new Set(ids.map(siteScripts.siteScriptId)).size,ids.length);
  for(const bad of ['',id,'x'.repeat(21),'a'.repeat(64),'A'.repeat(21)+'B','A'.repeat(22)+'==','/'.repeat(22)])assert.equal(siteScripts.siteIdFromScriptId(bad),'');
  assert.equal(siteScripts.siteScriptSnippet('not-a-site'),'');
});
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
const { prioritizeSiteKeywords } = load('lib/site-analysis-keywords.ts');
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

test('分析请求保留限频状态和有限重试秒数，不把其他错误当作等待',async()=>{
  for(const [status,header,body,expected] of [[429,'4',9,4],[429,null,3,3],[429,'999',undefined,10],[429,'invalid',undefined,undefined],[429,null,-1,undefined],[429,null,{},undefined],[429,null,null,undefined],[422,'5',5,undefined]]){
    const response=Response.json({message:'验证请求较频繁，请稍后重试',retryAfter:body},{status,headers:header?{'Retry-After':header}:{}});
    const client=loader({},{fetch:async()=>response})('lib/site-analysis-client.ts');
    await assert.rejects(client.siteAnalysisRequest(''),error=>error instanceof client.SiteAnalysisRequestError&&error.status===status&&error.retryAfter===expected);
  }
});

test('域名规范化保留主机范围与协议，拒绝 IP、认证信息、本地名和特殊端口', () => {
  assert.equal(network.normalizeSite('example.co.uk/path?q=1').url, 'https://example.co.uk/'); assert.equal(network.normalizeSite('https://www.example.co.uk').domain, 'example.co.uk');
  assert.equal(network.normalizeSite('https://例子.com').host, 'xn--fsqu00a.com');
  for (const value of ['','127.0.0.1','https://[::1]','http://10.0.0.1','file:///tmp/a','https://user:pass@example.org','https://example.org:8443','https://thing.local','https://example.org\\@localhost','a b']) assert.throws(() => network.normalizeSite(value), undefined, value);
});
test('采集参数限制页面数、关键词、引擎和当前支持设备；等价选项稳定序列化', () => {
  assert.equal(model.analysisOptions({}).maxPages, 20); assert.equal(JSON.stringify(model.analysisOptions({ engines:['bing','baidu','bing'] })), JSON.stringify(model.analysisOptions({ engines:['baidu','bing'] })));
  assert.equal(model.analysisOptions({engines:['google']}).engines[0], 'google');
  for (const value of [{maxPages:5000},{engines:['unknown']},{keywords:['x'.repeat(81)]},{keywords:[42]},{device:'mobile'},{language:'bad'}]) assert.throws(() => model.analysisOptions(value));
});
test('真实 HTML 解析保留标题、关键词、链接和索引声明，正文排除脚本及导航', () => {
  const page = parser.parseSitePage(Buffer.from(html), 'https://example.org/'); assert.equal(page.title, '宇星软件 | 示例网站'); assert.equal(page.language, 'zh-CN'); assert.ok(!page.text.includes('secret keyword')); assert.equal(page.declared.length, 2); assert.ok(page.links.includes('https://example.org/about'));
  const noindex = parser.parseSitePage(Buffer.from('<title>A</title><meta name="robots" content="noindex,nofollow"><link rel="canonical" href="/main">'), 'https://example.org/'); assert.equal(noindex.noindex, true); assert.equal(noindex.canonical, 'https://example.org/main');
});
test('关键词跨来源去重并保留来源，网站声明词不会被直接标成有排名', () => {
  const page = parser.parseSitePage(Buffer.from(html), 'https://example.org/'), rows = parser.extractSiteKeywords([page], ['网站分析','Website SEO']);
  const word = rows.find(w => w.word === '网站分析'); assert.equal(word.kind, 'manual'); assert.ok(word.sources.some(s => s.kind === 'declared')); assert.equal(rows.filter(w => w.word === '网站分析').length, 1); assert.ok(!rows.some(w => w.word === 'secret'));
});

test('关键词优先保留用户与站点声明，再按业务元信息和行业相关度排序，通用高频词降权且不改原始数据', () => {
  const words = ['商品','正在','软件开发','AI获客','ChatGPT','无关话题','站点声明词','指定查询词'].map((word,index)=>({word,kind:index===6?'declared':index===7?'manual':'content',score:index<2?10000:1,sources:[{url:'https://example.org/',kind:index===6?'declared':index===7?'manual':'content'}]}));
  const before=clone(words), context={profile:{title:'企业软件开发',description:'提供AI获客解决方案',industry:'软件与技术'},pages:[{status:200,h1:['AI获客']},{status:200,title:'ChatGPT服务',h1:['ChatGPT']}]};
  const ordered=prioritizeSiteKeywords(words,context), index=word=>ordered.findIndex(item=>item.word===word);
  assert.equal(ordered[0].word,'指定查询词');assert.equal(ordered[1].word,'站点声明词');
  for(const core of ['软件开发','AI获客','ChatGPT'])for(const generic of ['商品','正在','无关话题'])assert.ok(index(core)<index(generic));
  assert.deepEqual(clone(words),before);assert.deepEqual(ordered.map(word=>word.word).sort(),words.map(word=>word.word).sort());assert.equal(ordered.find(word=>word.word==='商品').score,10000);
  const fallback=[{word:'AI',score:100},{word:'platform',score:1}];
  assert.equal(prioritizeSiteKeywords(fallback,{profile:{title:'Email platform',industry:'constructor'}})[0].word,'platform');
  assert.equal(prioritizeSiteKeywords([{word:'说明',score:10000},{word:'课程',score:1}],{profile:{industry:'教育培训'}})[0].word,'课程');
  assert.deepEqual(prioritizeSiteKeywords([{word:'First'},{word:'Second'}]).map(word=>word.word),['First','Second']);
});

test('关键词截取前先按站点业务排序，重复页面正文不能挤掉核心词，仍保留200条上限与真实来源', () => {
  const boilerplate=Array.from({length:260},(_,index)=>`candidate${index}`).join(' '), pages=[];
  for(let index=0;index<5;index++)pages.push(parser.parseSitePage(Buffer.from(`<html><head><title>${index===0?'ChatGPT':''}</title></head><body><main>${Array(5).fill(boilerplate+' 商品 正在 说明').join(' ')}</main></body></html>`),`https://example.org/${index}`));
  const rows=parser.extractSiteKeywords(pages,[],{title:'ChatGPT',description:'',industry:'软件与技术'});
  assert.equal(rows.length,200);assert.equal(rows[0].word,'ChatGPT');assert.ok(rows[0].sources.some(source=>source.url==='https://example.org/0'));assert.equal(rows[0].kind,'content');
  assert.ok(rows.some(word=>word.score>rows[0].score));
});
test('网站采集完成基础报告，限制同源范围并保存缺省注册主体状态', async () => {
  const f = fakeIO(), snapshots = [], report = await collector.collectSiteReport('example.org', model.analysisOptions({maxPages:5}), async (value, progress) => snapshots.push({ value: clone(value), progress }), f.io);
  assert.equal(report.pages.length, 2); assert.equal(report.profile.registrar, 'Registrar'); assert.equal(report.profile.registrant, ''); assert.equal(report.profile.registeredAt, '2020-01-01T00:00:00Z'); assert.ok(report.keywords.length); assert.equal(report.engines.find(e => e.id === 'google').state, 'skipped'); assert.ok(!f.requests.some(url => /external|internal|\/admin/.test(url))); assert.equal(snapshots.at(-1).progress,95); assert.equal(report.stages.find(s=>s.key==='pages').state,'complete');
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

test('首页跳转到www规范域后重新核对robots，正常采集档案，跨站和最终禁止抓取不解析内容', async () => {
  for (const mode of ['allowed','blocked','external']) {
    const f=searchIO(), original=f.io.request;
    f.io.request=async raw=>{const result=await original(raw), url=new URL(raw);if(raw==='https://example.org/')result.url=mode==='external'?'https://other.org/':'https://www.example.org/';if(url.host==='www.example.org'&&url.pathname==='/robots.txt')result.bytes=Buffer.from(mode==='blocked'?'User-agent: *\nDisallow: /':'User-agent: *\nAllow: /');return result;};
    const report=await collector.collectSiteReport('example.org',model.analysisOptions({maxPages:5,engines:[]}),async()=>{},f.io);
    if(mode==='allowed'){assert.equal(report.profile.title,'RankProbe');assert.equal(report.profile.finalUrl,'https://www.example.org/');assert.equal(report.pages.length,1);assert.ok(f.requests.includes('https://www.example.org/robots.txt'));}
    else {assert.equal(report.pages.length,0);assert.equal(report.profile.title,'');assert.equal(report.stages.find(s=>s.key==='pages').state,'failed');}
    if(mode==='external')assert.ok(!f.requests.some(url=>url.includes('other.org')));
  }
});

test('静态title和描述先写入进度，动态渲染空元信息或验证页不覆盖已读数据', async () => {
  for(const challenge of [false,true]) {
    const f=searchIO(), original=f.io.request, snapshots=[];
    f.io.request=async raw=>{const result=await original(raw);if(raw==='https://example.org/')result.bytes=Buffer.from('<html><head><title>静态网站名</title><meta name="description" content="静态描述"><meta name="keywords" content="原始关键词"><meta name="googlebot" content="noindex"></head><body><script src="/app.js"></script></body></html>');return result;};
    f.io.render=async()=>{assert.ok(snapshots.some(r=>r.profile.title==='静态网站名'&&r.pages.length===1));return Buffer.from(challenge?'<title>安全验证</title>':'<html><body><main>Rendered content for a working website.</main></body></html>');};
    const report=await collector.collectSiteReport('example.org',model.analysisOptions({maxPages:5,engines:[]}),async draft=>snapshots.push(clone(draft)),f.io);
    assert.equal(report.profile.title,'静态网站名');assert.equal(report.profile.description,'静态描述');assert.equal(report.pages[0].declared[0],'原始关键词');assert.equal(report.engines.find(e=>e.id==='google').htmlIndexAllowed,false);
    if(challenge)assert.ok(report.issues.some(i=>i.code==='dynamic'));
  }
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

function engineHtml(engine, target = true) {
  const urls = Array.from({length:10}, (_, i) => i === 2 && target ? 'https://example.org/article' : `https://competitor${i}.org/`);
  if (engine === 'google') return '<div id="search"><div id="rso">' + urls.map(url => `<div><a href="${url}"><h3>Result</h3></a></div>`).join('') + '</div></div>';
  if (engine === 'duckduckgo') return urls.map(url => `<article data-testid="result"><h2><a data-testid="result-title-a" href="${url}">Result</a></h2></article>`).join('');
  if (engine === 'yandex') return '<ul class="serp-list">'+urls.map(url => `<li class="serp-item"><div class="Organic"><h2><a class="OrganicTitle-Link" href="${url}">Result</a></h2></div></li>`).join('')+'</ul>';
  if (engine === 'bing') return '<ol id="b_results">' + urls.map(url => `<li class="b_algo"><h2><a href="${url}">Result</a></h2></li>`).join('') + '</ol>';
  return '<div id="content_left">' + urls.map(url => `<div class="result" mu="${url}"><h3><a href="https://www.baidu.com/link?opaque">Result</a></h3></div>`).join('') + '</div>';
}
function searchIO({blocked = [], broken = [], challenge = [], forbidden = []} = {}) {
  const requests = [], io = fakeIO().io;
  io.request = async raw => {
    requests.push(raw); const url = new URL(raw), engine = model.engineDefinitions.find(row => new URL(model.engineSearchUrl(row.id, '')).host === url.host)?.id;
    if (engine && broken.includes(engine)) throw Error('mock source unavailable');
    const rules = url.pathname === '/robots.txt', status = url.pathname === '/sitemap.xml' ? 404 : engine && !rules && forbidden.includes(engine) ? 403 : 200;
    const body = rules ? engine && challenge.includes(engine) ? '<html><title>安全验证</title></html>' : engine && blocked.includes(engine) ? 'User-agent: *\nDisallow: /' : 'User-agent: *\nDisallow:' : engine ? engineHtml(engine) : '<html><title>RankProbe</title><body>RankProbe</body></html>';
    return {url:raw,status,bytes:Buffer.from(body),contentType:rules?'text/plain':'text/html'};
  };
  return {io,requests};
}

test('五个引擎的选项、查询地址、品牌图标和等待状态一致，显式空选项保持原基础采集兼容', () => {
  const ids = model.engineDefinitions.map(e=>e.id), options = model.analysisOptions({engines:ids});
  assert.deepEqual(clone(options.engines), ['baidu','bing','duckduckgo','google','yandex']);
  for(const engine of model.engineDefinitions){const icon=readFileSync(new URL('public'+engine.icon,root));assert.deepEqual([...icon.subarray(0,4)],[0,0,1,0]);assert.ok(icon.length>100);}
  const pending = collector.blankReport('example.org', options);assert.ok(pending.engines.every(e=>e.state==='pending'&&e.checkedAt===''&&e.hits===null));
  const disabled = collector.blankReport('example.org', model.analysisOptions({engines:[]}));assert.ok(disabled.engines.every(e=>e.state==='skipped'));
  for (const id of ids) { const source = new URL(model.engineSearchUrl(id,'site:example.org AI & 工具','en'));assert.equal(source.searchParams.get(id==='baidu'?'wd':id==='yandex'?'text':'q'),'site:example.org AI & 工具');assert.equal(source.protocol,'https:'); }
});

test('Google自然结果解析排除广告、解包公开跳转；不足结果、验证和不明前序地址不会编造排名', () => {
  const source = model.engineSearchUrl('google','RankProbe'), parse = body => parser.parseSearchResults('google',Buffer.from(body),source,'RankProbe','example.org');
  const good = engineHtml('google');assert.equal(parse(good).state,'found');assert.equal(parse(good).position,3);
  assert.equal(parse(good.replace('https://example.org/article','https://www.google.com/url?q=https%3A%2F%2Fexample.org%2Farticle')).position,3);
  assert.equal(parse(good.replace('<div id="rso">','<div id="rso"><div data-text-ad="1"><a href="https://example.org/ad"><h3>Ad</h3></a></div>')).position,3);
  assert.equal(parse(engineHtml('google',false)).state,'not_found');
  assert.equal(parse('<div id="rso"><a href="https://competitor.org/"><h3>Only one</h3></a></div>').state,'failed');
  assert.equal(parse(good.replace('https://competitor0.org/','/url?opaque')).state,'failed');
  assert.equal(parse('<title>Before you continue to Google</title>').state,'restricted');
});

test('DuckDuckGo与Yandex解析自然结果、广告和公开跳转，验证或不明地址不编造排名',()=>{
  for(const engine of ['duckduckgo','yandex']){
    const source=model.engineSearchUrl(engine,'RankProbe'), parse=body=>parser.parseSearchResults(engine,Buffer.from(body),source,'RankProbe','example.org');
    const good=engineHtml(engine);assert.equal(parse(good).position,3);assert.equal(parse(engineHtml(engine,false)).state,'not_found');
    const ad=engine==='duckduckgo'?'<article data-testid="result" data-layout="ad"><a data-testid="result-title-a" href="https://example.org/ad">Ad</a></article>':'<li class="serp-item serp-item_type_ad"><a class="OrganicTitle-Link" href="https://example.org/ad">Ad</a></li>';
    assert.equal(parse(ad+good).position,3);
    assert.equal(parse(good.replace('https://competitor0.org/',engine==='duckduckgo'?'/l/?opaque':'https://yandex.com/clck/opaque')).state,'failed');
    assert.equal(parse(good.replace('https://competitor0.org/','javascript:alert(1)')).state,'failed');
    assert.equal(parse('<title>Подтвердите, что вы не робот</title>').state,'restricted');
    assert.equal(parse('<form action="/anomaly.js"><input name="answer"></form>').state,'restricted');
    assert.equal(parse('<html><script src="/search.js"></script><body>Loading</body></html>').state,'failed');
    if(engine==='duckduckgo')assert.equal(parse(good.replace('https://example.org/article','//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Farticle')).position,3);
  }
});

test('新引擎遵守各自查询路径规则，HTTP202验证挑战保留受限状态并继续其他引擎',async()=>{
  const f=searchIO(), read=f.io.request;
  f.io.request=async raw=>{const response=await read(raw),url=new URL(raw);if(url.hostname==='duckduckgo.com'&&url.pathname==='/robots.txt')response.bytes=Buffer.from('User-agent: *\nDisallow: /html\nDisallow: /lite\nDisallow: /*?\nAllow: /?*');if(url.hostname==='duckduckgo.com'&&url.searchParams.has('q')){response.status=202;response.bytes=Buffer.from('<form action="/anomaly.js"></form>');}return response;};
  const report=await collector.collectSiteReport('example.org',model.analysisOptions({maxPages:5,engines:['duckduckgo','yandex']}),async()=>{},f.io);
  assert.equal(report.engines.find(e=>e.id==='duckduckgo').state,'restricted');assert.equal(report.engines.find(e=>e.id==='duckduckgo').hits,null);
  assert.equal(report.engines.find(e=>e.id==='yandex').state,'complete');assert.ok(f.requests.some(raw=>raw.startsWith('https://duckduckgo.com/?q=')));assert.ok(!f.requests.some(raw=>/duckduckgo.com\/(html|lite)/.test(raw)));
});

test('新引擎目标站规则分别使用DuckDuckBot与YandexBot，Yandex元指令和通用noindex正确保存',async()=>{
  const f=searchIO(), read=f.io.request;f.io.request=async raw=>{const response=await read(raw),url=new URL(raw);if(url.host==='example.org'&&url.pathname==='/robots.txt')response.bytes=Buffer.from('User-agent: DuckDuckBot\nDisallow: /\nUser-agent: *\nAllow: /');if(url.host==='example.org'&&url.pathname==='/')response.bytes=Buffer.from('<html><title>RankProbe</title><meta name="yandex" content="noindex"><body>RankProbe</body></html>');return response;};
  const report=await collector.collectSiteReport('example.org',model.analysisOptions({maxPages:5,engines:[]}),async()=>{},f.io);
  assert.equal(report.engines.find(e=>e.id==='duckduckgo').siteRobotsAllowed,false);assert.equal(report.engines.find(e=>e.id==='yandex').siteRobotsAllowed,true);assert.equal(report.engines.find(e=>e.id==='yandex').htmlIndexAllowed,false);assert.equal(report.engines.find(e=>e.id==='duckduckgo').htmlIndexAllowed,true);
  assert.ok(parser.parseSitePage(Buffer.from('<meta name="robots" content="noindex">'),'https://example.org/').noindex);
});

test('同一报告执行五个引擎并保存真实查询、排名、检查时间和分阶段状态', async () => {
  const f=searchIO(), snapshots=[], options=model.analysisOptions({maxPages:5,engines:model.engineDefinitions.map(e=>e.id)});
  const report=await collector.collectSiteReport('example.org',options,async draft=>snapshots.push(clone(draft)),f.io);
  assert.equal(report.rankings.length,5);assert.ok(report.engines.every(e=>e.state==='complete'&&e.queried===1&&e.hits===1&&e.top10===1&&e.checkedAt));
  assert.ok(report.rankings.every(r=>r.state==='found'&&r.position===3&&r.source.startsWith('https://')));
  assert.ok(snapshots.some(r=>r.engines.find(e=>e.id==='google').state==='running'));
  assert.ok(f.requests.some(url=>url.startsWith('https://www.google.com/search?')));
  assert.ok(report.stages.filter(s=>s.key.startsWith('engine:')).every(s=>s.state==='complete'));
});

test('重点关键词按输入顺序优先查询，去重并限制五个，留空使用自动候选词', async () => {
  for (const words of [[], ['自定义重点', 'RankProbe'], ['词一','词二','词三','词四','词五','词六']]) {
    const f=searchIO(), options=model.analysisOptions({maxPages:5,engines:['bing'],keywords:words});
    const report=await collector.collectSiteReport('example.org',options,async()=>{},f.io);
    const queried=f.requests.filter(raw=>new URL(raw).pathname==='/search').map(raw=>new URL(raw).searchParams.get('q'));
    assert.deepEqual(queried,[...new Set([...words,...report.keywords.map(k=>k.word)])].slice(0,5));
    assert.ok(queried.length<=5);assert.equal(new Set(queried).size,queried.length);
    if(words.length)assert.equal(queried[0],words[0]);else assert.equal(queried[0],'RankProbe');
  }
});

test('五个引擎遵守禁止规则，受限记录检查时间但不发送搜索、不填零排名', async () => {
  const f=searchIO({blocked:model.engineDefinitions.map(e=>e.id)}), report=await collector.collectSiteReport('example.org',model.analysisOptions({maxPages:5,engines:model.engineDefinitions.map(e=>e.id)}),async()=>{},f.io);
  assert.ok(report.engines.every(e=>e.state==='restricted'&&e.queried===0&&e.hits===null&&e.top10===null&&e.checkedAt));
  assert.equal(report.rankings.length,0);assert.equal(f.requests.filter(url=>url.includes('www.')&&!url.endsWith('/robots.txt')).length,0);
  assert.ok(report.engines.every(e=>e.message.includes('robots')));
  assert.ok(report.engines.every(e=>e.siteRobotsAllowed===true&&e.htmlIndexAllowed===true&&e.siteCheckedAt));
});

test('即使未选排名查询也采集网站对各引擎的抓取许可和HTML索引声明，不当成已收录', async () => {
  const f=searchIO(), original=f.io.request;
  f.io.request=async raw=>{const result=await original(raw), url=new URL(raw);if(url.hostname==='example.org')result.bytes=Buffer.from(url.pathname==='/robots.txt'?'User-agent: Googlebot\nDisallow: /\nUser-agent: *\nAllow: /':url.pathname==='/'?'<html><head><title>RankProbe</title><meta name="googlebot" content="noindex"></head><body>RankProbe</body></html>':result.bytes);return result;};
  const report=await collector.collectSiteReport('example.org',model.analysisOptions({maxPages:5,engines:[]}),async()=>{},f.io), google=report.engines.find(e=>e.id==='google');
  assert.equal(google.siteRobotsAllowed,false);assert.equal(google.htmlIndexAllowed,false);assert.equal(google.state,'skipped');assert.equal(google.top10,null);
  assert.ok(report.engines.filter(e=>e.id!=='google').every(e=>e.siteRobotsAllowed&&e.htmlIndexAllowed));assert.ok(!f.requests.some(url=>url.includes('www.')));
  const repeated=parser.parseSitePage(Buffer.from('<meta name="robots" content="index"><meta name="ROBOTS" content="NOINDEX,follow">'),'https://example.org/');assert.equal(repeated.noindex,true);
  assert.equal(parser.parseSitePage(Buffer.from('<meta name="robots" content="none">'),'https://example.org/').noindex,true);
});

test('单引擎故障、规则验证页和搜索403分别记因，后续引擎继续执行', async () => {
  const f=searchIO({broken:['baidu'],challenge:['bing']}), report=await collector.collectSiteReport('example.org',model.analysisOptions({maxPages:5,engines:['baidu','bing','google']}),async()=>{},f.io);
  assert.equal(report.engines.find(e=>e.id==='baidu').state,'failed');assert.equal(report.engines.find(e=>e.id==='bing').state,'restricted');assert.equal(report.engines.find(e=>e.id==='google').state,'complete');
  const denied=searchIO({forbidden:['google']}), next=await collector.collectSiteReport('example.org',model.analysisOptions({maxPages:5,engines:['google']}),async()=>{},denied.io);
  assert.equal(next.engines.find(e=>e.id==='google').state,'restricted');assert.equal(next.engines.find(e=>e.id==='google').top10,null);
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

function fixture({chargeType='free',balance=300,failTable='',registered=true,verified=true,deleted=false}={}) {
  let state={users:[{id:1,phone:'13800000000',status:'active'},{id:2,phone:'13900000000',status:'active'}],products:[{id:50,name:'站长分析工具',tool_slug:'webmaster-tools',tool_charge_type:chargeType,tool_points_cost:10}],orders:[],points_wallets:[{user_id:1,balance}],points_ledger:[],tool_usage_events:[],site_analysis_sites:registered?[{id:otherId,user_id:1,host:'example.org',url:'https://example.org/',updated_at:'2026-01-01'}]:[],site_analysis_visits:[],site_analysis_integrations:registered?[{site_id:otherId,user_id:1,verify_requested_at:'',script_token:'a'.repeat(64),verified_at:verified?'2026-01-01':'',deleted_at:deleted?'2026-01-02':'',last_seen_at:''}]:[],site_analysis_runs:[],site_analysis_reports:[],site_analysis_pages:[],site_analysis_keywords:[],site_analysis_rankings:[],site_analysis_events:[],site_analysis_workers:[],site_analysis_issue_actions:[]};
  const queries=[];let gate=Promise.resolve();
  const DB={prepare(sql){let args=[],expected;
    const execute=async()=>{
      assert.equal((sql.match(/\?/g)||[]).length,args.length,sql);queries.push({sql,args:clone(args)});
      if(sql.startsWith('INSERT INTO ')||sql.startsWith('INSERT IGNORE INTO ')){
        const match=/INSERT (?:IGNORE )?INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\)/.exec(sql);assert.ok(match,sql);const[,table,cols,values]=match;
        if(table===failTable)throw Error('mock write failure');let cursor=0;const record=Object.fromEntries(cols.split(',').map((key,i)=>{const token=values.split(',')[i].trim();return[key.trim(),token==='?'?args[cursor++]:token.startsWith("'")?token.slice(1,-1):Number(token)];}));
        if(table==='site_analysis_visits'&&state[table].some(r=>r.site_id===record.site_id&&r.event_id===record.event_id))return{affectedRows:0};
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
         }else if(table==='site_analysis_sites'){
          rows=rows.filter(r=>r.user_id===args[0]&&(!sql.includes('host=?')||r.host===args[1])&&(!sql.includes('s.id=?')||r.id===args[1])).map(r=>{const i=state.site_analysis_integrations.find(i=>i.site_id===r.id)||{};return{...r,scriptToken:i.script_token||'',verifiedAt:i.verified_at||'',deletedAt:i.deleted_at||'',lastSeenAt:i.last_seen_at||'',updatedAt:r.updated_at};});
          if(sql.includes("i.deleted_at=''" )||sql.includes("COALESCE(i.deleted_at,'')=''"))rows=rows.filter(r=>!r.deletedAt);
          if(sql.includes("i.verified_at<>''"))rows=rows.filter(r=>r.verifiedAt);
        }
        else if(table==='site_analysis_integrations'){
          if(sql.startsWith('SELECT verify_requested_at AS requestedAt'))rows=rows.filter(r=>r.site_id===args[0]&&r.user_id===args[1]&&r.script_token===args[2]&&!r.deleted_at).map(r=>({requestedAt:r.verify_requested_at}));
          else rows=rows.filter(r=>(sql.includes('WHERE i.site_id=?')?r.site_id===args[0]:r.script_token===args[0])&&!r.deleted_at&&state.users.some(u=>u.id===r.user_id&&u.status==='active')).map(r=>({...r,host:state.site_analysis_sites.find(s=>s.id===r.site_id)?.host}));
        }
        else if(table==='site_analysis_visits'){
          rows=rows.filter(r=>r.site_id===args[0]&&(sql.includes('session_key=?')?r.session_key===args[1]:r.created_at>=args[1]));if(sql.startsWith('SELECT channel FROM'))return rows.slice(0,1);
          if(sql.includes('GROUP BY')){const field=sql.includes('GROUP BY channel')?'channel':'country_code',groups=new Map();for(const row of rows){if(!groups.has(row[field]))groups.set(row[field],new Set());groups.get(row[field]).add(row.session_key);}return [...groups].map(([key,sessions])=>({[field==='channel'?'channel':'code']:key,visits:sessions.size}));}
          return[{pageviews:rows.length,sessions:new Set(rows.map(r=>r.session_key)).size}];
        }
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
      if(sql.startsWith('UPDATE site_analysis_integrations')){
        const restoring=sql.includes("SET verified_at='',verify_requested_at=''");
        const index=sql.includes('SET verify_requested_at=')||restoring?1:2,row=state.site_analysis_integrations.find(r=>r.site_id===args[index]&&(sql.includes('AND user_id=?')?r.user_id===args[index+1]:true));
        if(!row)return{affectedRows:0};
        if(sql.includes('SET verify_requested_at=')){if(row.deleted_at||row.script_token!==args[3]||!(row.verify_requested_at<args[4]))return{affectedRows:0};row.verify_requested_at=args[0];}
        else if(restoring)Object.assign(row,{updated_at:args[0],verified_at:'',verify_requested_at:'',deleted_at:''});
        else if(sql.includes('SET deleted_at='))Object.assign(row,{deleted_at:args[0],verified_at:'',updated_at:args[1]});
        else if(sql.includes('SET verified_at=')){if(row.deleted_at||row.script_token!==args[4]||row.verify_requested_at!==args[5])return{affectedRows:0};Object.assign(row,{verified_at:args[0],updated_at:args[1]});}
        else if(sql.includes('SET last_seen_at=')){if(row.deleted_at||row.script_token!==args[3])return{affectedRows:0};Object.assign(row,{last_seen_at:args[0],updated_at:args[1]});}
        else throw Error('Unknown integration update');return{affectedRows:1};
      }
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
  const service=modules('lib/site-analysis-service.ts');mocks['@/lib/site-analysis-service']=service;mocks['@/lib/site-analysis']=modules('lib/site-analysis.ts');mocks['@/lib/site-management-service']=modules('lib/site-management-service.ts');const route=modules('app/api/tools/site-analysis/route.ts');
  const request=({user=1,body,query='?tool=50',headers={}}={})=>new Request('https://shop.example/api/tools/site-analysis'+query,{method:body===undefined?'GET':'POST',headers:{...(user?{cookie:`mall_session=${encodeURIComponent(setup.createMallSession(user===1?'13800000000':'13900000000'))}`} : {}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const body=(overrides={})=>({id,tool:50,domain:'example.org',options:{maxPages:5},...overrides});
  const collect=async(url,options,progress)=>{const result=collector.blankReport(network.normalizeSite(url).host,options);result.pages=[parser.parseSitePage(Buffer.from(html),'https://example.org/')];result.keywords=parser.extractSiteKeywords(result.pages,[]);result.stages=[{key:'pages',state:'complete',message:'ok',at:new Date().toISOString()}];result.issues=[{code:'description',severity:'medium',title:'页面缺少描述',url:'https://example.org/about',advice:'检查描述'}];result.coverage={discovered:1,fetched:1,limited:false};await progress(result,90);return result;};
  const management=modules('lib/site-management-service.ts'),tracking=modules('lib/site-tracking.ts');mocks['@/lib/site-tracking']=tracking;const trackerRoute=modules('app/api/site-tracker/[token]/route.ts');
  const shortRoute=modules('app/s/[token]/route.ts');
  return{service,management,tracking,trackerRoute,shortRoute,route,request,body,queries,state:()=>state,collect};
}
test('匿名、伪造 Cookie 和停用用户不能创建或读取个人任务', async()=>{
  const f=fixture();assert.equal((await f.route.GET(f.request({user:0}))).status,200);assert.equal((await(await f.route.GET(f.request({user:0}))).json()).authenticated,false);
  assert.equal((await f.route.POST(f.request({user:0,body:f.body()}))).status,401);assert.equal((await f.route.POST(f.request({body:f.body(),headers:{cookie:'mall_session=fake'}}))).status,401);
  f.state().users[0].status='disabled';assert.equal((await f.route.POST(f.request({body:f.body()}))).status,401);assert.equal(f.state().site_analysis_runs.length,0);
});
test('任务只使用已验证配置站点；相同请求幂等、并发提交复用活动任务、改参数复用编号被拒绝',async()=>{
  const f=fixture();const first=await f.route.POST(f.request({body:f.body({userId:2})}));assert.equal(first.status,202);assert.equal(f.state().site_analysis_runs[0].user_id,1);assert.equal(f.state().site_analysis_sites.length,1);
  await Promise.all([f.route.POST(f.request({body:f.body()})),f.route.POST(f.request({body:f.body({id:otherId})}))]);assert.equal(f.state().site_analysis_runs.length,1);
  assert.equal((await f.route.POST(f.request({body:f.body({domain:'other.org'})}))).status,409);assert.equal(f.state().points_ledger.length,0);
});

test('未配置、未验证、已删除或属于其他账号的站点不能提交新分析，既有历史仍按账号读取',async()=>{
  for(const options of [{registered:false},{verified:false},{deleted:true}]){
    const f=fixture(options),response=await f.route.POST(f.request({body:f.body()}));assert.equal(response.status,403);assert.equal(f.state().site_analysis_runs.length,0);assert.equal(f.state().points_ledger.length,0);
  }
  const foreign=fixture();assert.equal((await foreign.route.POST(foreign.request({user:2,body:foreign.body()}))).status,403);
  const f=fixture();await f.route.POST(f.request({body:f.body()}));f.state().site_analysis_integrations[0].deleted_at='2026-01-02';
  assert.equal((await f.route.GET(f.request({query:'?tool=50&run='+id}))).status,200);assert.equal((await f.route.POST(f.request({body:f.body()}))).status,202);
  const workspace=await(await f.route.GET(f.request())).json();assert.equal(workspace.sites.length,0);assert.equal(workspace.history.length,1);
});

test('站点需显式添加且脚本唯一，重复添加复用配置；跨账号隔离，失败回滚，不触发分析或收费',async()=>{
  const f=fixture({registered:false}), add=domain=>f.route.POST(f.request({body:{tool:50,action:'site-add',domain,userId:2}}));
  const first=await add('example.org');assert.equal(first.status,201);const a=(await first.json()).site;
  assert.match(a.scriptToken,/^[a-f0-9]{64}$/);assert.equal(a.verifiedAt,'');assert.equal(f.state().site_analysis_sites[0].user_id,1);
  const b=(await(await add('other.org')).json()).site;assert.notEqual(a.scriptToken,b.scriptToken);assert.notEqual(a.id,b.id);
  const again=(await(await add('https://example.org/')).json()).site;assert.equal(again.id,a.id);assert.equal(again.scriptToken,a.scriptToken);
  assert.equal(f.state().site_analysis_runs.length,0);assert.equal(f.state().points_ledger.length,0);
  assert.equal((await f.route.POST(f.request({user:2,body:{tool:50,action:'site-delete',site:a.id}}))).status,404);
  assert.equal((await f.route.POST(f.request({user:0,body:{tool:50,action:'site-add',domain:'fresh.org'}}))).status,401);
  assert.equal((await f.route.POST(f.request({body:{tool:50,action:'site-add',domain:'fresh.org'},headers:{origin:'https://evil.example'}}))).status,403);
  for(const domain of ['127.0.0.1','http://thing.local','https://user:password@example.org'])assert.equal((await add(domain)).status,400);
  const broken=fixture({registered:false,failTable:'site_analysis_integrations'});assert.equal((await broken.route.POST(broken.request({body:{tool:50,action:'site-add',domain:'example.org'}}))).status,503);assert.equal(broken.state().site_analysis_sites.length,0);
});

test('每个域名永久保留原脚本，并发重复生成与旧站点补生成都只保存一次且不改变验证结果',async()=>{
  const f=fixture({registered:false}),rows=await Promise.all(Array.from({length:5},()=>f.management.registerAnalysisSite(1,'example.org')));
  assert.equal(new Set(rows.map(row=>row.scriptToken)).size,1);assert.equal(f.state().site_analysis_integrations.length,1);
  const token=rows[0].scriptToken,read=async()=>({url:'https://example.org/',status:200,contentType:'text/html',bytes:Buffer.from(`<script src="https://shop.example/api/site-tracker/${token}"></script>`)});
  const verified=await f.management.verifyAnalysisSite(1,rows[0].id,'https://shop.example',read),queries=f.queries.length;
  for(let n=0;n<3;n++){const repeated=await f.management.registerAnalysisSite(1,'example.org');assert.equal(repeated.scriptToken,token);assert.equal(repeated.verifiedAt,verified.verifiedAt);}
  assert.ok(!f.queries.slice(queries).some(row=>/^(INSERT|UPDATE) /.test(row.sql)));
  const legacy=fixture({verified:false});legacy.state().site_analysis_integrations=[];
  const first=await legacy.management.registerAnalysisSite(1,'example.org'),again=await legacy.management.registerAnalysisSite(1,'example.org');
  assert.equal(first.id,otherId);assert.match(first.scriptToken,/^[a-f0-9]{64}$/);assert.equal(again.scriptToken,first.scriptToken);assert.equal(legacy.state().site_analysis_integrations.length,1);
});

test('唯一脚本由服务器读取真实script元素验证；注释、模板、其他站点脚本和跨域跳转不能证明归属',async()=>{
  for(const kind of ['valid','comment','template','noscript','text','foreign-token','foreign-origin','dormant','redirect']){
    const f=fixture({registered:false}),site=await f.management.registerAnalysisSite(1,'example.org'),src='https://shop.example'+f.management.scriptPath(site.scriptToken);
    const tag=`<script async src="${src}"></script>`,html=kind==='comment'?`<!--${tag}-->`:kind==='template'?`<template>${tag}</template>`:kind==='noscript'?`<noscript>${tag}</noscript>`:kind==='text'?`<script>const text=${JSON.stringify(tag)};</script>`:kind==='foreign-token'?tag.replace(site.scriptToken,'b'.repeat(64)):kind==='foreign-origin'?tag.replace('shop.example','evil.example'):kind==='dormant'?tag.replace('async','type="application/json"'):tag;
    const read=async(url,signal,limit)=>{assert.equal(url,'https://example.org/');assert.ok(signal instanceof AbortSignal);assert.equal(limit,1024*1024);return{url:kind==='redirect'?'https://other.org/':url,status:200,contentType:'text/html',bytes:Buffer.from(html)};};
    if(kind==='valid'){const verified=await f.management.verifyAnalysisSite(1,site.id,'https://shop.example',read);assert.ok(verified.verifiedAt);assert.equal((await f.route.POST(f.request({body:f.body()}))).status,202);}
    else {await assert.rejects(f.management.verifyAnalysisSite(1,site.id,'https://shop.example',read),error=>error.status===422);assert.equal(f.state().site_analysis_integrations[0].verified_at,'');}
    assert.equal(f.state().points_ledger.length,0);
    await assert.rejects(f.management.verifyAnalysisSite(2,site.id,'https://shop.example',read),error=>error.status===404);
  }
});

test('本地发起验证也识别固定线上短脚本，仍兼容原长脚本，其他站点或来源的短脚本不通过',async()=>{
  for(const kind of ['short','long','other-site','other-origin']){
    const f=fixture(),url=kind==='short'?siteScripts.siteScriptUrl(otherId):kind==='long'?'https://www.yxstar.shop/api/site-tracker/'+'a'.repeat(64):kind==='other-site'?siteScripts.siteScriptUrl(id):siteScripts.siteScriptUrl(otherId).replace('www.yxstar.shop','other.example');
    const read=async()=>({url:'https://example.org/',status:200,contentType:'text/html',bytes:Buffer.from(`<script async src="${url}"></script>`)});
    if(kind==='short'||kind==='long'){const site=await f.management.verifyAnalysisSite(1,otherId,'http://localhost:3000',read);assert.ok(site.verifiedAt);assert.equal(site.scriptToken,'a'.repeat(64));}
    else await assert.rejects(f.management.verifyAnalysisSite(1,otherId,'http://localhost:3000',read),error=>error.status===422);
  }
});

test('验证冷却限制与删除竞态不会把已删除或重建站点重新标为已验证',async()=>{
  const f=fixture(),read=async()=>({url:'https://example.org/',status:200,contentType:'text/html',bytes:Buffer.from(`<script src="https://shop.example/api/site-tracker/${'a'.repeat(64)}"></script>`)});
  await f.management.verifyAnalysisSite(1,otherId,'https://shop.example',read);
  await assert.rejects(f.management.verifyAnalysisSite(1,otherId,'https://shop.example',read),error=>error.status===429);
  f.state().site_analysis_integrations[0].verify_requested_at='';
  const race=async()=>{await f.management.deleteAnalysisSite(1,otherId);return read();};
  await assert.rejects(f.management.verifyAnalysisSite(1,otherId,'https://shop.example',race),error=>error.status===409);assert.ok(f.state().site_analysis_integrations[0].deleted_at);
  const restored=await f.management.registerAnalysisSite(1,'example.org');assert.equal(restored.scriptToken,'a'.repeat(64));
  const recreate=async()=>{await f.management.deleteAnalysisSite(1,otherId);await f.management.registerAnalysisSite(1,'example.org');return read();};
  await assert.rejects(f.management.verifyAnalysisSite(1,otherId,'https://shop.example',recreate),error=>error.status===409);
  assert.equal(f.state().site_analysis_integrations[0].verified_at,'');assert.equal(f.state().site_analysis_integrations[0].deleted_at,'');
  const verified=await f.management.verifyAnalysisSite(1,otherId,'https://shop.example',read);assert.ok(verified.verifiedAt);assert.equal(verified.scriptToken,restored.scriptToken);
});

test('验证限频回执携带剩余间隔且不读取首页，过期可重试；异常状态不会误报为限频',async()=>{
  const f=fixture({verified:false});let reads=0;
  const read=async()=>{reads++;return{url:'https://example.org/',status:200,contentType:'text/html',bytes:Buffer.from(siteScripts.siteScriptSnippet(otherId))};};
  await f.management.verifyAnalysisSite(1,otherId,'https://shop.example',read);
  const row=f.state().site_analysis_integrations[0];
  for(const suffix of ['', '#0123456789ab']){
    row.verify_requested_at=new Date(Date.now()-7000).toISOString()+suffix;
    const failure=await f.management.verifyAnalysisSite(1,otherId,'https://shop.example',read).then(()=>assert.fail('Cooldown must reject'),error=>error);
    assert.equal(failure.status,429);assert.ok(failure.retryAfter>=1&&failure.retryAfter<=3);assert.equal(reads,1);
    const response=f.service.analysisFailure(failure);assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),String(failure.retryAfter));assert.equal((await response.json()).retryAfter,failure.retryAfter);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
    assert.ok(row.verified_at);
  }
  const limited=await f.route.POST(f.request({body:{tool:50,action:'site-verify',site:otherId}}));assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),String((await limited.json()).retryAfter));assert.equal(reads,1);
  row.verify_requested_at=new Date(Date.now()-11000).toISOString()+'#0123456789ab';
  assert.ok((await f.management.verifyAnalysisSite(1,otherId,'https://shop.example',read)).verifiedAt);assert.equal(reads,2);
  row.verify_requested_at='invalid';
  await assert.rejects(f.management.verifyAnalysisSite(1,otherId,'https://shop.example',read),error=>error.status===409&&!error.retryAfter);assert.equal(reads,2);
});

test('访问上报不能验证站点，校验域名和事件大小，匿名脚本不依赖商城会话且不泄露统计',async()=>{
  const f=fixture({verified:false}),token='a'.repeat(64),context={params:Promise.resolve({token})};
  const payload={id:'visit-event-00000001',session:'anonymous-session-0001',page:'https://example.org/page?private=secret#fragment',referrer:'https://mail.google.com/inbox?secret=1',medium:''};
  const post=(body=payload,origin='https://example.org')=>f.trackerRoute.POST(new Request('https://shop.example/api/site-tracker/'+token,{method:'POST',headers:{origin,'content-type':'text/plain'},body:JSON.stringify(body)}),context);
  assert.equal((await f.trackerRoute.GET(new Request('https://shop.example/api/site-tracker/'+token),context)).status,200);
  assert.equal((await post()).status,403);assert.equal(f.state().site_analysis_integrations[0].verified_at,'');assert.equal(f.state().site_analysis_visits.length,0);
  f.state().site_analysis_integrations[0].verified_at='2026-01-01';
  assert.equal((await post(payload,'https://evil.org')).status,403);assert.equal((await post({...payload,page:'https://other.org/'})).status,403);assert.equal((await post(payload,'null')).status,403);
  assert.equal((await post({...payload,id:'x'.repeat(5000)})).status,413);
  const response=await post();assert.equal(response.status,204);assert.equal(response.headers.get('access-control-allow-origin'),'https://example.org');assert.equal(response.headers.get('access-control-allow-credentials'),null);
  assert.equal((await f.route.GET(f.request({user:0,query:'?tool=50&statistics='+otherId}))).status,200);
  assert.equal((await(await f.route.GET(f.request({user:0,query:'?tool=50&statistics='+otherId}))).json()).authenticated,false);
  assert.equal((await f.route.GET(f.request({user:2,query:'?tool=50&statistics='+otherId}))).status,404);
  const event=f.state().site_analysis_visits[0];assert.equal(event.page_path,'/page');assert.equal(event.channel,'email');assert.equal(event.country_code,'');assert.ok(!JSON.stringify(event).includes('secret'));assert.notEqual(event.session_key,payload.session);
});

test('短脚本与原长脚本映射同一站点并共享会话和事件去重，删除与重新验证规则一致',async()=>{
  const f=fixture(),key=siteScripts.siteScriptId(otherId),legacy='a'.repeat(64),context={params:Promise.resolve({token:key})};
  const request=(method='GET',body,origin='https://example.org')=>new Request(siteScripts.siteScriptUrl(otherId),{method,headers:{origin},...(body?{body:JSON.stringify(body)}:{})});
  const body={id:'visit-event-00000001',session:'anonymous-session-0001',page:'https://example.org/path',referrer:'',medium:''};
  const script=await f.shortRoute.GET(request(),context);assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/javascript/);
  assert.equal((await f.shortRoute.OPTIONS(request('OPTIONS'),context)).headers.get('access-control-allow-origin'),'https://example.org');
  assert.equal((await f.shortRoute.POST(request('POST',body),context)).status,204);
  await f.tracking.recordSiteVisit(legacy,request('POST'),body);assert.equal(f.state().site_analysis_visits.length,1);
  await f.tracking.recordSiteVisit(legacy,request('POST'),{...body,id:'visit-event-00000002'});
  const stats=await f.management.siteStatistics(1,otherId);assert.equal(stats.pageviews,2);assert.equal(stats.sessions,1);
  assert.equal((await f.shortRoute.POST(request('POST',body,'https://evil.org'),context)).status,403);
  const queries=f.queries.length;assert.equal((await f.shortRoute.GET(request(),{params:Promise.resolve({token:'A'.repeat(21)+'B'})})).status,404);assert.equal(f.queries.length,queries);
  await f.management.deleteAnalysisSite(1,otherId);assert.equal((await f.shortRoute.GET(request(),context)).status,404);
  await f.management.registerAnalysisSite(1,'example.org');assert.equal((await f.shortRoute.POST(request('POST',{...body,id:'visit-event-00000003'}),context)).status,403);
  await f.management.verifyAnalysisSite(1,otherId,'http://localhost:3000',async()=>({url:'https://example.org/',status:200,contentType:'text/html',bytes:Buffer.from(siteScripts.siteScriptSnippet(otherId))}));
  assert.equal((await f.shortRoute.POST(request('POST',{...body,id:'visit-event-00000003'}),context)).status,204);
  assert.equal((await f.trackerRoute.GET(new Request('https://www.yxstar.shop/api/site-tracker/'+legacy),{params:Promise.resolve({token:legacy})})).status,200);
  assert.equal(siteScripts.siteScriptId((await f.management.ownedManagedSite(1,otherId)).id),key);
});

test('上报幂等并按会话统计来源；删除不丢历史并暂停原脚本，重加域名保留原脚本且重新验证',async()=>{
  const f=fixture(),token='a'.repeat(64),body={id:'visit-event-00000001',session:'anonymous-session-0001',page:'https://example.org/page',referrer:'https://www.google.com/search?q=word',medium:''};
  const request=()=>new Request('https://shop.example/api/site-tracker/'+token,{method:'POST',headers:{origin:'https://example.org'}});
  await f.tracking.recordSiteVisit(token,request(),body);await f.tracking.recordSiteVisit(token,request(),body);await f.tracking.recordSiteVisit(token,request(),{...body,id:'visit-event-00000002',page:'https://example.org/second',referrer:'https://facebook.com/',medium:'social'});
  let stats=await f.management.siteStatistics(1,otherId);assert.equal(stats.pageviews,2);assert.equal(stats.sessions,1);assert.equal(stats.channels.find(row=>row.channel==='search').share,100);assert.deepEqual(clone(stats.countries),[{code:'',visits:1,share:100}]);
  await f.route.POST(f.request({body:f.body()}));await f.management.deleteAnalysisSite(1,otherId);
  assert.equal((await f.management.listAnalysisSites(1)).length,0);assert.equal(f.state().site_analysis_runs.length,1);assert.equal(f.state().site_analysis_visits.length,2);
  assert.equal((await f.trackerRoute.GET(new Request('https://shop.example/api/site-tracker/'+token),{params:Promise.resolve({token})})).status,404);
  await assert.rejects(f.tracking.recordSiteVisit(token,request(),{...body,id:'visit-event-00000003'}),error=>error.status===403);
  stats=await f.management.siteStatistics(1,otherId);assert.equal(stats.active,false);assert.equal(stats.pageviews,2);
  const restored=await f.management.registerAnalysisSite(1,'example.org');assert.equal(restored.id,otherId);assert.equal(restored.scriptToken,token);assert.equal(restored.verifiedAt,'');assert.equal(f.state().site_analysis_visits.length,2);
  await assert.rejects(f.tracking.recordSiteVisit(token,request(),{...body,id:'visit-event-00000003'}),error=>error.status===403);
  await f.management.verifyAnalysisSite(1,otherId,'https://shop.example',async()=>({url:'https://example.org/',status:200,contentType:'text/html',bytes:Buffer.from(`<script src="https://shop.example/api/site-tracker/${token}"></script>`)}));
  await f.tracking.recordSiteVisit(token,request(),{...body,id:'visit-event-00000003'});assert.equal(f.state().site_analysis_visits.length,3);
});

test('访问来源分类使用域名边界和明确medium，不把伪装搜索域或邮件访问误记为搜索',()=>{
  const classify=fixture().tracking.trafficChannel;
  for(const [url,medium,want] of [['','', 'direct'],['https://example.org/other','', 'direct'],['https://www.baidu.com/s','', 'search'],['https://mail.google.com/','', 'email'],['https://google.com.evil.org/','', 'referral'],['https://facebook.com/','', 'social'],['','newsletter','email'],['','unknown-medium','other']])assert.equal(classify(url,medium,'example.org'),want);
});

test('实际浏览器脚本不读敏感数据，支持SPA去重、匿名会话、隐私、HTTPS及域名和后台范围排除',()=>{
  const script=fixture().tracking.siteTrackerScript('http://shop.example/api/site-tracker/'+ 'a'.repeat(64),otherId,'example.org');
  function browser({dnt='0',deniedStorage=false,start='https://example.org/start?secret=private&utm_medium=email#token'}={}){
    const sent=[],events=new Map(),storage=new Map();let counter=0;
    const location=new URL(start),document={currentScript:{src:'https://shop.example/api/site-tracker/'+'a'.repeat(64),getAttribute:name=>name==='data-exclude-path'?'/admin':null},referrer:'https://mail.google.com/private?password=hidden'};
    Object.defineProperty(document,'cookie',{get(){throw Error('Cookies must not be read');}});
    const window={addEventListener(name,callback){if(!events.has(name))events.set(name,[]);events.get(name).push(callback);},dispatchEvent(event){for(const callback of events.get(event.type)||[])callback();}};
    const history={pushState(_state,_title,path){location.href=new URL(path,location).href;},replaceState(_state,_title,path){location.href=new URL(path,location).href;}};
    const context={window,document,location,history,navigator:{doNotTrack:dnt},URL,URLSearchParams,Event,Date,Math,Number,crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++counter).padStart(12,'0')}`},sessionStorage:{getItem(key){if(deniedStorage)throw Error('Storage disabled');return storage.get(key);},setItem(key,value){if(deniedStorage)throw Error('Storage disabled');storage.set(key,value);}},fetch:async(endpoint,options)=>{sent.push({endpoint,options,body:JSON.parse(options.body)});return new Response(null,{status:204});}};
    vm.runInNewContext(script,context);return{sent,history,context};
  }
  const b=browser();assert.equal(b.sent.length,1);assert.ok(b.sent[0].endpoint.startsWith('https://'));assert.equal(b.sent[0].options.credentials,'omit');assert.equal(b.sent[0].body.page,'https://example.org/start');assert.equal(b.sent[0].body.referrer,'https://mail.google.com');assert.equal(b.sent[0].body.medium,'email');
  b.history.pushState({},'', '/next?secret=hidden#fragment');assert.equal(b.sent.length,2);assert.equal(b.sent[0].body.session,b.sent[1].body.session);assert.notEqual(b.sent[0].body.id,b.sent[1].body.id);assert.equal(b.sent[1].body.page,'https://example.org/next');
  b.history.replaceState({},'', '/next?other=query');assert.equal(b.sent.length,2);vm.runInNewContext(script,b.context);assert.equal(b.sent.length,2);
  assert.equal(browser({dnt:'1'}).sent.length,0);assert.equal(browser({deniedStorage:true}).sent.length,1);
  assert.equal(browser({start:'http://localhost:3000/'}).sent.length,0);assert.equal(browser({start:'https://example.org.evil.test/'}).sent.length,0);assert.equal(browser({start:'https://www.example.org/'}).sent.length,1);
  const admin=browser({start:'https://example.org/admin'});assert.equal(admin.sent.length,0);admin.history.pushState({},'', '/admin/users?private=hidden');assert.equal(admin.sent.length,0);
  admin.history.pushState({},'', '/');assert.equal(admin.sent.length,1);admin.history.pushState({},'', '/admin');assert.equal(admin.sent.length,1);admin.history.pushState({},'', '/');assert.equal(admin.sent.length,2);
  admin.history.pushState({},'', '/administrator');assert.equal(admin.sent.length,3);assert.ok(admin.sent.every(event=>!event.body.page.includes('/admin/')&&!event.body.page.endsWith('/admin')));
});

test('站点管理默认位于首位，只有验证站点才能进入分析，地址来自配置且不能自由改写',()=>{
  const f=dashboardFixture();delete f.slots[0];const tree=f.render(),markup=renderToStaticMarkup(tree),$=require('cheerio').load(markup);
  assert.equal($('.seo-sidebar nav button').first().attr('aria-current'),'page');assert.ok($('.seo-sidebar nav button').first().text().includes('站点管理'));assert.equal($('.seo-controls').length,0);
  const manager=uiElements(tree).find(node=>typeof node.type==='function'&&node.type.name==='SiteManagement');assert.ok(manager);manager.props.onAnalyze(f.sites[0]);
  const overview=f.render();assert.equal(f.slots[0],'overview');assert.equal(uiElements(overview).find(node=>node.type==='input'&&node.props.autoComplete==='url').props.readOnly,true);
  f.sites[0].verifiedAt='';const pending=f.render();assert.equal(uiElements(pending).find(node=>node.type==='button'&&node.props.type==='submit').props.disabled,true);
});

test('站点管理可添加、复制唯一脚本、验证、进入看板并确认删除；英文界面保留域名与脚本原文',async()=>{
  const translations=loader()('lib/i18n.ts');
  for(const locale of ['zh-CN','en']){
    const slots=[],refs=[],calls=[],effects=[];let cursor=0,refCursor=0,copied='',selected=null,changed=0,installed=false;
    const site={id:otherId,host:'example.org',url:'https://example.org/',updatedAt:'2026-01-01',scriptToken:'a'.repeat(64),verifiedAt:'',lastSeenAt:''};
    const react={...React,useState(initial){const index=cursor++;if(!(index in slots))slots[index]=initial;return[slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},useRef(initial){return refs[refCursor++]??={current:initial};},useEffect(effect){effects.push(effect);}};
    const ui=loader({react,'./language-provider':{useI18n:()=>({locale,t:translations.translator(locale)})},'../lib/site-analysis-client':{async siteAnalysisRequest(_path,options){const body=JSON.parse(options.body);calls.push(body);if(body.action==='site-verify')installed=true;return{site:{...site,verifiedAt:installed?'2026-01-02':'',updatedAt:installed?'2026-01-02':'2026-01-01'}};}}},{window:{location:{origin:'http://localhost:3000'}},navigator:{clipboard:{async writeText(text){copied=text;}}}})('components/site-management.tsx');
    const props={sites:[],toolId:50,onChanged(){changed++;},onAnalyze(site){selected=site;}},render=()=>{cursor=0;refCursor=0;return ui.SiteManagement(props);},settle=()=>new Promise(resolve=>setImmediate(resolve));
    let tree=render();effects[0]();await settle();
    uiElements(tree).find(node=>node.type==='input').props.onChange({target:{value:'example.org'}});tree=render();uiElements(tree).find(node=>node.type==='form').props.onSubmit({preventDefault(){}});await settle();tree=render();
    assert.equal(calls.length,1);assert.equal(calls[0].action,'site-add');assert.equal(calls[0].domain,'example.org');
    const text=label=>translations.translator(locale)(label),button=label=>uiElements(tree).find(node=>node.type==='button'&&uiElements(node.props.children).some(child=>typeof child.props?.children==='string'&&child.props.children===text(label)))||uiElements(tree).find(node=>node.type==='button'&&(Array.isArray(node.props.children)?node.props.children.includes(text(label)):node.props.children===text(label)));
    assert.ok(uiElements(tree).some(node=>node.type==='textarea'));
    const card=uiElements(tree).find(node=>node.type==='article'),code=uiElements(card).find(node=>node.type==='textarea');assert.equal(code.props.readOnly,true);assert.equal(code.props.value,'<script async src="https://www.yxstar.shop/s/IiIiIiIiQiKCIiIiIiIiIg"></script>');assert.ok(!code.props.value.includes('localhost'));
    button('收起脚本').props.onClick();tree=render();assert.ok(!uiElements(tree).some(node=>node.type==='textarea'));button('查看脚本').props.onClick();tree=render();assert.equal(uiElements(tree).find(node=>node.type==='textarea').props.value,code.props.value);assert.equal(calls.length,1);
    assert.equal(button('进入综合看板').props.disabled,true);button('复制脚本').props.onClick();await settle();assert.equal(copied,code.props.value);
    button('已安装，开始验证').props.onClick();await settle();tree=render();assert.equal(calls[1].action,'site-verify');assert.equal(button('进入综合看板').props.disabled,false);button('进入综合看板').props.onClick();assert.equal(selected.id,site.id);
    const remove=uiElements(tree).find(node=>node.type==='button'&&node.props['aria-label']===text('删除站点 example.org'));remove.props.onClick();tree=render();button('确认删除').props.onClick();await settle();tree=render();assert.equal(calls[2].action,'site-delete');assert.equal(changed,3);assert.ok(!renderToStaticMarkup(tree).includes('seo-site-script'));
  }
});

test('多站点的生成、脚本、复制与验证留在各自卡片，重复点击和页面重建保持原脚本',async()=>{
  const translations=loader()('lib/i18n.ts'),settle=()=>new Promise(resolve=>setImmediate(resolve));
  for(const locale of ['zh-CN','en']){
    const sites=[{id,host:'first.org',url:'https://first.org/',updatedAt:'2026-01-01',scriptToken:'a'.repeat(64),verifiedAt:''},{id:otherId,host:'second.org',url:'https://second.org/',updatedAt:'2026-01-01',scriptToken:'',verifiedAt:''}],calls=[];let copied='';
    function mount(){
      const slots=[],refs=[],effects=[];let cursor=0,refCursor=0;
      const react={...React,useState(initial){const index=cursor++;if(!(index in slots))slots[index]=initial;return[slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},useRef(initial){return refs[refCursor++]??={current:initial};},useEffect(effect){effects.push(effect);}};
      const ui=loader({react,'./language-provider':{useI18n:()=>({locale,t:translations.translator(locale)})},'../lib/site-analysis-client':{async siteAnalysisRequest(_path,options){const body=JSON.parse(options.body);calls.push(body);const site=sites.find(site=>site.id===body.site||site.url===body.domain);assert.ok(site);Object.assign(site,{scriptToken:site.scriptToken||'b'.repeat(64),updatedAt:'2026-01-02',...(body.action==='site-verify'?{verifiedAt:'2026-01-02'}:{})});return{site:{...site}};}}},{window:{get location(){throw Error('The script origin must not come from the current page');}},navigator:{clipboard:{async writeText(value){copied=value;}}}})('components/site-management.tsx');
      const render=()=>{cursor=0;refCursor=0;return ui.SiteManagement({sites,toolId:50,onChanged(){},onAnalyze(){}});};
      return{render,effects};
    }
    const text=translations.translator(locale),card=(tree,index)=>uiElements(tree).filter(node=>node.type==='article')[index],button=(tree,label)=>uiElements(tree).find(node=>node.type==='button'&&(Array.isArray(node.props.children)?node.props.children.includes(text(label)):node.props.children===text(label))),code=tree=>uiElements(tree).find(node=>node.type==='textarea');
    const first=mount();let tree=first.render();first.effects[0]();await settle();tree=first.render();assert.ok(code(card(tree,0)));assert.ok(!code(card(tree,1)));
    const original=code(card(tree,0)).props.value;button(card(tree,0),'收起脚本').props.onClick();tree=first.render();assert.ok(!code(card(tree,0)));button(card(tree,0),'查看脚本').props.onClick();tree=first.render();assert.equal(code(card(tree,0)).props.value,original);assert.equal(calls.length,0);
    button(card(tree,1),'生成脚本').props.onClick();await settle();tree=first.render();assert.equal(calls.length,1);assert.equal(calls[0].domain,sites[1].url);
    const secondCode=code(card(tree,1));assert.equal(secondCode.props.value,'<script async src="https://www.yxstar.shop/s/IiIiIiIiQiKCIiIiIiIiIg"></script>');assert.equal(code(card(tree,0)).props.value,original);assert.notEqual(code(card(tree,0)).props.id,secondCode.props.id);
    button(card(tree,1),'复制脚本').props.onClick();await settle();assert.equal(copied,secondCode.props.value);
    button(card(tree,1),'已安装，开始验证').props.onClick();await settle();tree=first.render();assert.equal(calls[1].site,otherId);assert.equal(code(card(tree,0)).props.value,original);
    button(card(tree,1),'收起脚本').props.onClick();tree=first.render();button(card(tree,1),'查看脚本').props.onClick();tree=first.render();assert.equal(calls.length,2);assert.equal(code(card(tree,1)).props.value,secondCode.props.value);
    const next=mount();tree=next.render();next.effects[0]();await settle();tree=next.render();
    assert.equal(code(card(tree,0)).props.value,original);assert.equal(code(card(tree,1)).props.value,secondCode.props.value);assert.equal(calls.length,2);
  }
});

function managementUiFixture(sites,locale='zh-CN',globals={}) {
  const slots=[],refs=[],effects=[],requests=[];let cursor=0,refCursor=0,effectCursor=0,changed=0;
  const t=loader()('lib/i18n.ts').translator(locale);
  const react={...React,useState(initial){const index=cursor++;if(!(index in slots))slots[index]=initial;return[slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},useRef(initial){return refs[refCursor++]??={current:initial};},useEffect(effect,deps){const index=effectCursor++,old=effects[index];if(!old||deps.some((value,index)=>!Object.is(value,old.deps[index])))effects[index]={effect,deps,cleanup:old?.cleanup,pending:true};}};
  const ui=loader({react,'./language-provider':{useI18n:()=>({locale,t})},'../lib/site-analysis-client':{siteAnalysisRequest(_path,options){return new Promise((resolve,reject)=>{requests.push({body:JSON.parse(options.body),options,resolve,reject});if(options.signal.aborted)reject(options.signal.reason);else options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});});}}},globals)('components/site-management.tsx');
  const props={sites,toolId:50,onChanged(){changed++;},onAnalyze(){}};
  const render=()=>{cursor=0;refCursor=0;effectCursor=0;const view=ui.SiteManagement(props);for(const entry of effects)if(entry.pending){entry.cleanup?.();entry.cleanup=entry.effect();entry.pending=false;}return view;};
  const card=index=>uiElements(render()).filter(node=>node.type==='article')[index];
  const button=(index,label)=>uiElements(card(index)).find(node=>node.type==='button'&&(Array.isArray(node.props.children)?node.props.children.includes(t(label)):node.props.children===t(label)));
  render();const dispose=()=>{for(const entry of effects)entry.cleanup?.();};
  return{props,render,card,button,t,requests,dispose,changed:()=>changed,$:index=>require('cheerio').load(renderToStaticMarkup(card(index)))};
}

test('已有脚本随站点读取默认展开，验证进度与成功失败回执留在本站，重复点击不重发，刷新保留服务端已验证状态',async()=>{
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  for(const locale of ['zh-CN','en']){
    const site={id,host:'first.org',url:'https://first.org/',updatedAt:'2026-01-01',scriptToken:'a'.repeat(64),verifiedAt:''},other={...site,id:otherId,host:'second.org',url:'https://second.org/',scriptToken:'b'.repeat(64),verifiedAt:'2026-01-02T00:00:00Z'};
    const f=managementUiFixture([],locale);assert.equal(uiElements(f.render()).filter(node=>node.type==='article').length,0);f.props.sites=[site,other];
    assert.equal(uiElements(f.render()).filter(node=>node.type==='textarea').length,2);assert.equal(f.requests.length,0);
    assert.equal(f.$(0)('.seo-verification-receipt.pending').length,1);assert.ok(f.$(1)('.seo-managed-site-heading').text().includes(f.t('已验证')));
    const original=f.$(0)('textarea').val(),verify=f.button(0,'已安装，开始验证');verify.props.onClick();verify.props.onClick();
    assert.equal(f.requests.length,1);assert.equal(f.requests[0].body.site,id);assert.equal(f.button(0,'正在验证…').props.disabled,true);assert.equal(f.button(0,'正在验证…').props['aria-busy'],true);
    assert.equal(f.$(0)('.seo-verification-receipt.checking[role=status]').length,1);assert.equal(f.$(1)('.seo-verification-receipt.checking').length,0);
    const reason='首页未发现本站唯一脚本，请安装到页面HTML后再验证';f.requests[0].reject(Error(reason));await settle();
    assert.equal(f.$(0)('.seo-verification-receipt.failed[role=alert]').length,1);assert.ok(f.$(0)('.seo-verification-receipt').text().includes(f.t(reason)));assert.ok(f.$(0)('.seo-verification-receipt small').text().includes(f.t('本次检查时间')));assert.equal(f.button(0,'已安装，开始验证').props.disabled,false);
    f.button(0,'已安装，开始验证').props.onClick();const verified={...site,verifiedAt:'2026-01-03T00:00:00Z'};f.requests[1].resolve({site:verified});await settle();
    assert.equal(f.$(0)('.seo-verification-receipt.success[role=status]').length,1);assert.ok(f.$(0)('.seo-managed-site-heading').text().includes(f.t('已验证')));assert.equal(f.button(0,'进入综合看板').props.disabled,false);assert.equal(f.$(0)('textarea').val(),original);
    f.button(0,'收起脚本').props.onClick();assert.equal(f.$(0)('textarea').length,0);
    const refreshed=managementUiFixture([verified,other],locale);assert.equal(uiElements(refreshed.render()).filter(node=>node.type==='textarea').length,2);assert.equal(refreshed.$(0)('textarea').val(),original);assert.ok(refreshed.$(0)('.seo-verification-receipt small').text().includes(f.t('最近验证通过')));assert.equal(refreshed.requests.length,0);
  }
});

test('验证缺失回执、网络异常与等待超时都能重试，不伪造成功；卸载取消不更新旧页面或误撤销已有验证',async()=>{
  const settle=()=>new Promise(resolve=>setImmediate(resolve)),site={id,host:'first.org',url:'https://first.org/',updatedAt:'2026-01-01',scriptToken:'a'.repeat(64),verifiedAt:''};
  for(const result of [{},{site:{...site,id:otherId,verifiedAt:'2026-01-02'}},{site},{site:{...site,verifiedAt:2026}},{site:{...site,verifiedAt:'invalid'}}]){
    const f=managementUiFixture([site]);f.button(0,'已安装，开始验证').props.onClick();f.requests[0].resolve(result);await settle();assert.ok(f.$(0)('.seo-verification-receipt.failed').text().includes('验证响应不完整'));assert.equal(f.button(0,'进入综合看板').props.disabled,true);assert.equal(f.button(0,'已安装，开始验证').props.disabled,false);
  }
  const clock=new AbortController(),timed=managementUiFixture([site],'en',{AbortSignal:{timeout(ms){assert.equal(ms,25000);return clock.signal;},any:AbortSignal.any.bind(AbortSignal)}});
  timed.button(0,'已安装，开始验证').props.onClick();clock.abort(new DOMException('Timed out','TimeoutError'));await settle();assert.ok(timed.$(0)('.seo-verification-receipt.failed').text().includes(timed.t('验证等待超时，请重试')));assert.equal(timed.button(0,'已安装，开始验证').props.disabled,false);
  const cancelled=managementUiFixture([site]);cancelled.button(0,'已安装，开始验证').props.onClick();cancelled.dispose();await settle();assert.equal(cancelled.requests[0].options.signal.aborted,true);assert.equal(cancelled.changed(),0);
  const existing=managementUiFixture([{...site,verifiedAt:'2026-01-02T00:00:00Z'}]);existing.button(0,'重新验证').props.onClick();existing.requests[0].reject(new TypeError('Failed to fetch'));await settle();assert.ok(existing.$(0)('.seo-verification-receipt.failed').text().includes('网络连接异常'));assert.ok(existing.$(0)('.seo-managed-site-heading').text().includes('已验证'));assert.equal(existing.button(0,'进入综合看板').props.disabled,false);
});

test('验证限频显示独立倒计时，等待后允许手动重试，不误报失败、不自动提交，中英文说明简明',async()=>{
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  for(const locale of ['zh-CN','en']){
    let now=Date.now();const timers=new Set(),Clock=class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
    const site={id,host:'first.org',url:'https://first.org/',updatedAt:'2026-01-01',scriptToken:'a'.repeat(64),verifiedAt:''},other={...site,id:otherId,host:'second.org',verifiedAt:'2026-01-02T00:00:00Z'};
    const f=managementUiFixture([site,other],locale,{Date:Clock,setInterval(callback){timers.add(callback);return callback;},clearInterval(callback){timers.delete(callback);}});
    const advance=ms=>{now+=ms;for(const tick of timers)tick();f.render();};
    f.button(0,'已安装，开始验证').props.onClick();f.requests[0].reject(Object.assign(Error('验证请求较频繁，请稍后重试'),{status:429,retryAfter:5}));await settle();
    assert.equal(f.$(0)('.seo-verification-receipt.waiting[role=status]').length,1);assert.equal(f.$(0)('.seo-verification-receipt.failed').length,0);assert.ok(f.$(0)('.seo-managed-site-heading').text().includes(f.t('等待重试')));assert.equal(f.button(0,'请等待 5 秒').props.disabled,true);assert.equal(f.button(0,'请等待 5 秒').props['aria-busy'],false);assert.equal(timers.size,1);
    f.button(0,'请等待 5 秒').props.onClick();assert.equal(f.requests.length,1);assert.equal(f.$(1)('.seo-verification-receipt.waiting').length,0);
    f.button(1,'重新验证').props.onClick();f.requests[1].resolve({site:other});await settle();assert.ok(f.$(1)('.seo-managed-site-heading').text().includes(f.t('已验证')));assert.equal(f.button(0,'请等待 5 秒').props.disabled,true);
    advance(1100);assert.equal(f.button(0,'请等待 4 秒').props.disabled,true);
    advance(3900);assert.equal(timers.size,0);assert.equal(f.requests.length,2);assert.equal(f.button(0,'已安装，开始验证').props.disabled,false);assert.ok(f.$(0)('.seo-verification-receipt strong').text().includes(f.t('可以重新验证')));
    const text=f.$(0)('.seo-site-install').text();for(const copy of ['点击生成脚本后永久固定不变。','验证通过后，用于绑定站点的数据统计与分析。','删除统计脚本后将不再统计，历史分析数据依然保留。'])assert.ok(text.includes(f.t(copy)));assert.doesNotMatch(text,/CSP|Cookie|伪造访问|Visit submissions/);
    f.button(0,'已安装，开始验证').props.onClick();f.requests[2].resolve({site:{...site,verifiedAt:'2026-01-03T00:00:00Z'}});await settle();assert.equal(f.$(0)('.seo-verification-receipt.success').length,1);assert.equal(f.button(0,'进入综合看板').props.disabled,false);f.dispose();
  }
});

test('旧版限频响应使用十秒等待，已验证资格保留，卸载清理倒计时',async()=>{
  for(const retryAfter of [undefined,NaN,1000]){
    const timers=new Set(),site={id,host:'first.org',url:'https://first.org/',updatedAt:'2026-01-01',scriptToken:'a'.repeat(64),verifiedAt:'2026-01-02T00:00:00Z'};
    const f=managementUiFixture([site],'en',{setInterval(callback){timers.add(callback);return callback;},clearInterval(callback){timers.delete(callback);}});
    f.button(0,'重新验证').props.onClick();f.requests[0].reject(Object.assign(Error('验证请求较频繁，请稍后重试'),{status:429,retryAfter}));await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.button(0,'请等待 10 秒').props.disabled,true);assert.equal(f.button(0,'进入综合看板').props.disabled,false);assert.ok(f.$(0)('.seo-managed-site-heading').text().includes(f.t('已验证')));assert.equal(timers.size,1);f.dispose();assert.equal(timers.size,0);
  }
});

test('真实访问统计显示会话占比及未知国家，旧报告可读；读取失败不会冒充零流量或未接入',()=>{
  const translations=loader()('lib/i18n.ts'),report=collector.blankReport('example.org',model.analysisOptions({}));
  const statistics={siteId:otherId,connected:true,active:true,verified:true,lastSeenAt:'2026-01-01',since:'2026-01-01',pageviews:4,sessions:3,channels:[{channel:'search',visits:2,share:66.7},{channel:'direct',visits:1,share:33.3}],countries:[{code:'',visits:3,share:100}]};
  for(const locale of ['zh-CN','en']){
    const ui=loader({'./language-provider':{useI18n:()=>({locale,t:translations.translator(locale)})},react:{...React,useState:()=>[false,()=>{}]}})('components/site-analysis-overview-panels.tsx');
    let markup=renderToStaticMarkup(ui.SiteAnalysisOverviewPanels({report,statistics,onKeyword(){}}));assert.ok(markup.includes('66.7%'));assert.ok(markup.includes('33.3%'));assert.ok(markup.includes(locale==='en'?'Unidentified country':'未识别国家'));assert.ok(markup.includes('100%'));assert.ok(!markup.includes(locale==='en'?'Data not connected':'尚未接入数据'));
    markup=renderToStaticMarkup(ui.SiteAnalysisOverviewPanels({report,statistics:null,statisticsError:'访问统计读取失败',onKeyword(){}}));const $=require('cheerio').load(markup);assert.ok($('.seo-channel-list dd').toArray().every(node=>$(node).text()==='—'));assert.ok(markup.includes(locale==='en'?'could not be loaded':'读取失败'));
  }
});

test('站点迁移只新增接入和访问表，不删历史；统计限流有界并允许普通站点请求',()=>{
  const ddl=readFileSync(new URL('sql/11_site_management_20261026.sql',root),'utf8');assert.equal((ddl.match(/CREATE TABLE IF NOT EXISTS /g)||[]).length,2);assert.match(ddl,/UNIQUE KEY uq_site_script/);assert.match(ddl,/PRIMARY KEY\(site_id,event_id\)/);assert.doesNotMatch(ddl,/DELETE FROM|DROP TABLE|TRUNCATE|UPDATE users|ALTER TABLE site_analysis_runs/i);
  const tracking=fixture().tracking;for(let index=0;index<12000;index++)assert.equal(tracking.trackingRateAllowed('rate-test'),true);assert.equal(tracking.trackingRateAllowed('rate-test'),false);
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
  const translation=loader()('lib/i18n.ts'), report=collector.blankReport('example.org',model.analysisOptions({}));report.profile.name='独有网站标题';report.keywords=[{word:'独有业务关键词',kind:'manual',score:100,sources:[{kind:'manual',url:''}]}];report.issues=[{code:'title',severity:'medium',title:'页面缺少标题',url:'https://example.org/',advice:'为页面设置清晰且独立的标题'}];report.engines.find(e=>e.id==='bing').state='restricted';report.engines=report.engines.filter(e=>!['duckduckgo','yandex'].includes(e.id));
  const run={id,siteId:otherId,host:'example.org',status:'completed',progress:100,stage:'report',error:'',createdAt:'2026-10-25T00:00:00Z',updatedAt:'2026-10-25T00:00:00Z',completedAt:'2026-10-25T00:00:00Z',charged:false,pointsSpent:0,report};
  const slots={0:'overview',1:otherId,2:id,5:{owner:1,data:{sites:[{verifiedAt:'2026-01-01',id:otherId,host:'example.org',url:'https://example.org/'}],history:[run],total:1,page:1,workerReady:true,access:{canAnalyze:true,chargeType:'free',pointsCost:0,balance:null,hasMembership:false}}},6:{owner:1,run},9:'https://new.example.org/path'};let cursor=0,submitted;
  const react={...React,useEffect(){},useRef:value=>({current:value}),useState:initial=>{const index=cursor++;if(!(index in slots))slots[index]=initial;return[slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];}};
  const moduleLoader=loader({'./language-provider':{useI18n:()=>({locale:'en',t:translation.translator('en')})},'../lib/account-client':{useAccount:()=>({account:{authenticated:true,user:{id:1}},loading:false}),notifyAccountChanged(){}},react},{window:{location:{href:'https://shop.example/tools/webmaster-tools.html'},history:{replaceState(){}}},async fetch(_path,options){submitted=JSON.parse(options.body);return Response.json({run:{...run,id:otherId,status:'queued',report:null}});}});
  const {SiteAnalysisDashboard}=moduleLoader('components/site-analysis-dashboard.tsx');const tree=SiteAnalysisDashboard({tool:{id:50,slug:'webmaster-tools'}}), markup=renderToStaticMarkup(tree);
  assert.ok(markup.includes('独有网站标题'));assert.ok(markup.includes('独有业务关键词'));assert.ok(markup.includes('Access restricted'));assert.ok(markup.includes('Unavailable'));assert.ok(markup.includes('Search this domain'));assert.ok(markup.includes('Engines not queried in this report'));
  function elements(node){if(Array.isArray(node))return node.flatMap(elements);return React.isValidElement(node)?[node,...elements(node.props.children)]:[];}
  const checkboxes=elements(tree).filter(n=>n.type==='input'&&n.props.type==='checkbox');assert.equal(checkboxes.length,5);assert.ok(checkboxes.every(node=>node.props.checked&&!node.props.disabled));
  assert.ok(markup.includes('5 engines selected'));assert.ok(!markup.includes('{0} engines selected'));
  assert.ok(markup.includes('Analysis settings'));assert.ok(markup.includes('Report sections'));assert.ok(markup.includes('This report does not include this engine'));assert.ok(markup.includes('duckduckgo.com'));assert.ok(markup.includes('yandex.com'));assert.ok(!markup.includes('Analysis workbench'));assert.ok(markup.includes('https://www.google.com/search?'));assert.ok(markup.includes('site%3Aexample.org'));assert.ok(markup.includes('All engines are selected by default'));
  await elements(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(submitted.domain,'https://example.org/');assert.equal(submitted.tool,50);assert.ok(submitted.id);assert.equal(submitted.userId,undefined);assert.equal(submitted.options.device,'desktop');assert.equal(submitted.options.maxPages,20);assert.deepEqual(submitted.options.engines,['baidu','google','bing','duckduckgo','yandex']);
});

function uiElements(node) { if(Array.isArray(node))return node.flatMap(uiElements);return React.isValidElement(node)?[node,...uiElements(node.props.children)]:[]; }
function dashboardFixture({effectsEnabled=false}={}) {
  const translation=loader()('lib/i18n.ts'), report=collector.blankReport('example.org',model.analysisOptions({}));
  const run={id,siteId:otherId,host:'example.org',status:'completed',progress:100,stage:'report',error:'',createdAt:'2026-10-26T00:00:00Z',pointsSpent:0,report};
  const third='33333333-3333-4333-8333-333333333333', sites=[{id:otherId,host:'example.org',url:'https://example.org/',verifiedAt:'2026-01-01'},{id:third,host:'www.next.example.org',url:'http://www.next.example.org/',verifiedAt:'2026-01-01'}];
  const workspace={sites,history:[run],total:1,page:1,workerReady:true,access:{canAnalyze:true,chargeType:'free'}};
  const slots={0:'overview',1:otherId,2:id,5:{owner:1,data:workspace},6:{owner:1,run}}, refs=[], pendingEffects=[], deps=[], requests=[];
  let cursor=0,refCursor=0,effectCursor=0;
  const react={...React,useState(initial){const n=cursor++;if(!(n in slots))slots[n]=initial;return[slots[n],value=>{slots[n]=typeof value==='function'?value(slots[n]):value;}];},useRef(initial){return refs[refCursor++]??=( {current:initial} );},useEffect(fn,next){const n=effectCursor++;if(!effectsEnabled)return;if(deps[n]&&next.every((v,i)=>v===deps[n][i]))return;deps[n]=next;pendingEffects.push(fn);}};
  const ui=loader({'./language-provider':{useI18n:()=>({locale:'zh-CN',t:translation.translator('zh-CN')})},'../lib/account-client':{useAccount:()=>({account:{authenticated:true,user:{id:1}},loading:false}),notifyAccountChanged(){}},react},{window:{location:{href:'https://shop.example/tools/webmaster-tools.html',search:''},history:{replaceState(){}}},async fetch(path,options){requests.push({path,body:options?.body&&JSON.parse(options.body)});return Response.json(options?.method==='POST'?{run:{...run,status:'queued',report:null}}:String(path).includes('&run=')?{run}:workspace);}})('components/site-analysis-dashboard.tsx');
  return {slots,requests,sites,run,render(){cursor=0;refCursor=0;effectCursor=0;return ui.SiteAnalysisDashboard({tool:{id:50,slug:'webmaster-tools'}});},flushEffects(){for(const effect of pendingEffects.splice(0))effect();}};
}

test('选择站点只填充完整URL，保留当前报告，点击分析才提交所选网站',async()=>{
  const f=dashboardFixture();let tree=f.render();
  uiElements(tree).find(n=>n.type==='select'&&n.props['aria-label']==='选择已有站点').props.onChange({target:{value:f.sites[1].id}});
  tree=f.render();assert.equal(f.slots[9],f.sites[1].url);assert.equal(f.slots[2],f.run.id);assert.equal(f.slots[6].run.host,'example.org');assert.equal(f.requests.length,0);
  assert.equal(uiElements(tree).find(n=>n.type==='input'&&n.props.autoComplete==='url').props.value,f.sites[1].url);
  await uiElements(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].body.domain,'http://www.next.example.org/');
});

test('清空地址不会回退分析旧站点，站点管理选择同样仅填入地址',async()=>{
  const f=dashboardFixture();let tree=f.render();
  uiElements(tree).find(n=>n.type==='select'&&n.props['aria-label']==='选择已有站点').props.onChange({target:{value:f.sites[1].id}});
  tree=f.render();assert.equal(uiElements(tree).find(n=>n.type==='input'&&n.props.autoComplete==='url').props.readOnly,true);uiElements(tree).find(n=>n.type==='select'&&n.props['aria-label']==='选择已有站点').props.onChange({target:{value:''}});
  tree=f.render();await uiElements(tree).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.equal(f.requests.length,0);assert.equal(f.slots[7],'请先在站点管理添加并验证该域名');
  f.slots[0]='sites';tree=f.render();const manager=uiElements(tree).find(n=>typeof n.type==='function'&&n.type.name==='SiteManagement');assert.ok(manager);manager.props.onAnalyze(f.sites[1]);
  assert.equal(f.slots[9],f.sites[1].url);assert.equal(f.slots[0],'overview');assert.equal(f.requests.length,0);
});

test('迟到的历史报告填充不能覆盖用户已选择的配置站点',async()=>{
  const f=dashboardFixture({effectsEnabled:true});let tree=f.render();f.flushEffects();await Promise.resolve();
  tree=f.render();f.flushEffects();
  uiElements(tree).find(n=>n.type==='select'&&n.props['aria-label']==='选择已有站点').props.onChange({target:{value:f.sites[1].id}});
  await Promise.resolve();assert.equal(f.slots[9],f.sites[1].url);
  assert.ok(f.requests.every(request=>!request.body));assert.ok(f.requests.every(request=>!request.path.includes('&site=')));
});

test('站点基本信息双语、域名档案默认展开，元信息顺序与Unicode计数正确且原文不截断',()=>{
  const translations=loader()('lib/i18n.ts'), report=collector.blankReport('example.org',model.analysisOptions({}));
  const title='星'.repeat(39)+'🌍', description='描'.repeat(69), keyword='关键词原文'.repeat(23);
  report.profile.title=title;report.profile.description=description;report.pages=[{title,description,declared:[keyword],url:'https://example.org/'}];
  report.profile.finalUrl='javascript:alert(1)';report.profile.registrationSource='https://user:password@example.org/private';
  for(const locale of ['zh-CN','en']){
    const ui=loader({'./language-provider':{useI18n:()=>({locale,t:translations.translator(locale)})}})('components/site-analysis-profile.tsx');
    const markup=renderToStaticMarkup(React.createElement(ui.SiteAnalysisProfile,{report,date:value=>value}));
    for(const text of [title,description,keyword])assert.ok(markup.includes(text));
    const $=require('cheerio').load(markup), labels=locale==='en'?['Website title','Website keywords','Website description']:['网站标题','网站关键词','网站描述'];
    assert.deepEqual($('.seo-metadata-field dt>span').map((_,node)=>$(node).text()).get(),labels);
    assert.deepEqual($('.seo-metadata-field dt>small').map((_,node)=>$(node).text()).get(),['Title','Keywords','Description']);
    assert.equal($('#seo-site-profile-title').text(),locale==='en'?'Site information':'站点基本信息');
    assert.equal($('.seo-profile-section h3').length,2);assert.equal($('details.seo-domain-archive[open]').length,1);
    assert.ok($('details.seo-domain-archive summary').text().includes(locale==='en'?'Full domain profile':'完整域名档案'));
    assert.equal($('.seo-profile-facts .seo-profile-field').length,6);
    assert.ok(markup.includes(locale==='en'?'Suggested maximum: 39 characters. Current: 40.':'建议不超过 39 字，当前 40 字'));
    assert.ok(markup.includes(locale==='en'?'Suggested maximum: 100':'建议不超过 100'));assert.ok(markup.includes(locale==='en'?'Suggested maximum: 68':'建议不超过 68'));
    assert.ok(!markup.includes('href="javascript:')&&!markup.includes('href="https://user:password'));
  }
});

test('四个概况面板使用真实候选词，未知统计显示未接入，按钮可展开验证和脚本说明',()=>{
  const translations=loader()('lib/i18n.ts'), report=collector.blankReport('example.org',model.analysisOptions({}));report.coverage.fetched=5;report.keywords=[{word:'业务词原文'}];
  for(const locale of ['zh-CN','en']){
    let open=false,selected='';
    const ui=loader({'./language-provider':{useI18n:()=>({locale,t:translations.translator(locale)})},react:{...React,useState:()=>[open,value=>{open=value;}]}})('components/site-analysis-overview-panels.tsx');
    const props={report,onKeyword:word=>{selected=word;}}, tree=ui.SiteAnalysisOverviewPanels(props), markup=renderToStaticMarkup(tree);
    assert.match(markup,/role="region" tabindex="0"/);assert.ok(markup.includes('业务词原文'));
    const $=require('cheerio').load(markup);assert.equal($('.seo-engine-scroll[role="region"][tabindex="0"] .seo-engine-identity').length,5);assert.equal($('.seo-country-scroll[role="region"][tabindex="0"]').length,1);assert.deepEqual($('.seo-country-table th').map((_,node)=>$(node).text()).get(),locale==='en'?['Country','Traffic share']:['国家','访问占比']);assert.equal($('.seo-country-table tbody tr td[colspan="2"]').length,1);for(const engine of model.engineDefinitions)assert.equal($(`.seo-engine-scroll img[src="${engine.icon}"]`).length,1);
    assert.equal((markup.match(/seo-overview-panel"/g)||[]).length,4);assert.equal((markup.match(/seo-data-state/g)||[]).length,2);
    assert.ok(markup.includes(locale==='en'?'Index statistics not connected':'尚未接入收录统计'));assert.ok(markup.includes(locale==='en'?'5 pages collected':'本轮读取 5 页'));
    assert.ok(!markup.includes('0%'));assert.ok(markup.includes('site%3Aexample.org'));
    uiElements(tree).find(n=>n.type==='button'&&n.props.children==='业务词原文').props.onClick();assert.equal(selected,'业务词原文');
    uiElements(tree).find(n=>n.type==='button'&&n.props['aria-controls']==='seo-statistics-setup').props.onClick();
    const expanded=ui.SiteAnalysisOverviewPanels(props), details=uiElements(expanded).find(n=>n.type==='details');assert.equal(details.props.open,true);
    assert.ok(markup.includes(locale==='en'?'unique script':'唯一脚本'));assert.ok(markup.includes(locale==='en'?'Visit submissions do not prove ownership':'不通过伪造访问上报取得验证'));
    assert.ok(markup.includes(locale==='en'?'Install the tracking script':'安装统计脚本'));assert.ok(!markup.includes('<script'));
    details.props.onToggle({currentTarget:{open:false}});assert.equal(open,false);
  }
});

test('历史报告的核心关键词优先展示，长标签保留全文悬浮提示和完整筛选值，中文英文不改采集原文',()=>{
  const translations=loader()('lib/i18n.ts'),report=collector.blankReport('example.org',model.analysisOptions({}));
  const full='企业级AI运营自动化与行业精准获客解决方案（完整版本）';
  report.profile.title=full;report.profile.industry='软件与技术';report.keywords=[{word:'正在',kind:'content',score:10000,sources:[]},{word:full,kind:'content',score:1,sources:[]}];
  for(const locale of ['zh-CN','en']){
    let selected='';
    const ui=loader({'./language-provider':{useI18n:()=>({locale,t:translations.translator(locale)})},react:{...React,useState:()=>[false,()=>{}]}})('components/site-analysis-overview-panels.tsx');
    const tree=ui.SiteAnalysisOverviewPanels({report,onKeyword:word=>{selected=word;}}),markup=renderToStaticMarkup(tree),$=require('cheerio').load(markup);
    assert.deepEqual($('.seo-keyword-scroll button').map((_,node)=>$(node).text()).get(),[full,'正在']);
    assert.equal($('.seo-keyword-scroll button').first().attr('title'),full);assert.equal($('.seo-panel-total').text(),'2');
    uiElements(tree).find(node=>node.type==='button'&&node.props.title===full).props.onClick();assert.equal(selected,full);
    assert.deepEqual(report.keywords.map(word=>word.word),['正在',full]);
  }
});

test('旧报告缺少页面元信息仍可显示未读取，深色操作区与报告标题分开且保留关键词用途',()=>{
  const translations=loader()('lib/i18n.ts'), report=collector.blankReport('example.org',model.analysisOptions({}));
  const profile=loader({'./language-provider':{useI18n:()=>({locale:'zh-CN',t:translations.translator('zh-CN')})}})('components/site-analysis-profile.tsx');
  const markup=renderToStaticMarkup(React.createElement(profile.SiteAnalysisProfile,{report,date:value=>value}));assert.equal((markup.match(/页面未设置或尚未读取/g)||[]).length,3);
  const f=dashboardFixture(), page=renderToStaticMarkup(f.render());assert.ok(page.indexOf('分析条件')<page.indexOf('任务进度与导出'));assert.ok(page.indexOf('任务进度与导出')<page.indexOf('分析报告'));assert.ok(page.indexOf('分析报告')<page.indexOf('站点基本信息'));
  for(const anchor of ['seo-domain-profile','seo-overview-panels','seo-engine-visibility','seo-keyword-details','seo-report-findings'])assert.ok(page.includes(`href="#${anchor}"`)&&page.includes(`id="${anchor}"`));
  assert.ok(page.includes('aria-describedby="seo-keyword-purpose"'));assert.ok(page.includes('不会修改网站的关键词设置'));assert.ok(page.includes('已选 5 个引擎'));assert.ok(page.includes('seo-controls seo-console'));assert.ok(page.includes('seo-run-state seo-console'));
});
