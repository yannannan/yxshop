'use client';
/* eslint-disable @next/next/no-img-element -- Private chat images require authenticated same-origin requests. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownTrayIcon, ArrowUpTrayIcon, DocumentIcon, PaperClipIcon, PhotoIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useI18n } from './language-provider';
import { chatFileLimit, chatMine, type ChatRow } from '../lib/consultation-message.mjs';

type Audience = 'customer' | 'admin' | 'technician';
export function ChatMessages({ messages, audience, notice, className='' }: { messages: ChatRow[]; audience: Audience; notice?: ReactNode; className?: string }) {
  const { t, locale }=useI18n(), label=(text:string)=>audience==='admin'?text:t(text);
  const container=useRef<HTMLDivElement>(null), follow=useRef(true), lastId=messages.at(-1)?.id;
  const previous=useRef<string|number|undefined>(undefined);
  const scroll=()=>{ if (container.current && follow.current) container.current.scrollTop=container.current.scrollHeight; };
  useEffect(()=>{
    if (previous.current!==lastId && messages.length && chatMine(messages.at(-1)!.sender_type,audience)) follow.current=true;
    previous.current=lastId;
    if (container.current && follow.current) container.current.scrollTop=container.current.scrollHeight;
  },[lastId,messages,audience]);
  return <div className={`chat-thread ${className}`} ref={container} role="log" aria-live="polite" aria-relevant="additions" onScroll={event=>{const box=event.currentTarget;follow.current=box.scrollHeight-box.scrollTop-box.clientHeight<80;}}>
    {notice}
    {messages.map(message=>{
      const mine=chatMine(message.sender_type,audience), date=new Date(message.created_at);
      return <article key={message.id} className={`chat-bubble ${mine?'is-mine':''}`} data-sender={message.sender_type}>
        <b>{label(message.sender_type==='customer'?'客户':'技术人员 / 平台')}</b>
        {message.content&&<p>{message.content}</p>}
        {message.attachments?.map(file=>{
          const href=`/api/technical-chat/attachment?audience=${audience}&message=${encodeURIComponent(message.id)}&file=${encodeURIComponent(file.id)}`;
          return <div className="chat-attachment" key={file.id}>
            {file.image&&<a className="chat-image-link" href={href+'&inline=1'} target="_blank" rel="noopener noreferrer" title={label('查看原图')}><img src={href+'&inline=1'} alt={file.name} loading="lazy" onLoad={scroll}/></a>}
            <a className="chat-file-link" href={href} download={file.name}><DocumentIcon aria-hidden="true"/><span><strong title={file.name}>{file.name}</strong><small>{fileSize(file.size)} · {label('下载附件')}</small></span><ArrowDownTrayIcon aria-hidden="true"/></a>
          </div>;
        })}
        <time dateTime={Number.isNaN(date.getTime())?undefined:date.toISOString()}>{Number.isNaN(date.getTime())?label('刚刚'):date.toLocaleString(audience==='admin'?'zh-CN':locale,{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})}</time>
      </article>;
    })}
  </div>;
}
export function ChatComposer({ audience, serviceSlug, consultationId, onSent }: { audience:Audience; serviceSlug?:string; consultationId?:number; onSent:()=>Promise<void> }) {
  const { t }=useI18n(), label=(text:string)=>audience==='admin'?text:t(text);
  const [text,setText]=useState(''),[file,setFile]=useState<File|null>(null),[sending,setSending]=useState(false),[error,setError]=useState('');
  const busy=useRef(false), images=useRef<HTMLInputElement>(null), files=useRef<HTMLInputElement>(null);
  function pick(value:File|undefined) {
    if (!value) return;
    if (!value.size || value.size>chatFileLimit) {setError(label('附件不能为空且最大20MB'));return;}
    setFile(value);setError('');
  }
  async function send() {
    if (busy.current || (!text.trim()&&!file)) return;
    busy.current=true;setSending(true);setError('');
    try {
      const payload:Record<string,string>={content:text.trim(),...(serviceSlug?{serviceSlug}:{}),...(consultationId?{consultationId:String(consultationId)}:{})};
      const form=new FormData();for(const [key,value] of Object.entries(payload))form.append(key,value);if(file)form.append('file',file);
      const response=await fetch(`/api/technical-chat/messages?audience=${audience}`,{method:'POST',...(file?{body:form}:{headers:{'content-type':'application/json'},body:JSON.stringify(payload)})});
      const result=await response.json() as {message?:string};
      if (!response.ok) throw new Error(result.message||'消息发送失败，请稍后重试。');
      setText('');setFile(null);
      await onSent().catch(()=>{});
    } catch(error) {setError(label(error instanceof Error?error.message:'消息发送失败，请稍后重试。'));}
    finally {busy.current=false;setSending(false);}
  }
  return <div className="chat-composer">
    <div className="chat-composer-tools"><div><button type="button" disabled={sending} onClick={()=>images.current?.click()}><PhotoIcon aria-hidden="true"/>{label('图片')}</button><button type="button" disabled={sending} onClick={()=>files.current?.click()}><PaperClipIcon aria-hidden="true"/>{label('文件')}</button></div><small>{label('单个附件最大20MB')}</small></div>
    <input hidden ref={images} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={e=>{pick(e.target.files?.[0]);e.target.value='';}}/>
    <input hidden ref={files} type="file" onChange={e=>{pick(e.target.files?.[0]);e.target.value='';}}/>
    {file&&<div className="chat-selected-file"><DocumentIcon aria-hidden="true"/><span title={file.name}>{file.name}<small>{fileSize(file.size)}</small></span><button type="button" disabled={sending} aria-label={label('移除附件')} onClick={()=>setFile(null)}><XMarkIcon aria-hidden="true"/></button></div>}
    <textarea aria-label={label('消息内容')} rows={4} maxLength={4000} disabled={sending} value={text} onChange={e=>setText(e.target.value)} placeholder={label('请输入咨询内容，支持换行')} onKeyDown={event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.nativeEvent.isComposing){event.preventDefault();void send();}}}/>
    {error&&<div className="chat-send-error" role="alert">{error}</div>}
    <div className="chat-composer-bottom"><small>{label('Ctrl / ⌘ + Enter 发送')}</small><button type="button" className="chat-send" disabled={sending||(!text.trim()&&!file)} onClick={()=>void send()}><ArrowUpTrayIcon aria-hidden="true"/>{label(sending?'发送中…':'发送')}</button></div>
  </div>;
}
function fileSize(size:number) {return size>=1024*1024?`${(size/1024/1024).toFixed(1)} MB`:size>=1024?`${(size/1024).toFixed(1)} KB`:`${size} B`;}
