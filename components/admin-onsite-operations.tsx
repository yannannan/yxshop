"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, string | number | null>;
type Data = {
  initialized: boolean;
  orders: Row[];
  appointments: Row[];
  consultations: Row[];
  messages: Row[];
  contactRequests: Row[];
  applications: Row[];
  message?: string;
};
const emptyData: Data = { initialized: false, orders: [], appointments: [], consultations: [], messages: [], contactRequests: [], applications: [] };
const text = (value: unknown) => String(value ?? "");

function useOperations() {
  const [data, setData] = useState<Data>(emptyData);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/onsite?refresh=${Date.now()}`, { cache: "no-store" });
      const result = await response.json() as Partial<Data>;
      setData({
        initialized: Boolean(result.initialized),
        orders: result.orders || [],
        appointments: result.appointments || [],
        consultations: result.consultations || [],
        messages: result.messages || [],
        contactRequests: result.contactRequests || [],
        applications: result.applications || [],
        message: result.message,
      });
    } catch {
      setData({ ...emptyData, message: "上门服务后台数据读取失败" });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const action = useCallback(async (body: Record<string, string | number>) => {
    setNotice("");
    const response = await fetch("/api/admin/onsite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as { message?: string };
    if (!response.ok) {
      setNotice(result.message || "操作未完成");
      return false;
    }
    setNotice(result.message || "操作成功");
    await load();
    return true;
  }, [load]);
  return { data, loading, notice, load, action };
}

function InitRequired({ message }: { message?: string }) {
  return <div className="system-init-empty"><b>上门服务数据表尚未初始化</b><p>{message || "请执行上门服务 SQL 后刷新页面。"}</p><code>sql/yxshop-admin-onsite-V1.sql</code></div>;
}
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="admin-modal-mask" role="presentation"><section className="admin-modal onsite-editor-modal onsite-operations-modal" role="dialog" aria-modal="true" aria-label={title}><div className="editor-head"><div><span className="section-kicker">ONSITE SERVICE</span><b>{title}</b></div><button className="modal-close" onClick={onClose}>×</button></div>{children}</section></div>;
}
function Status({ value }: { value: string }) {
  const labels: Record<string, string> = {
    pending_quote: "待报价", pending_payment: "待支付", payment_review: "支付核验", paid: "已支付", accepted: "已接单", in_service: "服务中", completed: "已完成", closed: "已关闭", cancelled: "已取消",
    pending: "待确认", confirmed: "已确认", arrived: "已到场", open: "沟通中", approved: "已通过", rejected: "已驳回",
  };
  return <span className={`status status-${value}`}>{labels[value] || value}</span>;
}
function Header({ title, description, loading, onRefresh }: { title: string; description: string; loading: boolean; onRefresh: () => void }) {
  return <div className="panel-title"><div><h2>{title}</h2><p>{description}</p></div><div className="panel-title-actions"><button className="refresh-list-button" disabled={loading} onClick={onRefresh}>{loading ? "正在刷新…" : "↻ 刷新列表"}</button></div></div>;
}

const orderStatuses = [
  ["pending_quote","待报价"], ["pending_payment","待支付"], ["payment_review","支付核验"], ["paid","已支付"], ["accepted","已接单"], ["in_service","服务中"], ["completed","已完成"], ["closed","已关闭"], ["cancelled","已取消"],
];

export function OnsiteOrderManagement() {
  const { data, loading, notice, load, action } = useOperations();
  const [quote, setQuote] = useState<Row | null>(null);
  const [quoteAmount, setQuoteAmount] = useState("");
  return <>{notice && <div className="admin-message">{notice}</div>}<Header title="服务订单" description="管理技术服务报价、支付确认、接单、实施与完成状态" loading={loading} onRefresh={() => void load()} />
    {!data.initialized ? <InitRequired message={data.message} /> : <div className="table-wrap onsite-admin-table"><table><thead><tr><th>订单</th><th>服务</th><th>技术人员</th><th>客户</th><th>方式</th><th>预约</th><th>金额</th><th>状态</th><th>操作</th></tr></thead><tbody>{data.orders.map((order) => <tr key={text(order.id)}><td><b>{text(order.id)}</b><small>{text(order.created_at).replace("T"," ").slice(0,16)}</small></td><td>{text(order.service_title)}</td><td>{text(order.provider_name)}</td><td>{text(order.customer_phone)}<small>{text(order.customer_email)}</small></td><td>{text(order.delivery_mode) === "onsite" ? "指定地点服务" : "在线服务"}</td><td>{text(order.scheduled_at).replace("T"," ").slice(0,16)}<small>{text(order.service_address) || "—"}</small></td><td className="money">{order.amount === null ? "待报价" : `¥${text(order.amount)}`}</td><td><Status value={text(order.status)} /></td><td><div className="onsite-admin-actions">{text(order.status) === "pending_quote" && <button className="text-action" onClick={() => { setQuote(order); setQuoteAmount(""); }}>报价</button>}<select value={text(order.status)} onChange={(e) => void action({ action: "order-status", id: text(order.id), status: e.target.value })}>{orderStatuses.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div></td></tr>)}</tbody></table>{!data.orders.length && <div className="table-empty"><span>◇</span><p>暂无技术服务订单</p></div>}</div>}
    {quote && <Modal title="服务订单报价" onClose={() => setQuote(null)}><div className="onsite-quote-summary onsite-dialog-summary"><b>{text(quote.service_title)}</b><p>订单：{text(quote.id)}</p><p>{text(quote.requirement_text) || "客户未填写补充需求"}</p></div><div className="admin-form-grid"><label><span>确认服务金额</span><input type="number" min="0.01" step="0.01" value={quoteAmount} onChange={(e) => setQuoteAmount(e.target.value)} placeholder="请输入报价金额" /></label></div><div className="admin-form-actions"><button className="ghost-button" onClick={() => setQuote(null)}>取消</button><button disabled={!Number(quoteAmount)} onClick={async () => { if (await action({ action: "order-quote", id: text(quote.id), amount: quoteAmount })) setQuote(null); }}>确认报价</button></div></Modal>}
  </>;
}

const appointmentStatuses = [["pending","待确认"],["confirmed","已确认"],["arrived","已到场"],["in_service","服务中"],["completed","已完成"],["cancelled","已取消"]];
export function OnsiteAppointmentManagement() {
  const { data, loading, notice, load, action } = useOperations();
  return <>{notice && <div className="admin-message">{notice}</div>}<Header title="预约管理" description="统一管理在线服务时间、上门时间、指定地点与履约进度" loading={loading} onRefresh={() => void load()} />
    {!data.initialized ? <InitRequired message={data.message} /> : <div className="table-wrap onsite-admin-table"><table><thead><tr><th>预约</th><th>订单</th><th>服务</th><th>技术人员</th><th>方式</th><th>预约时间</th><th>地点 / 联系人</th><th>状态</th></tr></thead><tbody>{data.appointments.map((item) => <tr key={text(item.id)}><td>#{text(item.id)}</td><td><b>{text(item.order_id)}</b></td><td>{text(item.service_title)}</td><td>{text(item.provider_name)}</td><td>{text(item.delivery_mode) === "onsite" ? "指定地点服务" : "在线服务"}</td><td>{text(item.scheduled_at).replace("T"," ").slice(0,16)}</td><td>{text(item.service_address) || "在线服务"}<small>{text(item.contact_name)} {text(item.contact_phone)}</small></td><td><select value={text(item.status)} onChange={(e) => void action({ action: "appointment-status", id: Number(item.id), status: e.target.value })}>{appointmentStatuses.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></td></tr>)}</tbody></table>{!data.appointments.length && <div className="table-empty"><span>◇</span><p>暂无预约</p></div>}</div>}
  </>;
}

export function OnsiteConsultationManagement() {
  const { data, loading, notice, load, action } = useOperations();
  const [thread, setThread] = useState<Row | null>(null);
  const [reply, setReply] = useState("");
  const currentMessages = useMemo(() => thread ? data.messages.filter((item) => Number(item.consultation_id) === Number(thread.id)) : [], [data.messages, thread]);
  const currentRequests = useMemo(() => thread ? data.contactRequests.filter((item) => Number(item.consultation_id) === Number(thread.id)) : [], [data.contactRequests, thread]);
  return <>{notice && <div className="admin-message">{notice}</div>}<Header title="在线咨询" description="查看用户与技术服务者沟通记录、后台回复并审核联系方式申请" loading={loading} onRefresh={() => void load()} />
    {!data.initialized ? <InitRequired message={data.message} /> : <div className="table-wrap onsite-admin-table"><table><thead><tr><th>会话</th><th>服务</th><th>技术人员</th><th>客户</th><th>最后沟通</th><th>消息</th><th>联系方式申请</th><th>状态</th><th>操作</th></tr></thead><tbody>{data.consultations.map((item) => { const count=data.messages.filter((m)=>Number(m.consultation_id)===Number(item.id)).length; const request=data.contactRequests.find((r)=>Number(r.consultation_id)===Number(item.id)); return <tr key={text(item.id)}><td>#{text(item.id)}</td><td>{text(item.service_title)}</td><td>{text(item.provider_name)}</td><td>{text(item.customer_phone)}<small>{text(item.customer_email)}</small></td><td>{text(item.last_message_at).replace("T"," ").slice(0,16)}</td><td>{count} 条</td><td>{request ? <Status value={text(request.status)} /> : "—"}</td><td><Status value={text(item.status)} /></td><td><button className="text-action" onClick={() => { setThread(item); setReply(""); }}>查看 / 回复</button><button className="text-action" onClick={() => void action({ action:"consultation-status", id:Number(item.id), status:text(item.status)==="open"?"closed":"open" })}>{text(item.status)==="open"?"关闭":"重新打开"}</button></td></tr>; })}</tbody></table>{!data.consultations.length && <div className="table-empty"><span>◇</span><p>暂无在线咨询</p></div>}</div>}
    {thread && <Modal title={`咨询会话 #${text(thread.id)}`} onClose={() => setThread(null)}><div className="admin-consultation-thread">{currentMessages.map((message) => <div className={`admin-chat-message ${text(message.sender_type)}`} key={text(message.id)}><b>{text(message.sender_type)==="customer"?"客户":"技术人员 / 平台"}</b><p>{text(message.content)}</p><small>{text(message.created_at).replace("T"," ").slice(0,16)}</small></div>)}</div>{currentRequests.map((request) => <div className="admin-contact-request" key={text(request.id)}><div><b>联系方式申请</b><span><Status value={text(request.status)} /></span></div>{text(request.status)==="pending" && <div className="admin-form-actions"><button className="ghost-button" onClick={() => void action({ action:"contact-request-review", id:Number(request.id), status:"rejected" })}>驳回</button><button onClick={() => void action({ action:"contact-request-review", id:Number(request.id), status:"approved" })}>通过申请</button></div>}</div>)}<div className="admin-reply-box"><textarea value={reply} onChange={(e)=>setReply(e.target.value)} placeholder="回复用户咨询内容" /><button disabled={!reply.trim()} onClick={async()=>{ if(await action({ action:"consultation-reply", consultationId:Number(thread.id), content:reply })){ setReply(""); } }}>发送回复</button></div></Modal>}
  </>;
}

