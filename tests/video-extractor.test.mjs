import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile, readFile, stat, readdir, rm } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { webcrypto, createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as options from '../lib/video-options.ts';
import * as tools from '../lib/tool-services.ts';
import * as points from '../lib/points.ts';

const require = createRequire(import.meta.url);
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, URL, Request, Response, Buffer, AbortSignal, crypto: webcrypto, process, setTimeout, clearTimeout, setInterval, clearInterval, console: { error() {} }, ...globals, require(name) { if (name in mocks) return mocks[name]; if (name.startsWith('node:') || ['react', 'react/jsx-runtime'].includes(name)) return require(name); throw new Error(`Unexpected module: ${name}`); } });
  return exports;
}
const id = '11111111-1111-4111-8111-111111111111', id2 = '22222222-2222-4222-8222-222222222222';
const previewId = '33333333-3333-4333-8333-333333333333';
const now = () => new Date().toISOString(), future = () => new Date(Date.now() + 86400000).toISOString();
const media = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(100)]);
const stream = (bytes, headers = {}) => Object.assign(Readable.from([bytes]), { headers, statusCode: 200 });
const network = load('../lib/video-network.ts', { './video-options': options });

test('分享文字提取完整链接，拒绝凭据、协议和异常端口', () => {
  assert.equal(options.sharedVideoUrl('7.32 分享视频 https://b23.tv/Abc123，复制打开！'), 'https://b23.tv/Abc123');
  assert.equal(options.sharedVideoUrl('https://www.facebook.com/watch/?v=123#abc'), 'https://www.facebook.com/watch/?v=123');
  for (const value of [null, '没有链接', 'file:///video.mp4', 'https://u:p@example.com/x', 'http://example.com:3000/x', 'a'.repeat(9000)]) assert.throws(() => options.sharedVideoUrl(value));
  assert.equal(options.videoTaskId('../result'), false);
});
test('公网地址规则拦截 IPv4/IPv6 私网、映射、保留与文档网络', async () => {
  for (const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','192.168.0.1','169.254.169.254','100.64.0.1','198.19.0.1','203.0.113.2','0.0.0.0','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::','2001:0:1::','64:ff9b::7f00:1']) assert.equal(network.publicVideoAddress(ip), false, ip);
  for (const ip of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111','240e:1234::1']) assert.equal(network.publicVideoAddress(ip), true, ip);
  const mixed = load('../lib/video-network.ts', { './video-options': options, 'node:dns/promises': { lookup: async () => [{ address: '8.8.8.8', family: 4 },{ address: '127.0.0.1', family: 4 }] } });
  await assert.rejects(mixed.videoUrlAddress('https://example.com/x'), /内网/);
  for (const url of ['http://localhost/x','http://metadata.internal','http://2130706433','http://[::ffff:127.0.0.1]','https://u:p@8.8.8.8/x','file:///tmp/x']) await assert.rejects(network.videoUrlAddress(url));
});
test('B站域名被本地代理映射到私网时，通过公网 DNS 复核并固定真正公网 IP', async () => {
  const queries=[],connections=[];
  const lookup=async()=>[{address:'172.29.0.61',family:4}];
  const safe=load('../lib/video-network.ts',{'./video-options':options,'node:dns/promises':{lookup},'node:https':{request(url,config,callback){
    const req=new EventEmitter();req.setTimeout=()=>req;req.destroy=error=>req.emit('error',error);req.end=()=>queueMicrotask(()=>callback(stream(media)));
    config.lookup(url.hostname,{all:true},(error,addresses)=>{assert.equal(error,null);connections.push(addresses[0].address);});return req;
  }}},{fetch:async(url,config)=>{queries.push({url:String(url),config});return Response.json({Status:0,Question:{name:'www.bilibili.com.'},Answer:[{name:'www.bilibili.com.',type:5,data:'video.cdn.example.'},{name:'video.cdn.example.',type:1,data:'183.131.147.30',TTL:60}]});}});
  const {response}=await safe.videoResponse('https://www.bilibili.com/video/BV1AMDvBaEY6/');response.destroy();
  assert.deepEqual(connections,['183.131.147.30']);assert.equal(queries.length,1);assert.equal(queries[0].config.redirect,'error');assert.equal(queries[0].config.credentials,'omit');assert.match(queries[0].url,/^https:\/\/dns\.alidns\.com\/resolve\?/);
  assert.equal((await safe.videoUrlAddress('https://www.bilibili.com/other')).address.address,'183.131.147.30');assert.equal(queries.length,1,'同域名短缓存避免每个视频画质重复查询');
});
test('正常系统公网 DNS 无需额外查询；内网字面地址与本地域名始终禁止',async()=>{
  let queries=0;const safe=load('../lib/video-network.ts',{'./video-options':options,'node:dns/promises':{lookup:async()=>[{address:'8.8.8.8',family:4}]}},{fetch:async()=>{queries++;throw Error('not expected');}});
  assert.equal((await safe.videoUrlAddress('https://public.example/video')).address.address,'8.8.8.8');
  for(const url of ['http://127.0.0.1','http://172.29.0.61','http://198.18.0.1','http://[::ffff:127.0.0.1]','http://localhost.','http://x.internal'])await assert.rejects(safe.videoUrlAddress(url));
  assert.equal(queries,0);
});
test('公网 DNS 响应须匹配问题域名与 CNAME 链，拒绝混入私网、无关地址和超限响应',async()=>{
  for(const data of [
    {Status:0,Question:[{name:'other.example'}],Answer:[{name:'other.example',type:1,data:'8.8.8.8'}]},
    {Status:0,Question:[{name:'public.example'}],Answer:[{name:'public.example',type:1,data:'8.8.8.8'},{name:'public.example',type:1,data:'127.0.0.1'}]},
    {Status:0,Question:[{name:'public.example'}],Answer:[{name:'unrelated.example',type:1,data:'8.8.8.8'}]},
    {Status:0,Question:[{name:'public.example'}],Answer:[{name:'public.example',type:1,data:'198.18.0.1'}]},
    {Status:3,Question:[{name:'public.example'}],Answer:[]},
    'x'.repeat(66000),
  ]){
    let queries=0;const safe=load('../lib/video-network.ts',{'./video-options':options,'node:dns/promises':{lookup:async()=>[{address:'172.29.0.61',family:4}]}},{fetch:async()=>{queries++;return typeof data==='string'?new Response(data):Response.json(data);}});
    await assert.rejects(safe.videoUrlAddress('https://public.example/video'),/DNS 解析异常/);assert.equal(queries,2);
  }
});
test('系统 DNS 失败时使用备用 HTTPS DNS，同一域名的并发复核共享一次查询',async()=>{
  let queries=0;const safe=load('../lib/video-network.ts',{'./video-options':options,'node:dns/promises':{lookup:async()=>{throw Error('DNS failed');}}},{fetch:async(url)=>{
    queries++;if(new URL(url).hostname==='dns.alidns.com')return new Response(null,{status:503});
    return Response.json({Status:0,Question:[{name:'public.example'}],Answer:[{name:'public.example',type:1,data:'1.1.1.1',TTL:60}]});
  }});
  const addresses=await Promise.all([safe.videoUrlAddress('https://public.example/a'),safe.videoUrlAddress('https://public.example/b')]);assert.ok(addresses.every(item=>item.address.address==='1.1.1.1'));assert.equal(queries,2);
});
test('连接固定已校验 IP，重定向重新检查；认证和 Cookie 不转发', async () => {
  const calls = []; let lookups = 0;
  const request = (url, config, callback) => {
    calls.push({ url, config });
    config.lookup(url.hostname, { all: true }, (error, addresses) => { assert.equal(error, null); assert.equal(addresses[0].address, '8.8.8.8'); });
    const req = new EventEmitter(); req.setTimeout = () => req; req.end = () => queueMicrotask(() => callback(Object.assign(stream(Buffer.from('ok')), { statusCode: 302, headers: { location: 'http://127.0.0.1/private' } }))); req.destroy = error => req.emit('error', error); return req;
  };
  const safe = load('../lib/video-network.ts', { './video-options': options, 'node:dns/promises': { lookup: async () => { lookups++; return [{ address: '8.8.8.8', family: 4 }]; } }, 'node:https': { request } });
  await assert.rejects(safe.videoResponse('https://public.example/x', { Cookie: 'secret', Authorization: 'secret', Referer: 'https://public.example/' }), /内网|保留/);
  assert.equal(lookups, 1); assert.equal(calls.length, 1);
  assert.equal(calls[0].config.headers.Cookie, undefined); assert.equal(calls[0].config.headers.Authorization, undefined);
  assert.equal(calls[0].config.headers.Referer, 'https://public.example/');
  assert.equal(network.videoRequestHeaders({ Referer: 'x\r\nCookie: secret' }).Referer, undefined);
  await assert.rejects(network.videoResponseBytes(stream(Buffer.alloc(20)), 10), /过大|限制/);
});

const kuaishou = load('../lib/video-kuaishou.ts');
const engineBase = { './video-options': options, './video-network': network, './video-kuaishou': kuaishou };
const engine = load('../lib/video-engine.ts', engineBase);
test('网页源解析支持 HTML5、OG、JSON-LD、相对路径和封面，不执行网页脚本', () => {
  const parsed = engine.htmlVideoSources(`<title>网页标题</title><video poster="/cover.png"><source src="/video.mp4?x=1&amp;y=2"></video><meta property="og:video" content="https://cdn.example.com/v.webm"><script type="application/ld+json">{"@type":"VideoObject","name":"结构化视频","contentUrl":"/third.mov"}</script>`, 'https://example.com/watch');
  assert.equal(parsed.title, '结构化视频'); assert.equal(parsed.thumbnail, 'https://example.com/cover.png');
  assert.deepEqual(Array.from(parsed.urls), ['https://example.com/video.mp4?x=1&y=2','https://cdn.example.com/v.webm','https://example.com/third.mov']);
  assert.equal(engine.videoPlatform('www.bilibili.com'), true); assert.equal(engine.videoPlatform('b23.tv'), true);
  assert.equal(engine.videoPlatform('www.facebook.com'), true); assert.equal(engine.videoPlatform('bilibili.com.evil.example'), false);
  assert.throws(() => engine.videoTaskDirectory('------------------------------------'));
});
test('B站音视频分离画质仅在可合并时提供；拒绝 DRM、HLS 与超限文件', () => {
  const metadata = { formats: [
    { url: 'https://cdn.example/1080', ext: 'mp4', protocol: 'https', vcodec: 'avc1', acodec: 'none', height:1080, filesize:1000 },
    { url: 'https://cdn.example/audio', ext: 'm4a', protocol: 'https', vcodec: 'none', acodec: 'aac', filesize:100 },
    { url: 'https://cdn.example/720', ext: 'mp4', protocol: 'https', vcodec: 'avc1', acodec: 'aac', height:720 },
    { url: 'https://cdn.example/drm', ext: 'mp4', has_drm:true },
    { url: 'https://cdn.example/playlist', ext: 'mp4', protocol:'m3u8_native' },
    { url: 'https://cdn.example/huge', ext:'mp4', filesize:2**32 },
  ] };
  assert.equal(engine.engineFormats(metadata, false).length, 1);
  const formats = engine.engineFormats(metadata, true);
  assert.equal(formats.length, 2); assert.equal(formats[0].height, 1080); assert.equal(formats[0].parts.length, 2); assert.equal(formats[0].size, 1100);
  assert.match(formats[0].label, /含音频合并/);
});
test('快手公开分享页独立解析 JSON 状态，只取当前视频且不执行脚本',async()=>{
  const html=`<title>快手</title><script>window.__APOLLO_STATE__={"VisionVideoDetailPhoto:3xabc":{"id":"3xabc","caption":"分享视频","photoUrl":"https://cdn.example/current.mp4","coverUrl":"https://cdn.example/cover.png","duration":15000},"VisionVideoDetailPhoto:other":{"id":"other","photoUrl":"https://cdn.example/other.mp4"}}; throw new Error("不会执行");</script>`;
  const parsed=kuaishou.kuaishouVideoSources(html,'https://www.kuaishou.com/short-video/3xabc');assert.equal(parsed.title,'分享视频');assert.equal(parsed.duration,15);assert.deepEqual(Array.from(parsed.urls),['https://cdn.example/current.mp4']);
  const local=load('../lib/video-engine.ts',{...engineBase,'./video-network':{...network,videoUrlAddress:async()=>({}),videoResponse:async url=>url.includes('kuaishou.com')?{url:'https://www.kuaishou.com/short-video/3xabc',response:stream(Buffer.from(html),{'content-type':'text/html'})}:{url,response:stream(media,{'content-length':String(media.length)})}}});
  const info=await local.inspectVideo('https://v.kuaishou.com/abc');assert.equal(info.title,'分享视频');assert.equal(info.formats.length,1);assert.equal(info.formats[0].parts[0].url,'https://cdn.example/current.mp4');
  assert.equal(kuaishou.kuaishouVideoSources('<script>window.INIT_STATE = JSON.parse(atob("secret"))</script>','https://www.kuaishou.com/short-video/3xabc').urls.length,0);
});
test('B站、小红书、抖音及 Facebook 短链先安全解开，禁止跳出受支持平台',async()=>{
  let destination='https://www.bilibili.com/video/BVabc',destroyed=0;
  const local=load('../lib/video-engine.ts',{...engineBase,'./video-network':{...network,videoResponse:async()=>({url:destination,response:{destroy(){destroyed++;}}})}});
  assert.equal(await local.platformVideoUrl('https://b23.tv/test'),destination);destination='https://www.xiaohongshu.com/explore/test';assert.equal(await local.platformVideoUrl('https://xhslink.com/a/test'),destination);
  destination='https://www.douyin.com/video/123';assert.equal(await local.platformVideoUrl('https://v.douyin.com/test'),destination);destination='https://www.facebook.com/watch/?v=123';assert.equal(await local.platformVideoUrl('https://fb.watch/test'),destination);
  destination='https://other.example/x';await assert.rejects(local.platformVideoUrl('https://b23.tv/test'),/不支持的平台/);assert.equal(destroyed,5);
  await assert.rejects(local.platformVideoUrl('https://www.facebook.com/l.php?u=http://127.0.0.1'),/视频本身/);
});

async function scratch(t) {
  const path = await mkdtemp(join(process.cwd(), '.video-test-'));
  t.after(async () => { const target = await import('node:fs/promises').then(fs => fs.realpath(path)); const child = relative(process.cwd(), target); assert.ok(!isAbsolute(child) && !child.startsWith('..') && child.startsWith('.video-test-')); await rm(target, { recursive:true, force:true }); });
  return path;
}
test('平台引擎使用独立程序安全参数，B站与 Facebook 返回实际画质且不泄露媒体地址到公开预览', async t => {
  const root = await scratch(t); await mkdir(join(root,'vendor/video-engine'), { recursive:true }); await writeFile(join(root,'vendor/video-engine', process.platform==='win32'?'yt-dlp.exe':'yt-dlp'), 'stub', {mode:0o755});
  const calls = [], context = { ...process, cwd: () => root, env: {} };
  const configured = load('../lib/video-engine.ts', { ...engineBase, './video-network': { ...network, videoUrlAddress: async () => ({}) }, 'node:child_process': { execFile(file,args,config,callback) { calls.push({file,args,config}); callback(null,{ stdout:JSON.stringify({ title:'实际视频', duration:60, formats:[{url:'https://cdn.example/video.mp4',ext:'mp4',vcodec:'avc1',acodec:'aac',height:720}] }) }); } } }, { process:context });
  for (const url of ['https://www.bilibili.com/video/BV123','https://www.facebook.com/watch/?v=123']) {
    const parsed = await configured.inspectVideo(url); assert.equal(parsed.formats[0].height,720); assert.equal(parsed.title,'实际视频');
  }
  assert.equal(calls.length,2); assert.ok(calls[0].args.includes('default,-generic')); assert.ok(calls[0].args.includes('--no-remote-components')); assert.ok(calls[0].args.includes('--ignore-config')); assert.equal(calls[0].args.at(-2),'--'); assert.equal(calls[0].config.shell,undefined);
});
test('B站只有分离画质且缺少合并组件时，准确提示 FFmpeg 而非链接不支持',async t=>{
  const root=await scratch(t);await mkdir(join(root,'vendor/video-engine'),{recursive:true});await writeFile(join(root,'vendor/video-engine',process.platform==='win32'?'yt-dlp.exe':'yt-dlp'),'stub',{mode:0o755});
  const configured=load('../lib/video-engine.ts',{...engineBase,'./video-network':{...network,videoUrlAddress:async()=>({})},'node:child_process':{execFile(_file,_args,_config,callback){callback(null,{stdout:JSON.stringify({title:'B站视频',formats:[{url:'https://cdn.example/video',ext:'mp4',protocol:'https',vcodec:'avc1',acodec:'none',height:1080},{url:'https://cdn.example/audio',ext:'m4a',protocol:'https',vcodec:'none',acodec:'aac'}]})});}}},{process:{...process,cwd:()=>root,env:{}}});
  await assert.rejects(configured.inspectVideo('https://www.bilibili.com/video/BV1AMDvBaEY6/'),error=>error.status===503&&/FFmpeg/.test(error.message));
});
test('公开网页视频实际下载成文件；无效内容和大小超限不留下结果', async t => {
  const root = await scratch(t); let invalid = false;
  const local = load('../lib/video-engine.ts', { ...engineBase, './video-network': { ...network, videoUrlAddress:async()=>({}), videoResponse:async url => ({ url, response:stream(invalid ? Buffer.from('<html>denied</html>') : media, {'content-length':String(invalid?19:media.length)}) }) } }, {process:{...process, cwd:()=>root,env:{}}});
  const info = await local.inspectVideo('https://example.com/video.mp4'); assert.equal(info.formats[0].extension,'mp4');
  const result = await local.materializeVideo(id,info.formats[0],()=>{}); assert.deepEqual(await readFile(result.path),media); assert.ok((await stat(result.path)).isFile());
  invalid = true; await assert.rejects(local.materializeVideo(id2,info.formats[0],()=>{}), /不是有效视频/);
  assert.equal((await readdir(join(root,'uploads/video-extractions',id2))).length,0);
});
test('分离音视频从本地文件合并，FFmpeg 失败不返回成品', async t => {
  const root=await scratch(t); await mkdir(join(root,'vendor/video-engine'),{recursive:true}); await writeFile(join(root,'vendor/video-engine',process.platform==='win32'?'ffmpeg.exe':'ffmpeg'),'stub',{mode:0o755}); let fail=false; const calls=[];
  const local=load('../lib/video-engine.ts',{...engineBase,'./video-network':{...network,videoResponse:async url=>({url,response:stream(media)})},'node:child_process':{execFile(file,args,config,callback){calls.push(args); if(fail)callback(new Error('merge')); else writeFile(args.at(-1),media).then(()=>callback(null,{stdout:''}),callback);}}},{process:{...process,cwd:()=>root,env:{}}});
  const format={id:'f',extension:'mp4',size:0,parts:[{url:'https://cdn.example/v',headers:{},extension:'mp4'},{url:'https://cdn.example/a',headers:{},extension:'m4a'}]};
  assert.equal((await local.materializeVideo(id,format,()=>{})).size,media.length); assert.ok(calls[0].includes('file,pipe')); assert.equal(calls[0].filter(v=>v==='-i').length,2);
  fail=true; await assert.rejects(local.materializeVideo(id2,format,()=>{}),/合并失败/); assert.equal((await readdir(join(root,'uploads/video-extractions',id2))).length,0);
});
test('项目内 FFmpeg 可用时，真实合成测试音视频并通过应用合并为可解码成品',async t=>{
  const binary=join(process.cwd(),'vendor/video-engine',process.platform==='win32'?'ffmpeg.exe':'ffmpeg');
  if(!(await stat(binary).catch(()=>null))?.isFile()){t.skip('未安装项目内 FFmpeg，其他合并事务检查仍执行');return;}
  const root=await scratch(t),execute=require('node:util').promisify(require('node:child_process').execFile);
  const run=args=>execute(binary,['-nostdin','-hide_banner','-loglevel','error',...args],{timeout:15000,maxBuffer:100000,windowsHide:true});
  const video=join(root,'video.mp4'),audio=join(root,'audio.m4a');
  await run(['-f','lavfi','-i','color=c=blue:s=128x72:r=10:d=0.2','-an','-c:v','libx264','-t','0.2',video]);
  await run(['-f','lavfi','-i','anullsrc=r=44100:cl=mono','-vn','-c:a','aac','-t','0.2',audio]);
  const bytes=[await readFile(video),await readFile(audio)];
  const local=load('../lib/video-engine.ts',{...engineBase,'./video-network':{...network,videoResponse:async url=>({url,response:stream(bytes[url.endsWith('/audio')?1:0])})}},{process:{...process,cwd:()=>root,env:{VIDEO_FFMPEG_PATH:binary}}});
  const result=await local.materializeVideo(id,{id:'f',extension:'mp4',size:bytes[0].length+bytes[1].length,parts:[{url:'https://cdn.example/video',headers:{},extension:'mp4'},{url:'https://cdn.example/audio',headers:{},extension:'m4a'}]},()=>{});
  assert.ok(result.size>0);await run(['-i',result.path,'-map','0:v:0','-map','0:a:0','-frames:v','1','-f','null','-']);
});

const entitlement = load('../lib/tool-entitlements.ts', { './tool-services':tools, '@/db/mysql-runtime':{env:{}} });
function taskRow(patch={}) { return { id,user_id:1,product_id:4,request_hash:'hash',title:'视频',format_label:'720p MP4',format_json:'{}',billing_mode:'points',points_cost:10,status:'processing',progress:90,file_extension:'mp4',file_size:0,charged:0,points_spent:0,error_message:'',created_at:now(),updated_at:now(),expires_at:future(),...patch }; }
function database({ balance=100, tasks=[taskRow()], mode='points', cost=10, orders=[], fail='', materializeVideo=async()=>{throw new Error('not expected');} }={}) {
  let state={balance,tasks:structuredClone(tasks),ledger:[],orders:structuredClone(orders),events:[],previews:[]}; const log=[]; let serial=Promise.resolve();
  const query=async(sql,args,connection)=>{
    log.push({sql,args});
    if(sql.includes('FROM users')&&sql.includes('FOR UPDATE')){const before=serial;serial=new Promise(resolve=>{connection.unlock=resolve;});await before;connection.snapshot=structuredClone(state);return [[{id:args[0]}]];}
    if(sql.includes('FROM products'))return [[{id:4,tool_charge_type:mode,tool_points_cost:cost}]];
    if(sql.includes('FROM orders'))return [state.orders.filter(o=>o.user_id===args[0]&&o.product_id===args[1])];
    if(sql.startsWith('UPDATE orders')){const o=state.orders.find(o=>o.id===args[0]&&o.user_id===args[1]&&o.tool_uses_remaining>0);if(o)o.tool_uses_remaining--;return [{affectedRows:o?1:0}];}
    if(sql.includes('FROM points_wallets'))return [[{balance:state.balance}]];
    if(sql.includes('FROM points_ledger'))return [state.ledger.filter(row=>row.operation_id===args[0])];
    if(sql.startsWith('UPDATE points_wallets')){if(state.balance<args[0])return [{affectedRows:0}];state.balance-=args[0];return [{affectedRows:1}];}
    if(sql.startsWith('INSERT INTO points_ledger')){state.ledger.push({operation_id:args[0],user_id:args[1],product_id:args[5],delta:args[3],balance_after:args[4]});return [{affectedRows:1}];}
    if(sql.startsWith('INSERT INTO tool_usage_events')){if(fail==='event')throw Error('event failed');state.events.push(args[0]);return [{affectedRows:1}];}
    if(sql.includes('FROM video_extraction_previews')){if(sql.includes('COUNT'))return [[{total:0}]];return [state.previews.filter(r=>r.id===args[0]&&r.user_id===args[1])];}
    if(sql.startsWith('INSERT INTO video_extraction_previews')){state.previews.push(Object.fromEntries(['id','user_id','product_id','source_url','metadata_json','created_at','expires_at'].map((key,index)=>[key,args[index]])));return [{affectedRows:1}];}
    if(sql.startsWith('INSERT INTO video_extraction_tasks')){
      assert.equal((sql.match(/\?/g)||[]).length,args.length);
      const columns=['id','user_id','product_id','request_hash','title','format_label','format_json','billing_mode','points_cost','file_extension','created_at','updated_at','expires_at'];
      state.tasks.push(taskRow({...Object.fromEntries(columns.map((key,index)=>[key,args[index]])),status:'queued',progress:0}));return [{affectedRows:1}];
    }
    if(sql.includes('FROM video_extraction_tasks')){
      if(sql.includes('COUNT'))return [[{total:state.tasks.filter(row=>row.user_id===args[0]&&(!sql.includes("status IN")||['queued','processing'].includes(row.status))).length}]];
      if(sql.includes('LIMIT 5'))return [state.tasks.filter(row=>row.user_id===args[0]&&row.product_id===args[1]).slice(args[2],args[2]+5)];
      return [state.tasks.filter(row=>row.id===args[0]&&(args.length===1||row.user_id===args[1]))];
    }
    if(sql.startsWith('UPDATE video_extraction_tasks')){
      if(sql.includes("status='ready'")){if(fail==='ready')throw Error('ready failed');const row=state.tasks.find(row=>row.id===args[5]);Object.assign(row,{status:'ready',file_size:args[0],charged:args[1],points_spent:args[2]});return [{affectedRows:1}];}
      if(sql.includes("SET status='processing'")){const row=state.tasks.find(row=>row.id===args[1]&&row.user_id===args[2]&&row.status==='queued');if(row)Object.assign(row,{status:'processing',updated_at:args[0]});return [{affectedRows:row?1:0}];}
      if(sql.includes("SET status='failed'")){const row=state.tasks.find(row=>row.id===args[2]&&row.status!=='ready');if(row)Object.assign(row,{status:'failed',error_message:args[0]});return [{affectedRows:row?1:0}];}
      return [{affectedRows:1}];
    }
    if(sql.startsWith('DELETE FROM video_extraction_previews'))return [{affectedRows:0}];
    throw Error(`Unexpected SQL ${sql}`);
  };
  const runtime=load('../db/mysql-runtime.ts',{'mysql2/promise':{createPool:()=>({execute:(sql,args)=>query(sql,args),getConnection:async()=>{const connection={beginTransaction:async()=>{},execute:(sql,args)=>query(sql,args,connection),commit:async()=>{},rollback:async()=>{if(connection.snapshot)state=connection.snapshot;},release:()=>connection.unlock?.()};return connection;}})}},{process:{env:{MYSQL_HOST:'mock',MYSQL_USER:'mock',MYSQL_PASSWORD:'mock',MYSQL_DATABASE:'mock'}}});
  const pointService=load('../lib/points-service.ts',{'@/db/mysql-runtime':runtime,'@/db/setup':{getVerifiedSessionPhone:()=>null},'./points':points});
  const service=load('../lib/video-service.ts',{'@/db/mysql-runtime':runtime,'@/db/setup':{getVerifiedSessionPhone:()=>null},'./points-service':pointService,'./tool-entitlements':entitlement,'./video-options':options,'./video-engine':{materializeVideo,videoEngineHealth:async()=>({engineReady:true,mergeReady:true,maxSizeMb:200}),videoStorage:()=>join(process.cwd(),'.video-nonexistent-test'),videoTaskDirectory:()=>join(process.cwd(),'.video-nonexistent-test',id)}});
  return {service,get state(){return state;},log};
}
test('文件成功后才原子扣积分；同任务重复完成不重复扣费，其他账号不可访问',async()=>{
  const db=database(); const result=await db.service.finishVideoTask(1,id,1000);assert.equal(result.pointsSpent,10);assert.equal(db.state.balance,90);assert.equal(db.state.ledger.length,1);assert.equal(db.state.tasks[0].status,'ready');
  await db.service.finishVideoTask(1,id,1000);assert.equal(db.state.balance,90);assert.equal(db.state.ledger.length,1);
  await assert.rejects(db.service.finishVideoTask(2,id,1000),/不存在/);await assert.rejects(db.service.readVideoTask(2,id),/不属于/);
});
test('两个并发任务争用最后积分只有一个成功，无负数、无多扣',async()=>{
  const db=database({balance:10,tasks:[taskRow(),taskRow({id:id2})]});const results=await Promise.allSettled([db.service.finishVideoTask(1,id,1000),db.service.finishVideoTask(1,id2,1000)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(db.state.balance,0);assert.equal(db.state.ledger.length,1);assert.equal(db.state.tasks.filter(t=>t.status==='ready').length,1);
});
test('成品状态写入失败回滚积分；过期、配置或费用变化不扣费',async()=>{
  const broken=database({fail:'ready'});await assert.rejects(broken.service.finishVideoTask(1,id,1000));assert.equal(broken.state.balance,100);assert.equal(broken.state.ledger.length,0);assert.equal(broken.state.tasks[0].status,'processing');
  for(const setup of [{cost:20},{mode:'pending'},{tasks:[taskRow({expires_at:'2000-01-01T00:00:00Z'})]},{tasks:[taskRow({status:'queued'})]}]){const db=database(setup);await assert.rejects(db.service.finishVideoTask(1,id,1000));assert.equal(db.state.balance,100);assert.equal(db.state.ledger.length,0);}
});
test('有效会员优先于次数和积分；剩余一次并发只成功一次；失败回滚次数',async()=>{
  const order={id:'order',user_id:1,product_id:4,tool_billing_cycle:'times',tool_uses_remaining:1,tool_paid_at:now()};
  const member=database({orders:[order,{...order,id:'month',tool_billing_cycle:'month'}]});await member.service.finishVideoTask(1,id,1000);assert.equal(member.state.balance,100);assert.equal(member.state.orders[0].tool_uses_remaining,1);assert.equal(member.state.events.length,1);
  const once=database({mode:'paid',tasks:[taskRow({billing_mode:'paid'}),taskRow({id:id2,billing_mode:'paid'})],orders:[order]});const results=await Promise.allSettled([once.service.finishVideoTask(1,id,1000),once.service.finishVideoTask(1,id2,1000)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(once.state.orders[0].tool_uses_remaining,0);assert.equal(once.state.events.length,1);
  const broken=database({orders:[order],fail:'event'});await assert.rejects(broken.service.finishVideoTask(1,id,1000));assert.equal(broken.state.orders[0].tool_uses_remaining,1);
});
test('解析结果保存不扣费、不向客户端输出源站签名地址或请求头',async()=>{
  const db=database({tasks:[]});const preview=await db.service.saveVideoPreview(1,{id:4},{title:'视频',source:'example.com',sourceUrl:'https://example.com/watch',duration:30,thumbnail:'https://example.com/cover',formats:[{id:'direct',extension:'mp4',label:'MP4',height:0,size:100,parts:[{url:'https://cdn.example/secret?signature=abc',headers:{Referer:'secret'},extension:'mp4'}]}]});
  assert.equal(db.state.balance,100);assert.equal(db.state.ledger.length,0);assert.equal('parts' in preview.formats[0],false);assert.ok(!JSON.stringify(preview).includes('signature'));assert.match(preview.coverUrl,/^\/api\/tools\/video-extractor/);
});
test('已有任务重复提交返回原任务，即使余额不足；参数或所属账号不匹配拒绝',async()=>{
  const hash=createHash('sha256').update(JSON.stringify({previewId,formatId:'direct'})).digest('hex');
  const db=database({balance:0,tasks:[taskRow({status:'ready',request_hash:hash})]});
  const task=await db.service.queueVideoTask(1,{id:4,tool_charge_type:'points',tool_points_cost:10},id,previewId,'direct');assert.equal(task.status,'ready');assert.equal(db.state.balance,0);
  await assert.rejects(db.service.queueVideoTask(1,{id:4,tool_charge_type:'points',tool_points_cost:10},id,previewId,'other'),/不匹配/);
});
test('下载失败不进入扣费事务；工作线程重复触发也只领取一次',async()=>{
  let calls=0;const db=database({tasks:[taskRow({status:'queued'})],materializeVideo:async()=>{calls++;throw new options.VideoError('源站下载失败',422);}});
  db.service.startVideoTask(id,1);db.service.startVideoTask(id,1);
  for(let i=0;i<30&&db.state.tasks[0].status!=='failed';i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(calls,1);assert.equal(db.state.tasks[0].status,'failed');assert.equal(db.state.balance,100);assert.equal(db.state.ledger.length,0);
});
test('从保存解析、创建任务到文件生成后扣费完整衔接，排队和处理期间不扣积分',async()=>{
  let complete;const waiting=new Promise(resolve=>{complete=resolve;});
  const db=database({tasks:[],materializeVideo:async()=>{await waiting;return{path:join(process.cwd(),'unused-video-test.mp4'),size:1200};}});
  const preview=await db.service.saveVideoPreview(1,{id:4},{title:'视频',source:'example.com',sourceUrl:'https://example.com',thumbnail:'',duration:20,formats:[{id:'direct',extension:'mp4',label:'MP4',height:0,size:1200,parts:[{url:'https://cdn.example/v',headers:{},extension:'mp4'}]}]});
  const queued=await db.service.queueVideoTask(1,{id:4,tool_charge_type:'points',tool_points_cost:10},id,preview.id,'direct');
  assert.equal(queued.status,'queued');assert.equal(db.state.balance,100);assert.equal(db.state.ledger.length,0);
  complete();for(let i=0;i<30&&db.state.tasks[0].status!=='ready';i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(db.state.tasks[0].status,'ready');assert.equal(db.state.balance,90);assert.equal(db.state.ledger.length,1);
});
test('解析限流包含失败尝试，释放可重入但不重置小时额度；过期成品不提供下载',async()=>{
  const db=database({tasks:[taskRow({status:'ready',expires_at:'2000-01-01T00:00:00Z'})]});
  const a=db.service.beginVideoAnalysis(1),b=db.service.beginVideoAnalysis(1);assert.throws(()=>db.service.beginVideoAnalysis(1),/较多/);a();a();b();
  for(let i=0;i<28;i++)db.service.beginVideoAnalysis(1)();assert.throws(()=>db.service.beginVideoAnalysis(1),/较多/);
  await assert.rejects(db.service.videoDownloadFile(1,id),/期限已过/);
});

test('API 解析需真实登录，参数错误和依赖缺失清晰返回且不创建提取任务',async()=>{
  let signedIn=false,queued=0,analyzed=0;
  const route=load('../app/api/tools/video-extractor/route.ts',{'@/lib/video-options':options,'@/lib/video-engine':{inspectVideo:async()=>{analyzed++;throw new options.VideoError('平台解析引擎尚未安装',503);}},'@/lib/video-network':network,'@/lib/points-service':{PointsError:class extends Error{}},'@/lib/video-service':{videoUser:async()=>signedIn?{id:1}:null,getVideoTool:async()=>({id:4}),videoPreviewLimit:async()=>{},beginVideoAnalysis:()=>()=>{},queueVideoTask:async()=>{queued++;}}});
  const post=body=>route.POST(new Request('https://shop.example/api/tools/video-extractor',{method:'POST',body:JSON.stringify(body)}));
  assert.equal((await post({action:'analyze',input:'https://b23.tv/test'})).status,401);signedIn=true;
  assert.equal((await post({action:'analyze',input:'file:///etc/passwd'})).status,400);assert.equal((await post({action:'analyze',input:'https://b23.tv/test'})).status,503);assert.equal(analyzed,1);assert.equal(queued,0);
  assert.equal((await post({action:'extract',id:'../file'})).status,400);
});
test('成品下载鉴权、Range 和文件名编码；下载不触发任何扣费',async t=>{
  const root=await scratch(t),path=join(root,'video.mp4');await writeFile(path,media);let signedIn=true;const calls=[];
  const route=load('../app/api/tools/video-extractor/download/route.ts',{'@/lib/video-options':options,'@/lib/video-service':{videoUser:async()=>signedIn?{id:1}:null,videoDownloadFile:async(user,uuid)=>{calls.push([user,uuid]);return{path,size:media.length,task:{title:'中文视频',file_extension:'mp4'}};}}});
  const range=await route.GET(new Request(`https://shop.example/api?id=${id}`,{headers:{Range:'bytes=4-11'}}));assert.equal(range.status,206);assert.deepEqual(Buffer.from(await range.arrayBuffer()),media.subarray(4,12));assert.equal(range.headers.get('cache-control'),'private, no-store');assert.match(range.headers.get('content-disposition'),/UTF-8''%/);
  assert.equal((await route.GET(new Request(`https://shop.example/api?id=${id}`,{headers:{Range:'bytes=10000-20000'}}))).status,416);
  signedIn=false;assert.equal((await route.GET(new Request(`https://shop.example/api?id=${id}`))).status,401);assert.equal(calls.length,2);
});
test('商品图片接口拒绝通过父路径读取私有视频与项目文件',async()=>{
  let reads=0;const route=load('../app/api/product-images/route.ts',{'node:fs/promises':{readFile:async()=>{reads++;return Buffer.from('private');}},'../../../lib/admin-auth':{}});
  for(const key of [`products/../video-extractions/${id}/result.mp4`,'products/../../.env.mysql','products\\..\\private.png','products/../video-extractions/fake.png'])assert.equal((await route.GET(new Request(`https://shop.example/api?key=${encodeURIComponent(key)}`))).status,404);
  assert.equal(reads,0);
});
test('独立页面输出商场导航、SEO、三步流程及真实操作入口',async()=>{
  const Link=({href,children,...props})=>React.createElement('a',{href,...props},children), Image=props=>React.createElement('img',props);
  const component=load('../components/video-extractor.tsx',{'next/link':Link,'next/image':Image,'../lib/tool-services':tools,'../lib/video-options':options});
  const tool={id:4,name:'链接视频提取工具',slug:'video-extractor',description:'公开分享链接与网页视频提取',detail:'',logo:'',plans:[],chargeType:'points',pointsCost:10};
  const page=load('../app/tools/[slug]/page.tsx',{'next/link':Link,'next/image':Image,'next/navigation':{notFound(){throw Error('404');},permanentRedirect(){throw Error('redirect');}},'@/components/tool-launch':{ToolLaunch:()=>null},'@/components/storefront-header':{StorefrontHeader:()=>React.createElement('nav',null,'AI商城服务')},'@/components/stamp-maker':{StampMaker:()=>null},'@/components/video-extractor':component,'@/lib/tool-services':tools,'@/lib/tool-service-data':{getPublishedTool:async()=>tool}});
  const html=renderToStaticMarkup(await page.default({params:Promise.resolve({slug:'video-extractor.html'})}));
  for(const text of ['AI商城服务','粘贴视频链接','免费解析','B站','Facebook','我的提取记录','SoftwareApplication'])assert.ok(html.includes(text),text);
  const metadata=await page.generateMetadata({params:Promise.resolve({slug:'video-extractor.html'})});assert.ok(metadata.description.includes('B站'));assert.match(metadata.alternates.canonical,/video-extractor\.html$/);
  assert.equal(tools.builtInToolEntry('video-extractor'),'/tools/video-extractor.html');
});
test('页面解析不发提取请求，连点不重复提交，网络失败重试沿用原任务编号',async()=>{
  const slots=[],effects=[],requests=[];let cursor=0,fail=true;
  const react={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useCallback:fn=>fn,useEffect:fn=>effects.push(fn)};
  const access={signedIn:true,canExtract:true,chargeType:'points',pointsBalance:100,pointsCost:10,history:[],page:1,total:0,engineReady:true,mergeReady:true,maxSizeMb:200};
  const preview={id:previewId,title:'测试视频',source:'www.bilibili.com',sourceUrl:'https://www.bilibili.com/video/BVabc',duration:20,expiresAt:future(),coverUrl:'',formats:[{id:'direct',label:'720p MP4',height:720,extension:'mp4',size:1000}]};
  const component=load('../components/video-extractor.tsx',{react,'next/link':()=>null,'next/image':()=>null,'../lib/tool-services':tools,'../lib/video-options':options},{fetch:async(url,config)=>{
    if(config?.method==='POST'){const body=JSON.parse(config.body);requests.push(body);if(body.action==='analyze')return Response.json({preview});if(fail)throw Error('网络中断');return Response.json({task:{...taskRow(),id:body.id,title:'测试视频',status:'ready',downloadUrl:'/api/tools/video-extractor/download?id='+body.id,expiresAt:future(),format:'720p',size:1000,pointsSpent:10}});}
    if(url.includes('?task='))return Response.json({message:'尚未找到任务'},{status:404});return Response.json(access);
  }});
  const render=()=>{cursor=0;effects.length=0;return component.VideoExtractor({tool:{id:4,name:'链接视频提取工具',plans:[],chargeType:'points'}});};
  const all=node=>Array.isArray(node)?node.flatMap(all):React.isValidElement(node)?[node,...all(node.props.children)]:[];
  const text=node=>Array.isArray(node)?node.map(text).join(''):React.isValidElement(node)?text(node.props.children):typeof node==='string'?node:'';
  const button=(tree,label)=>all(tree).find(node=>node.type==='button'&&text(node).startsWith(label));
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  render();effects[0]();await flush();
  all(render()).find(node=>node.type==='textarea').props.onChange({target:{value:'https://www.bilibili.com/video/BVabc'}});
  button(render(),'开始解析').props.onClick();await flush();assert.deepEqual(requests.map(r=>r.action),['analyze']);
  let extract=button(render(),'提取视频');extract.props.onClick();extract.props.onClick();await flush();
  assert.equal(requests.filter(r=>r.action==='extract').length,1);const previous=requests.at(-1).id;
  fail=false;button(render(),'提取视频').props.onClick();await flush();assert.equal(requests.at(-1).id,previous);
  assert.ok(all(render()).some(node=>node.type==='a'&&node.props.href==='/api/tools/video-extractor/download?id='+previous));
});
