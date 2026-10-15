"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, string | number | null>;
type Provider = {
  id: number; providerCode: string; name: string; avatar: string; city: string; experience: string;
  roleName: string; intro: string; skills: string[]; onlineStatus: string; status: string;
};
type Dashboard = {
  authenticated: boolean;
  user: { id: number; phone: string; email: string };
  provider: Provider;
  orders: Row[];
  logs: Row[];
  reviews: Row[];
  consultations: Row[];
  messages: Row[];
  stats: { total: number; waiting: number; inService: number; awaitingAcceptance: number; completed: number; rating: number };
  message?: string;
};
type Tab = "overview" | "waiting" | "in_service" | "awaiting_acceptance" | "completed" | "consultations" | "profile";

const text = (value: unknown) => String(value ?? "");
const statusLabel: Record<string,string> = {
  pending_quote:"待报价",pending_payment:"待支付",payment_review:"支付核验",paid:"待服务",
  in_service:"服务中",awaiting_acceptance:"待客户验收",completed:"已完成",closed:"已关闭",cancelled:"已取消"
};

export default function TechnicianPage() {
  const [data,setData]=useState<Dashboard|null>(null);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  const [tab,setTab]=useState<Tab>("overview");
  const [orderView,setOrderView]=useState<Row|null>(null);
  const [logText,setLogText]=useState("");
  const [finishText,setFinishText]=useState("");
  const [consultationView,setConsultationView]=useState<Row|null>(null);
  const [consultationReply,setConsultationReply]=useState("");
  const [saving,setSaving]=useState(false);
  const [profile,setProfile]=useState({city:"",experience:"",roleName:"",intro:"",skillsText:"",onlineStatus:"online"});

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const response=await fetch(`/api/technician?refresh=${Date.now()}`,{cache:"no-store"});
      const result=await response.json() as Dashboard;
      if(!response.ok){ setData(null); setMessage(result.message||"技术人员工作台读取失败"); return; }
      setData(result); setMessage("");
      setProfile({
        city:result.provider.city||"",experience:result.provider.experience||"",roleName:result.provider.roleName||"",
        intro:result.provider.intro||"",skillsText:(result.provider.skills||[]).join("、"),onlineStatus:result.provider.onlineStatus||"online"
      });
      if(orderView){
        const refreshed=result.orders.find((item)=>text(item.id)===text(orderView.id));
        if(refreshed) setOrderView(refreshed);
      }
    }catch{ setMessage("技术人员工作台读取失败，请稍后重试"); }
    finally{ setLoading(false); }
  },[orderView]);

  useEffect(()=>{ void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ },[]);

  async function action(body:Record<string,string|number>){
    setSaving(true); setMessage("");
    try{
      const response=await fetch("/api/technician",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
      const result=await response.json() as {message?:string};
      if(!response.ok){ setMessage(result.message||"操作失败"); return false; }
      setMessage(result.message||"操作成功"); await load(); return true;
    }catch{ setMessage("操作失败，请稍后重试"); return false; }
    finally{ setSaving(false); }
  }

  const visibleOrders=useMemo(()=>{
    if(!data) return [];
    if(tab==="overview") return data.orders.filter((item)=>["paid","in_service","awaiting_acceptance"].includes(text(item.status)));
    if(tab==="waiting") return data.orders.filter((item)=>text(item.status)==="paid");
    if(tab==="in_service") return data.orders.filter((item)=>text(item.status)==="in_service");
    if(tab==="awaiting_acceptance") return data.orders.filter((item)=>text(item.status)==="awaiting_acceptance");
    if(tab==="completed") return data.orders.filter((item)=>text(item.status)==="completed");
    return [];
  },[data,tab]);

  const currentLogs=useMemo(()=>data&&orderView?data.logs.filter((item)=>text(item.order_id)===text(orderView.id)).slice().reverse():[],[data,orderView]);

  if(loading&&!data) return <main className="technician-workbench"><div className="technician-empty">正在读取技术人员工作台…</div></main>;
  if(!data) return <main className="technician-workbench"><section className="technician-access-card"><span className="brand-mark"><Image src="/yxstar_logo.png" alt="宇星商城" fill sizes="52px"/></span><h1>技术人员工作台</h1><p>{message||"当前账号未绑定技术人员身份。"}</p><p>请先使用商城手机号登录，并由超级管理员在“技术人员”中绑定该手机号。</p><Link href="/">返回宇星商城</Link></section></main>;

  return <main className="technician-workbench">
    <aside className="technician-sidebar">
      <Link className="brand technician-brand" href="/"><span className="brand-mark"><Image src="/yxstar_logo.png" alt="宇星商城" fill sizes="34px"/></span><span>宇星商城</span></Link>
      <div className="technician-profile-mini">{data.provider.avatar?<img src={data.provider.avatar} alt=""/>:<span>{data.provider.name.slice(0,1)}</span>}<div><b>{data.provider.name}</b><small>{data.provider.roleName||"技术人员"}</small></div></div>
      <nav>
        <button className={tab==="overview"?"active":""} onClick={()=>setTab("overview")}>工作台首页</button>
        <button className={tab==="waiting"?"active":""} onClick={()=>setTab("waiting")}>待服务 <em>{data.stats.waiting}</em></button>
        <button className={tab==="in_service"?"active":""} onClick={()=>setTab("in_service")}>服务中 <em>{data.stats.inService}</em></button>
        <button className={tab==="awaiting_acceptance"?"active":""} onClick={()=>setTab("awaiting_acceptance")}>待客户验收 <em>{data.stats.awaitingAcceptance}</em></button>
        <button className={tab==="completed"?"active":""} onClick={()=>setTab("completed")}>已完成 <em>{data.stats.completed}</em></button>
        <button className={tab==="consultations"?"active":""} onClick={()=>setTab("consultations")}>在线咨询 <em>{data.consultations.filter((item)=>text(item.status)==="open").length}</em></button>
        <button className={tab==="profile"?"active":""} onClick={()=>setTab("profile")}>我的资料</button>
      </nav>
      <Link className="technician-store-link" href="/?channel=technical">查看技术服务商城 →</Link>
    </aside>

    <section className="technician-main">
      <header><div><span>TECHNICIAN WORKBENCH</span><h1>{tab==="profile"?"我的资料":"技术服务工作台"}</h1></div><div><b>{data.provider.onlineStatus==="online"?"可服务":"暂停服务"}</b><small>{data.user.phone}</small></div></header>
      {message&&<div className="technician-notice">{message}</div>}

      {tab!=="profile"&&tab!=="consultations"&&<>
        <div className="technician-stat-grid">
          <article><span>服务订单</span><b>{data.stats.total}</b><small>全部历史订单</small></article>
          <article><span>待服务</span><b>{data.stats.waiting}</b><small>已支付待开始</small></article>
          <article><span>服务中</span><b>{data.stats.inService}</b><small>正在实施</small></article>
          <article><span>综合评分</span><b>{data.stats.rating||"—"}</b><small>{data.reviews.length} 条有效评价</small></article>
        </div>
        <section className="technician-panel"><div className="technician-panel-title"><div><h2>{tab==="overview"?"当前待处理服务":statusLabel[tab]||"服务订单"}</h2><p>订单购买后直接归属对应技术人员，不存在派单、抢单或接单流程。</p></div><button disabled={loading} onClick={()=>void load()}>{loading?"刷新中…":"↻ 刷新"}</button></div>
          <div className="technician-order-list">{visibleOrders.map((order)=><article key={text(order.id)} className="technician-order-card">
            <div className="technician-order-head"><div><b>{text(order.service_title)}</b><small>{text(order.id)}</small></div><span className={`technician-status status-${text(order.status)}`}>{statusLabel[text(order.status)]||text(order.status)}</span></div>
            <div className="technician-order-grid">
              <div><span>客户</span><b>{text(order.contact_name)||text(order.customer_phone)}</b><small>{text(order.contact_phone)||text(order.customer_phone)}</small></div>
              <div><span>服务方式</span><b>{text(order.delivery_mode)==="onsite"?"上门服务":"在线服务"}</b><small>{text(order.scheduled_at).replace("T"," ").slice(0,16)}</small></div>
              <div><span>服务地点</span><b>{text(order.delivery_mode)==="onsite"?(text(order.service_address)||"待确认"):"在线服务"}</b><small>{text(order.customer_email)}</small></div>
              <div><span>金额</span><b className="money">{order.amount===null?"待报价":`¥${text(order.amount)}`}</b></div>
            </div>
            <div className="technician-order-actions"><button onClick={()=>{setOrderView(order);setLogText("");setFinishText("");}}>查看详情</button>
              {text(order.status)==="paid"&&<button className="primary" disabled={saving} onClick={()=>void action({action:"start-service",orderId:text(order.id)})}>开始服务</button>}
            </div>
          </article>)}
          {!visibleOrders.length&&<div className="technician-empty">当前没有此状态的服务订单。</div>}</div>
        </section>
      </>}

      {tab==="consultations"&&<section className="technician-panel"><div className="technician-panel-title"><div><h2>在线咨询</h2><p>只显示当前技术人员自己的服务咨询，可直接回复客户。</p></div><button disabled={loading} onClick={()=>void load()}>{loading?"刷新中…":"↻ 刷新"}</button></div>
        <div className="technician-consultation-list">{data.consultations.map((item)=>{const count=data.messages.filter((m)=>Number(m.consultation_id)===Number(item.id)).length;return <article key={text(item.id)}><div><b>{text(item.service_title)}</b><small>会话 #{text(item.id)} · {text(item.customer_phone)}</small></div><p>{text(item.last_message_at).replace("T"," ").slice(0,16)} · {count} 条消息</p><button onClick={()=>{setConsultationView(item);setConsultationReply("");}}>查看 / 回复</button></article>})}{!data.consultations.length&&<div className="technician-empty">暂无在线咨询。</div>}</div>
      </section>}

      {tab==="profile"&&<section className="technician-panel technician-profile-form"><div className="technician-panel-title"><div><h2>我的服务资料</h2><p>姓名、认证状态和账号绑定由管理员维护；服务资料可自行更新。</p></div></div>
        <div className="technician-form-grid"><label><span>姓名</span><input value={data.provider.name} disabled/></label><label><span>人员编码</span><input value={data.provider.providerCode} disabled/></label>
          <label><span>服务城市</span><input value={profile.city} onChange={e=>setProfile({...profile,city:e.target.value})}/></label>
          <label><span>从业经验</span><input value={profile.experience} onChange={e=>setProfile({...profile,experience:e.target.value})}/></label>
          <label className="wide"><span>职业定位</span><input value={profile.roleName} onChange={e=>setProfile({...profile,roleName:e.target.value})}/></label>
          <label className="wide"><span>技能标签</span><input value={profile.skillsText} onChange={e=>setProfile({...profile,skillsText:e.target.value})} placeholder="Linux、服务器、AI部署"/></label>
          <label className="wide"><span>个人介绍</span><textarea value={profile.intro} onChange={e=>setProfile({...profile,intro:e.target.value})}/></label>
          <label><span>服务状态</span><select value={profile.onlineStatus} onChange={e=>setProfile({...profile,onlineStatus:e.target.value})}><option value="online">可服务</option><option value="offline">暂停服务</option></select></label>
        </div><div className="technician-form-actions"><button disabled={saving} onClick={()=>void action({action:"profile-save",...profile})}>{saving?"保存中…":"保存资料"}</button></div>
      </section>}
    </section>

    {consultationView&&<div className="technician-modal-mask"><section className="technician-modal"><header><div><span>ONLINE SUPPORT</span><h2>{text(consultationView.service_title)}</h2><small>会话 #{text(consultationView.id)}</small></div><button onClick={()=>setConsultationView(null)}>×</button></header>
      <div className="technician-chat-thread">{data.messages.filter((item)=>Number(item.consultation_id)===Number(consultationView.id)).map((item)=><article key={text(item.id)} className={text(item.sender_type)==="provider"?"mine":""}><b>{text(item.sender_type)==="provider"?"我":"客户"}</b><p>{text(item.content)}</p><small>{text(item.created_at).replace("T"," ").slice(0,16)}</small></article>)}</div>
      <div className="technician-chat-reply"><textarea value={consultationReply} onChange={e=>setConsultationReply(e.target.value)} placeholder="回复客户咨询内容"/><button className="primary" disabled={saving||!consultationReply.trim()} onClick={async()=>{if(await action({action:"consultation-reply",consultationId:Number(consultationView.id),content:consultationReply}))setConsultationReply("");}}>发送回复</button></div>
    </section></div>}

    {orderView&&<div className="technician-modal-mask"><section className="technician-modal">
      <header><div><span>SERVICE ORDER</span><h2>{text(orderView.service_title)}</h2><small>{text(orderView.id)}</small></div><button onClick={()=>setOrderView(null)}>×</button></header>
      <div className="technician-detail-grid">
        <div><span>状态</span><b>{statusLabel[text(orderView.status)]||text(orderView.status)}</b></div>
        <div><span>服务时间</span><b>{text(orderView.scheduled_at).replace("T"," ").slice(0,16)}</b></div>
        <div><span>客户姓名</span><b>{text(orderView.contact_name)||"—"}</b></div>
        <div><span>联系电话</span><b>{text(orderView.contact_phone)||text(orderView.customer_phone)}</b></div>
        <div className="wide"><span>上门地址</span><b>{text(orderView.delivery_mode)==="onsite"?(text(orderView.service_address)||"—"):"在线服务"}</b></div>
        <div className="wide"><span>客户需求</span><b>{text(orderView.requirement_text)||"未填写补充需求"}</b></div>
      </div>
      <section className="technician-log-section"><h3>服务记录</h3>{currentLogs.map((item)=><article key={text(item.id)}><b>{text(item.log_type)==="start"?"开始服务":text(item.log_type)==="finish"?"完成说明":"服务记录"}</b><p>{text(item.content)}</p><small>{text(item.created_at).replace("T"," ").slice(0,16)}</small></article>)}{!currentLogs.length&&<p className="technician-log-empty">暂无服务记录</p>}</section>
      {text(orderView.status)==="paid"&&<div className="technician-modal-actions"><button className="primary" disabled={saving} onClick={async()=>{if(await action({action:"start-service",orderId:text(orderView.id)})) setOrderView({...orderView,status:"in_service"});}}>开始服务</button></div>}
      {["in_service","awaiting_acceptance"].includes(text(orderView.status))&&<div className="technician-work-form"><label><span>新增服务记录</span><textarea value={logText} onChange={e=>setLogText(e.target.value)} placeholder="记录本次排查、处理、交付或沟通内容"/></label><button disabled={saving||!logText.trim()} onClick={async()=>{if(await action({action:"add-log",orderId:text(orderView.id),content:logText}))setLogText("");}}>保存记录</button></div>}
      {text(orderView.status)==="in_service"&&<div className="technician-work-form finish"><label><span>服务完成说明</span><textarea value={finishText} onChange={e=>setFinishText(e.target.value)} placeholder="说明已经完成的工作、处理结果和交付内容"/></label><button className="primary" disabled={saving||!finishText.trim()} onClick={async()=>{if(await action({action:"finish-service",orderId:text(orderView.id),content:finishText}))setOrderView({...orderView,status:"awaiting_acceptance"});}}>提交完成，等待客户验收</button></div>}
    </section></div>}
  </main>;
}