export function OnsiteApplicationManagement() {
  const { data, loading, notice, load, action } = useOperations();
  const [review, setReview] = useState<Row | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  return <>{notice && <div className="admin-message">{notice}</div>}<Header title="入驻审核" description="审核技术人才入驻资料、技能、经验和服务资格" loading={loading} onRefresh={() => void load()} />
    {!data.initialized ? <InitRequired message={data.message} /> : <div className="table-wrap onsite-admin-table"><table><thead><tr><th>申请人</th><th>城市</th><th>经验</th><th>技术方向</th><th>技能</th><th>提交时间</th><th>状态</th><th>操作</th></tr></thead><tbody>{data.applications.map((item) => { let skills:string[]=[]; try{skills=JSON.parse(text(item.skills_json)||"[]")}catch{skills=[]} return <tr key={text(item.id)}><td><b>{text(item.applicant_name)}</b><small>{text(item.phone)} · {text(item.email)}</small></td><td>{text(item.city)}</td><td>{text(item.experience)||"—"}</td><td>{text(item.role_name)}</td><td><div className="onsite-skill-list">{skills.slice(0,4).map((skill)=><span key={skill}>{skill}</span>)}</div></td><td>{text(item.created_at).replace("T"," ").slice(0,16)}</td><td><Status value={text(item.status)} /></td><td><button className="text-action" onClick={()=>{setReview(item);setReviewNote(text(item.review_note));}}>审核</button></td></tr>})}</tbody></table>{!data.applications.length && <div className="table-empty"><span>◇</span><p>暂无入驻申请</p></div>}</div>}
    {review && <Modal title={`审核入驻申请 · ${text(review.applicant_name)}`} onClose={()=>setReview(null)}><div className="provider-review-detail onsite-dialog-summary"><p><b>手机号：</b>{text(review.phone)}</p><p><b>所在城市：</b>{text(review.city)}</p><p><b>经验：</b>{text(review.experience)||"—"}</p><p><b>技术方向：</b>{text(review.role_name)}</p><p><b>个人介绍：</b>{text(review.intro)||"—"}</p></div><div className="admin-form-grid"><label className="wide-field"><span>审核意见</span><textarea value={reviewNote} onChange={(e)=>setReviewNote(e.target.value)} placeholder="填写通过或驳回说明" /></label></div><div className="admin-form-actions"><button className="ghost-button" onClick={async()=>{if(await action({action:"application-review",id:Number(review.id),status:"rejected",reviewNote})){setReview(null)}}}>驳回</button><button onClick={async()=>{if(await action({action:"application-review",id:Number(review.id),status:"approved",reviewNote})){setReview(null)}}}>审核通过</button></div></Modal>}
  </>;
}
