import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import { File } from 'node:buffer';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as model from '../lib/consultation-message.mjs';
import { createChatStorage, chatImageMime } from '../lib/consultation-storage.mjs';
const require=createRequire(import.meta.url);
function load(file,mocks={},globals={}) {
  const output={exports:{}}, code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module:output,exports:output.exports,Request,Response,FormData,File,URL,Buffer,Date,console,...globals,require(name){if(name in mocks)return mocks[name];if(name.startsWith('react')||name.startsWith('@heroicons'))return require(name);throw Error('Unmocked '+name);}});
  return output.exports;
}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j/p8AAAAASUVORK5CYII=','base64');
const file=()=>new File([png],'测试图片.png',{type:'image/png'});
const settings={VIDEO_OSS_BUCKET:'yxstarshop',VIDEO_OSS_REGION:'oss-cn-shanghai',VIDEO_OSS_ACCESS_KEY_ID:'offline-id',VIDEO_OSS_ACCESS_KEY_SECRET:'offline-secret'};
function cloud() {
  const objects=new Map(),deleted=[],calls=[];let corrupt=false,readStream;
  const storage=createChatStorage({environment:()=>settings,createClient:options=>{
    calls.push(options);
    return {async put(key,bytes,options){objects.set(key,{bytes,options});},async head(key){const o=objects.get(key);return {res:{headers:{'content-length':corrupt?999:o.bytes.length,'x-oss-meta-yxshop-sha256':o.options.meta['yxshop-sha256']}}};},async delete(key){deleted.push(key);objects.delete(key);},async getStream(key){const o=objects.get(key);readStream=Readable.from([o.bytes]);return {stream:readStream,res:{headers:{'content-length':o.bytes.length,'x-oss-meta-yxshop-sha256':o.options.meta['yxshop-sha256']}}};}};
  }});
  return {storage,objects,deleted,calls,setCorrupt(){corrupt=true;},stream:()=>readStream};
}
function database() {
  const sql=new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT,phone TEXT,status TEXT);INSERT INTO users VALUES(1,'a@b.com','13500000001','active'),(2,'other@b.com','13500000002','active');
  CREATE TABLE technical_providers(id INTEGER PRIMARY KEY,name TEXT,status TEXT);INSERT INTO technical_providers VALUES(5,'技术人员A','active');
  CREATE TABLE technical_services(id INTEGER PRIMARY KEY,provider_id INTEGER,slug TEXT,status TEXT);INSERT INTO technical_services VALUES(7,5,'repair','active');
  CREATE TABLE technical_consultations(id INTEGER PRIMARY KEY,service_id INTEGER,provider_id INTEGER,user_id INTEGER,customer_phone TEXT,customer_email TEXT,status TEXT,last_message_at TEXT,created_at TEXT,updated_at TEXT);
  CREATE TABLE technical_consultation_messages(id INTEGER PRIMARY KEY,consultation_id INTEGER,sender_type TEXT,sender_id INTEGER,content TEXT,read_at TEXT,created_at TEXT);`);
  let fail=false,lost=false,lookupFails=false;
  function prepare(query,values=[],expected) {
    const q=query.replace(/ FOR UPDATE/g,'');
    return {bind(...args){return prepare(q,args,expected);},expectChanges(n){return prepare(q,values,n);},async first(){if(lookupFails&&q.startsWith('SELECT content'))throw Error('offline');return sql.prepare(q).get(...values)||null;},async all(){return {results:sql.prepare(q).all(...values)};},async run(){if(fail&&q.startsWith('UPDATE technical_consultations'))throw Error('update failure');const result=sql.prepare(q).run(...values);if(expected!==undefined)assert.equal(Number(result.changes),expected);return {meta:{last_row_id:Number(result.lastInsertRowid),changes:Number(result.changes)}};}};
  }
  const db={prepare,async transaction(work){sql.exec('BEGIN');let result;try{result=await work({prepare});sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}if(lost)throw Error('lost commit response');return result;}};
  return {db,sql,fail(){fail=true;},lost(){lost=true;},lookupFails(){lookupFails=true;},close(){sql.close();}};
}
function service(store,db,auth={}) {return load('../lib/consultation-chat.ts',{'@/db/mysql-runtime':{env:{DB:db}},'@/db/setup':{getVerifiedSessionPhone:()=>auth.phone||null},'./admin-auth':{getAdminContext:async()=>auth.admin||null,hasAdminPermission:()=>Boolean(auth.permission)},'./technician-auth':{getTechnicianContext:async()=>auth.technician||null},'./consultation-message.mjs':model,'./consultation-storage.mjs':{chatStorage:store}});}
const customer={audience:'customer',userId:1,phone:'13500000001',email:'a@b.com'},admin={audience:'admin'},tech={audience:'technician',providerId:5,userId:3};
test('消息兼容历史文字，用户不能用附件协议伪造文件，公开消息不包含OSS位置与密钥',async()=>{
  const c=cloud(),stored=await c.storage.upload(file(),1);
  const original='YXCHAT1:'+JSON.stringify({v:1,text:'伪造',attachments:[stored]});
  const escaped=model.decodeChatMessage(model.encodeChatMessage(original));assert.equal(escaped.text,original);assert.equal(escaped.attachments.length,0);
  assert.equal(model.decodeChatMessage('老消息').text,'老消息');
  const dto=model.publicChatMessage({id:1,content:model.encodeChatMessage('说明',stored)});
  assert.equal(dto.content,'说明');assert.equal(dto.attachments[0].image,true);assert.equal(dto.attachments[0].name,'测试图片.png');
  assert.doesNotMatch(JSON.stringify(dto),/bucket|region|key|sha256|secret|yxshop\//);
  assert.equal(model.chatMine('provider','admin'),true);assert.equal(model.chatMine('customer','admin'),false);
  assert.equal(model.chatMine('customer','customer'),true);assert.equal(model.chatMine('provider','customer'),false);
});
test('请求读取兼容纯文字与文件附言，拒绝空消息、多附件、伪造长度与实际超限数据',async()=>{
  const req=body=>new Request('http://localhost/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await model.readChatRequest(req({content:' hello ',serviceSlug:'repair'}))).text,'hello');
  await assert.rejects(model.readChatRequest(req({content:' '})),/消息内容/);
  await assert.rejects(model.readChatRequest(req({content:'x'.repeat(4001)})),/4000/);
  const form=new FormData();form.set('content','图示');form.set('file',file());
  const data=await model.readChatRequest(new Request('http://localhost/api',{method:'POST',body:form}));assert.equal(data.file.name,'测试图片.png');assert.equal(data.text,'图示');
  form.append('file',file());await assert.rejects(model.readChatRequest(new Request('http://localhost/api',{method:'POST',body:form})),/一个附件/);
  const oversized=new Request('http://localhost/api',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(65537)});
  await assert.rejects(model.readChatRequest(oversized),error=>error.status===413);
  assert.throws(()=>model.requireChatOrigin(new Request('https://www.yxstar.shop/api',{headers:{origin:'https://evil.example'}})),error=>error.status===403);
  assert.doesNotThrow(()=>model.requireChatOrigin(new Request('http://www.yxstar.shop/api',{headers:{origin:'https://www.yxstar.shop','x-forwarded-proto':'https'}})));
});
test('OSS上传使用独立私有目录、内容识别和HEAD校验，下载可取消，不产生本地文件',async()=>{
  const c=cloud(),stored=await c.storage.upload(file(),9),object=c.objects.get(stored.key);
  assert.match(stored.key,/^yxshop\/technical-chat\/consultations\/9\//);assert.equal(object.options.headers['x-oss-object-acl'],'private');assert.equal(object.options.headers['x-oss-forbid-overwrite'],'true');
  assert.ok(c.calls.every(options=>options.secure&&options.authorizationV4&&options.bucket==='yxstarshop'));
  const controller=new AbortController(),body=await c.storage.download(stored,9,controller.signal);
  assert.deepEqual(Buffer.from(await new Response(body).arrayBuffer()),png);
  await assert.rejects(c.storage.download(stored,10,controller.signal),/记录异常/);
  assert.equal(chatImageMime(Buffer.from('<svg onload="bad"/>')),'application/octet-stream');
  const html=await c.storage.upload(new File(['<html>script</html>'],'page.png',{type:'image/png'}),9);assert.equal(html.mime,'application/octet-stream');
  const abort=new AbortController();await c.storage.download(stored,9,abort.signal);abort.abort();assert.equal(c.stream().destroyed,true);
  c.setCorrupt();await assert.rejects(c.storage.upload(file(),9),/上传失败/);assert.equal(c.deleted.length,1);assert.equal(c.objects.has(stored.key),true);
});
test('文字无需OSS，客户/技术员/管理员收发同一会话，跨会话拒绝，附件下载验证身份和响应类型',async()=>{
  const d=database(),c=cloud(),s=service(c.storage,d.db),id=await s.resolveChatConsultation(customer,{serviceSlug:'repair'});
  assert.equal(await s.resolveChatConsultation(customer,{serviceSlug:'repair'}),id);
  await s.saveChatMessage(customer,id,'客户文字');await s.saveChatMessage(tech,id,'技术回复');await s.saveChatMessage(admin,id,'平台回复',file());
  const rows=d.sql.prepare('SELECT * FROM technical_consultation_messages').all();assert.equal(rows.length,4);assert.equal(rows[1].sender_type,'customer');assert.equal(rows[2].sender_type,'provider');assert.equal(rows[3].sender_id,null);
  const attachment=model.decodeChatMessage(rows[3].content).attachments[0];
  const url=`http://localhost/api/technical-chat/attachment?message=${rows[3].id}&file=${attachment.id}&inline=1`;
  for(const actor of [customer,tech,admin]) {const response=await s.chatAttachment(new Request(url),actor);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);}
  const download=await s.chatAttachment(new Request(url.replace('&inline=1','')),customer);assert.match(download.headers.get('content-disposition'),/^attachment;/);await download.body.cancel();
  const other={...customer,userId:2};await assert.rejects(s.chatAttachment(new Request(url),other),error=>error.status===404);
  await assert.rejects(s.resolveChatConsultation({...tech,providerId:6},{consultationId:id}),error=>error.status===404);
  await assert.rejects(s.saveChatMessage(other,id,'越权',file()),error=>error.status===404);assert.equal(c.objects.size,1);
  const noOSS=service(createChatStorage({environment:()=>({})}),d.db);await noOSS.saveChatMessage(customer,id,'不需要云存储');await assert.rejects(noOSS.saveChatMessage(customer,id,'',file()),error=>error.status===503);
  d.close();
});
test('消息事务失败回滚并清理本次附件；丢失提交响应读回成功，不能删除已保存的文件',async()=>{
  for(const lost of [false,true]) {
    const d=database(),c=cloud(),s=service(c.storage,d.db),id=await s.resolveChatConsultation(customer,{serviceSlug:'repair'});
    if(lost)d.lost();else d.fail();
    if(lost){const result=await s.saveChatMessage(admin,id,'保存成功',file());assert.equal(result.ok,true);assert.equal(c.deleted.length,0);assert.equal(d.sql.prepare('SELECT COUNT(*) n FROM technical_consultation_messages').get().n,2);}
    else{await assert.rejects(s.saveChatMessage(admin,id,'失败',file()),/update failure/);assert.equal(c.deleted.length,1);assert.equal(d.sql.prepare('SELECT COUNT(*) n FROM technical_consultation_messages').get().n,1);}
    d.close();
  }
});
test('鉴权先于上传体读取，不能用audience参数获取管理员或其他技术人员身份',async()=>{
  const d=database(),c=cloud();
  for(const audience of ['admin','technician','customer']) {
    const s=service(c.storage,d.db),handlers=load('../app/api/technical-chat/messages/route.ts',{'@/db/setup':{ensureDatabase:async()=>{}},'@/lib/consultation-chat':s,'@/lib/consultation-message.mjs':model});
    const response=await handlers.POST(new Request(`http://localhost/api?audience=${audience}`,{method:'POST',body:'malformed'}));assert.ok([401,403].includes(response.status));
  }
  const permitted=service(c.storage,d.db,{admin:{},permission:true});assert.equal((await permitted.chatActor(new Request('http://localhost/?audience=admin'))).audience,'admin');
  const customerAuth=service(c.storage,d.db,{phone:'13500000001'});assert.equal((await customerAuth.chatActor(new Request('http://localhost/?audience=customer'))).userId,1);
  d.close();
});
test('实际POST处理器保存multipart图片消息，失败回执不包含内部错误，实际下载路由只允许所属用户',async()=>{
  const d=database(),c=cloud(),s=service(c.storage,d.db,{phone:'13500000001'});
  const route=load('../app/api/technical-chat/messages/route.ts',{'@/db/setup':{ensureDatabase:async()=>{}},'@/lib/consultation-chat':s,'@/lib/consultation-message.mjs':model});
  const form=new FormData();form.set('serviceSlug','repair');form.set('content','现场图片');form.set('file',file());
  const response=await route.POST(new Request('http://localhost/api?audience=customer',{method:'POST',body:form}));assert.equal(response.status,200);const data=await response.json();assert.ok(data.messageId);
  const attachment=model.decodeChatMessage(d.sql.prepare('SELECT content FROM technical_consultation_messages WHERE id=?').get(data.messageId).content).attachments[0];
  const get=load('../app/api/technical-chat/attachment/route.ts',{'@/db/setup':{ensureDatabase:async()=>{}},'@/lib/consultation-chat':s});
  const read=await get.GET(new Request(`http://localhost/api?audience=customer&message=${data.messageId}&file=${attachment.id}`));assert.equal(read.status,200);await read.body.cancel();
  const wrong=await get.GET(new Request(`http://localhost/api?audience=customer&message=999&file=${attachment.id}`));assert.equal(wrong.status,404);
  const failure=s.chatFailure(new Error('MYSQL password secret'));assert.equal(failure.status,503);assert.doesNotMatch(await failure.text(),/secret|MYSQL/);d.close();
});
test('管理端与客户气泡方向相反，图片与文件入口可显示，用户文字按原文保留且安全转义',()=>{
  const ui=load('../components/consultation-chat.tsx',{'../lib/consultation-message.mjs':model,'./language-provider':{useI18n:()=>({locale:'zh-CN',t:x=>x})}});
  const messages=[{id:1,sender_type:'customer',content:'<script>客户</script>',created_at:'2026-11-13T00:00:00Z'},{id:2,sender_type:'provider',content:'回复',created_at:'2026-11-13T00:00:01Z',attachments:[{id:'id',name:'截图.png',size:1024,mime:'image/png',image:true}]}];
  const adminHTML=renderToStaticMarkup(React.createElement(ui.ChatMessages,{messages,audience:'admin'}));
  const customerHTML=renderToStaticMarkup(React.createElement(ui.ChatMessages,{messages,audience:'customer'}));
  assert.match(adminHTML,/chat-bubble is-mine[^>]*data-sender="provider"/);assert.match(customerHTML,/chat-bubble is-mine[^>]*data-sender="customer"/);
  assert.match(adminHTML,/&lt;script&gt;客户/);assert.doesNotMatch(adminHTML,/<script>/);assert.match(adminHTML,/inline=1/);assert.match(adminHTML,/download="截图.png"/);
});
test('客户、管理端、技术人员原有读取接口均解码同一附件消息，管理权限过滤依然有效',async()=>{
  const c=cloud(),stored=await c.storage.upload(file(),1),message={id:2,consultation_id:1,sender_type:'provider',content:model.encodeChatMessage('带图回复',stored),created_at:'2026-11-13'};
  const db={prepare(query){return {bind(){return this;},async first(){if(query.includes('FROM users'))return {id:1,email:'a@b.com'};if(query.includes('FROM technical_services s'))return {id:7,provider_id:5,title:'服务',slug:'repair'};if(query.includes('FROM technical_consultations c'))return {id:1};return null;},async all(){return {results:query.includes('technical_consultation_messages')?[message]:[]};},async run(){return {meta:{changes:1}};}};}};
  const runtime={'@/db/mysql-runtime':{env:{DB:db}},'@/lib/consultation-message.mjs':model};
  const customerAPI=load('../app/api/technical-consultations/route.ts',{...runtime,'../../../db/setup':{ensureDatabase:async()=>{},getSessionPhone:()=>customer.phone}});
  const adminAPI=load('../app/api/admin/onsite/route.ts',{...runtime,'../../../../db/setup':{ensureDatabase:async()=>{}},'../../../../lib/admin-auth':{getAdminContext:async()=>({}),hasAdminPermission:()=>true}});
  const technicianAPI=load('../app/api/technician/route.ts',{...runtime,'../../../db/setup':{ensureDatabase:async()=>{}},'../../../lib/technician-auth':{getTechnicianContext:async()=>({provider:{id:5,skillsJson:'[]'},user:{id:3}})}});
  for(const [api,url] of [[customerAPI,'http://localhost/api?serviceSlug=repair'],[adminAPI,'http://localhost/api'],[technicianAPI,'http://localhost/api']]) {
    const result=await api.GET(new Request(url));assert.equal(result.status,200);const data=await result.json();assert.equal(data.messages[0].content,'带图回复');assert.equal(data.messages[0].attachments[0].name,'测试图片.png');assert.doesNotMatch(JSON.stringify(data.messages),/yxshop\/|sha256|bucket/);
  }
  const denied=load('../app/api/admin/onsite/route.ts',{...runtime,'../../../../db/setup':{ensureDatabase:async()=>{}},'../../../../lib/admin-auth':{getAdminContext:async()=>({}),hasAdminPermission:(admin,code)=>Array.isArray(code)||code==='onsite-service-orders'}});
  const filtered=await (await denied.GET(new Request('http://localhost/api'))).json();assert.deepEqual(filtered.messages,[]);
});
const nodes=node=>Array.isArray(node)?node.flatMap(nodes):React.isValidElement(node)?[node,...nodes(node.props.children)]:[];
function composer(fetch) {
  const slots=[];let cursor=0,tree,received=0;
  const hooks={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};}};
  const ui=load('../components/consultation-chat.tsx',{'react':hooks,'../lib/consultation-message.mjs':model,'./language-provider':{useI18n:()=>({locale:'zh-CN',t:x=>x})}},{fetch});
  function render(){cursor=0;tree=ui.ChatComposer({audience:'customer',serviceSlug:'repair',onSent:async()=>{received++;}});return tree;}
  const textarea=()=>nodes(tree).find(n=>n.type==='textarea'),button=()=>nodes(tree).find(n=>n.props.className==='chat-send');
  render();
  return {render,textarea,button,tree:()=>tree,received:()=>received,pick(value){nodes(tree).find(n=>n.type==='input'&&n.props.accept).props.onChange({target:{files:[value],value:''}});render();}};
}
test('多行编辑与附件发送失败后保留草稿；只有Ctrl/Command+Enter发送且中文输入法不误发',async()=>{
  let requests=0,ok=false,payload;
  const h=composer(async(url,options)=>{requests++;payload=options.body;return Response.json({message:'稍后重试'},{status:ok?200:503});});
  assert.equal(h.textarea().props.rows,4);h.textarea().props.onChange({target:{value:'第一行\n第二行'}});h.pick(file());
  h.textarea().props.onKeyDown({key:'Enter',nativeEvent:{isComposing:false}});assert.equal(requests,0);
  h.textarea().props.onKeyDown({key:'Enter',ctrlKey:true,nativeEvent:{isComposing:true}});assert.equal(requests,0);
  h.button().props.onClick();h.button().props.onClick();assert.equal(requests,1);
  await new Promise(setImmediate);h.render();assert.equal(h.textarea().props.value,'第一行\n第二行');assert.ok(nodes(h.tree()).some(n=>n.props.className==='chat-selected-file'));assert.equal(h.received(),0);
  assert.ok(payload instanceof FormData);assert.equal(payload.get('file').name,'测试图片.png');assert.equal(payload.get('serviceSlug'),'repair');
  ok=true;let prevented=false;h.textarea().props.onKeyDown({key:'Enter',metaKey:true,nativeEvent:{isComposing:false},preventDefault(){prevented=true;}});
  await new Promise(setImmediate);h.render();assert.equal(prevented,true);assert.equal(requests,2);assert.equal(h.textarea().props.value,'');assert.equal(h.received(),1);assert.equal(nodes(h.tree()).some(n=>n.props.className==='chat-selected-file'),false);
});
test('仅有附件即可发送，纯文字使用JSON，过大附件在网络请求前给出回执',async()=>{
  let calls=0,options;
  const h=composer(async(url,input)=>{calls++;options=input;return Response.json({ok:true});});
  h.pick(file());assert.equal(h.button().props.disabled,false);h.button().props.onClick();await new Promise(setImmediate);h.render();assert.equal(calls,1);assert.equal(options.headers,undefined);assert.equal(options.body.get('content'),'');
  h.textarea().props.onChange({target:{value:'文字'}});h.render();h.button().props.onClick();await new Promise(setImmediate);h.render();assert.equal(options.headers['content-type'],'application/json');assert.equal(JSON.parse(options.body).content,'文字');
  h.pick({name:'too-large.zip',size:model.chatFileLimit+1});assert.ok(nodes(h.tree()).some(n=>n.props.role==='alert'));assert.equal(calls,2);
});
