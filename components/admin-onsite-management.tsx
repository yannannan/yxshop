"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, string | number | null>;
type OnsiteData = { initialized: boolean; providers: Row[]; services: Row[]; message?: string };

const emptyData: OnsiteData = { initialized: false, providers: [], services: [] };
const text = (value: unknown) => String(value ?? "");

function useOnsiteAdmin() {
  const [data, setData] = useState<OnsiteData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/onsite?refresh=${Date.now()}`, { cache: "no-store" });
      const result = await response.json() as OnsiteData;
      setData(result);
    } catch {
      setData({ initialized: false, providers: [], services: [], message: "上门服务数据读取失败" });
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
    setNotice(result.message || "保存成功");
    await load();
    return true;
  }, [load]);

  return { data, loading, notice, load, action };
}

function InitRequired({ message }: { message?: string }) {
  return <div className="system-init-empty"><b>上门服务数据表尚未初始化</b><p>{message || "请执行上门服务 SQL 后刷新页面。"}</p><code>sql/yxshop-onsite-service-V1.sql</code></div>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="admin-modal-mask" role="presentation"><section className="admin-modal" role="dialog" aria-modal="true" aria-label={title}><div className="editor-head"><div><span className="section-kicker">ONSITE SERVICE</span><b>{title}</b></div><button className="modal-close" aria-label="关闭弹窗" onClick={onClose}>×</button></div>{children}</section></div>;
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? "wide-field" : ""}><span>{label}</span>{children}</label>;
}

function Status({ value }: { value: string }) {
  const labels: Record<string, string> = { active: "启用", inactive: "已下架", disabled: "已停用", closed: "已作废", verified: "已认证", pending: "待审核", rejected: "已驳回", online: "在线", offline: "离线" };
  return <span className={`status status-${value}`}>{labels[value] || value}</span>;
}

type ProviderForm = {
  id?: number; providerCode: string; name: string; initials: string; avatar: string; city: string; experience: string; roleName: string; intro: string; skillsText: string; certificationStatus: string; onlineStatus: string; sortOrder: string; status: string;
};

const newProvider = (): ProviderForm => ({ providerCode: "", name: "", initials: "", avatar: "", city: "", experience: "", roleName: "", intro: "", skillsText: "", certificationStatus: "verified", onlineStatus: "online", sortOrder: "0", status: "active" });

export function OnsiteProviderManagement() {
  const { data, loading, notice, load, action } = useOnsiteAdmin();
  const [form, setForm] = useState<ProviderForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);

  function edit(row: Row) {
    let skills: string[] = [];
    try { skills = JSON.parse(text(row.skills_json) || "[]"); } catch { skills = []; }
    setForm({ id: Number(row.id), providerCode: text(row.provider_code), name: text(row.name), initials: text(row.initials), avatar: text(row.avatar), city: text(row.city), experience: text(row.experience), roleName: text(row.role_name), intro: text(row.intro), skillsText: skills.join("、"), certificationStatus: text(row.certification_status) || "verified", onlineStatus: text(row.online_status) || "online", sortOrder: text(row.sort_order || 0), status: text(row.status) || "active" });
  }

  return <>{notice && <div className="admin-message">{notice}</div>}<div className="panel-title"><div><h2>技术人员管理</h2><p>发布和维护技术服务者资料、技能、城市、认证状态与接单状态</p></div><div className="panel-title-actions"><button className="refresh-list-button" disabled={loading} onClick={() => void load()}>{loading ? "正在刷新…" : "↻ 刷新列表"}</button><button onClick={() => setForm(newProvider())}>＋ 新增技术人员</button></div></div>
    {!data.initialized ? <InitRequired message={data.message} /> : <div className="table-wrap onsite-admin-table"><table><thead><tr><th>技术人员</th><th>城市 / 经验</th><th>定位</th><th>技能</th><th>认证</th><th>接单</th><th>状态</th><th>服务数</th><th>操作</th></tr></thead><tbody>{data.providers.map((provider) => {
      let skills: string[] = []; try { skills = JSON.parse(text(provider.skills_json) || "[]"); } catch { skills = []; }
      const count = data.services.filter((service) => Number(service.provider_id) === Number(provider.id)).length;
      return <tr key={text(provider.id)}><td><div className="onsite-provider-cell">{text(provider.avatar) ? <img src={text(provider.avatar)} alt="" /> : <span>{text(provider.initials) || text(provider.name).slice(0,1)}</span>}<div><b>{text(provider.name)}</b><small>{text(provider.provider_code)}</small></div></div></td><td>{text(provider.city) || "—"}<small>{text(provider.experience) || "—"}</small></td><td>{text(provider.role_name) || "—"}</td><td><div className="onsite-skill-list">{skills.slice(0,4).map((skill) => <span key={skill}>{skill}</span>)}</div></td><td><Status value={text(provider.certification_status)} /></td><td><Status value={text(provider.online_status)} /></td><td><Status value={text(provider.status)} /></td><td>{count} 项</td><td><button className="text-action" onClick={() => edit(provider)}>编辑</button><button className="text-action" onClick={() => void action({ action: "provider-status", id: Number(provider.id), status: text(provider.status) === "active" ? "disabled" : "active" })}>{text(provider.status) === "active" ? "停用" : "启用"}</button><button className="text-action danger-action" onClick={() => setDeleteTarget(provider)}>删除</button></td></tr>;
    })}</tbody></table></div>}
    {form && <Modal title={form.id ? "编辑技术人员" : "新增技术人员"} onClose={() => setForm(null)}><form onSubmit={async (event) => { event.preventDefault(); const ok = await action({ action: "provider-save", id: form.id || 0, providerCode: form.providerCode, name: form.name, initials: form.initials, avatar: form.avatar, city: form.city, experience: form.experience, roleName: form.roleName, intro: form.intro, skillsText: form.skillsText, certificationStatus: form.certificationStatus, onlineStatus: form.onlineStatus, sortOrder: form.sortOrder, status: form.status }); if (ok) setForm(null); }}><div className="admin-form-grid"><Field label="人员编码"><input value={form.providerCode} onChange={(e) => setForm({ ...form, providerCode: e.target.value })} placeholder="provider-zhangwei" /></Field><Field label="姓名"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field><Field label="展示简称"><input value={form.initials} onChange={(e) => setForm({ ...form, initials: e.target.value })} placeholder="张" /></Field><Field label="头像地址"><input value={form.avatar} onChange={(e) => setForm({ ...form, avatar: e.target.value })} placeholder="/technical-services/xxx.png" /></Field><Field label="城市"><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field><Field label="经验"><input value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} placeholder="8年经验" /></Field><Field label="职业定位" wide><input value={form.roleName} onChange={(e) => setForm({ ...form, roleName: e.target.value })} /></Field><Field label="技能标签" wide><input value={form.skillsText} onChange={(e) => setForm({ ...form, skillsText: e.target.value })} placeholder="Linux、服务器、系统部署" /></Field><Field label="个人介绍" wide><textarea value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} /></Field><Field label="认证状态"><select value={form.certificationStatus} onChange={(e) => setForm({ ...form, certificationStatus: e.target.value })}><option value="verified">已认证</option><option value="pending">待审核</option><option value="rejected">已驳回</option></select></Field><Field label="接单状态"><select value={form.onlineStatus} onChange={(e) => setForm({ ...form, onlineStatus: e.target.value })}><option value="online">在线接单</option><option value="offline">暂停接单</option></select></Field><Field label="排序"><input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></Field><Field label="账号状态"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">启用</option><option value="disabled">停用</option></select></Field></div><div className="admin-form-actions"><button type="button" className="ghost-button" onClick={() => setForm(null)}>取消</button><button>保存技术人员</button></div></form></Modal>}
    {deleteTarget && <Modal title="删除技术人员" onClose={() => setDeleteTarget(null)}><div className="confirm-content"><b>确认删除“{text(deleteTarget.name)}”吗？</b><p>仍有关联技术服务时系统会拒绝删除。</p></div><div className="admin-form-actions"><button className="ghost-button" onClick={() => setDeleteTarget(null)}>取消</button><button className="danger-button" onClick={async () => { if (await action({ action: "provider-delete", id: Number(deleteTarget.id) })) setDeleteTarget(null); }}>确认删除</button></div></Modal>}
  </>;
}

type ServiceForm = {
  id?: number; providerId: string; slug: string; title: string; summary: string; online: boolean; onsite: boolean; coverage: string; pricingMode: string; price: string; unit: string; onlineResponse: string; onsiteArrival: string; serviceIncludesText: string; deliveryNotesText: string; homepageFeatured: boolean; sortOrder: string; status: string;
};

const newService = (providerId = ""): ServiceForm => ({ providerId, slug: "", title: "", summary: "", online: true, onsite: true, coverage: "", pricingMode: "fixed", price: "", unit: "次", onlineResponse: "1–5 分钟响应", onsiteArrival: "20分钟到场", serviceIncludesText: "", deliveryNotesText: "", homepageFeatured: false, sortOrder: "0", status: "inactive" });

export function OnsiteServiceManagement() {
  const { data, loading, notice, load, action } = useOnsiteAdmin();
  const [form, setForm] = useState<ServiceForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const providerMap = useMemo(() => new Map(data.providers.map((item) => [Number(item.id), item])), [data.providers]);

  function edit(row: Row) {
    let modes: string[] = [], includes: { title: string; detail: string }[] = [], notes: string[] = [];
    try { modes = JSON.parse(text(row.delivery_modes_json) || "[]"); } catch { modes = []; }
    try { includes = JSON.parse(text(row.service_includes_json) || "[]"); } catch { includes = []; }
    try { notes = JSON.parse(text(row.delivery_notes_json) || "[]"); } catch { notes = []; }
    setForm({ id: Number(row.id), providerId: text(row.provider_id), slug: text(row.slug), title: text(row.title), summary: text(row.summary), online: modes.includes("online"), onsite: modes.includes("onsite"), coverage: text(row.coverage), pricingMode: text(row.pricing_mode) || "fixed", price: row.price === null ? "" : text(row.price), unit: text(row.unit) || "次", onlineResponse: text(row.online_response), onsiteArrival: text(row.onsite_arrival), serviceIncludesText: includes.map((item) => `${item.title}：${item.detail}`).join("\n"), deliveryNotesText: notes.join("\n"), homepageFeatured: Number(row.homepage_featured) === 1, sortOrder: text(row.sort_order || 0), status: text(row.status) || "inactive" });
  }

  return <>{notice && <div className="admin-message">{notice}</div>}<div className="panel-title"><div><h2>技术服务管理</h2><p>发布技术服务，维护服务者、服务方式、价格、服务范围、首页推荐和上下架状态</p></div><div className="panel-title-actions"><button className="refresh-list-button" disabled={loading} onClick={() => void load()}>{loading ? "正在刷新…" : "↻ 刷新列表"}</button><button disabled={!data.providers.length} onClick={() => setForm(newService(text(data.providers[0]?.id)))}>＋ 发布技术服务</button></div></div>
    {!data.initialized ? <InitRequired message={data.message} /> : <div className="table-wrap onsite-admin-table"><table><thead><tr><th>服务</th><th>技术人员</th><th>服务方式</th><th>价格</th><th>响应 / 到场</th><th>首页</th><th>状态</th><th>排序</th><th>操作</th></tr></thead><tbody>{data.services.map((service) => {
      let modes: string[] = []; try { modes = JSON.parse(text(service.delivery_modes_json) || "[]"); } catch { modes = []; }
      const provider = providerMap.get(Number(service.provider_id));
      return <tr key={text(service.id)}><td><b>{text(service.title)}</b><small>{text(service.slug)} · {text(service.summary)}</small></td><td>{text(provider?.name || service.provider_name)}</td><td><div className="onsite-skill-list">{modes.map((mode) => <span key={mode}>{mode === "onsite" ? "指定地点服务" : "在线沟通"}</span>)}</div></td><td className="money">{text(service.pricing_mode) === "negotiable" ? "价格面议" : `¥${text(service.price)} / ${text(service.unit) || "次"}`}</td><td>{text(service.online_response) || "—"}<small>{text(service.onsite_arrival) || "—"}</small></td><td>{Number(service.homepage_featured) ? "推荐" : "—"}</td><td><Status value={text(service.status)} /></td><td>{text(service.sort_order)}</td><td><button className="text-action" onClick={() => edit(service)}>编辑</button><button className="text-action" onClick={() => void action({ action: "service-status", id: Number(service.id), status: text(service.status) === "active" ? "inactive" : "active" })}>{text(service.status) === "active" ? "下架" : "上架"}</button><button className="text-action danger-action" onClick={() => setDeleteTarget(service)}>删除</button></td></tr>;
    })}</tbody></table></div>}
    {form && <Modal title={form.id ? "编辑技术服务" : "发布技术服务"} onClose={() => setForm(null)}><form onSubmit={async (event) => { event.preventDefault(); const modes = [form.online ? "online" : "", form.onsite ? "onsite" : ""].filter(Boolean).join(","); const ok = await action({ action: "service-save", id: form.id || 0, providerId: form.providerId, slug: form.slug, title: form.title, summary: form.summary, deliveryModes: modes, coverage: form.coverage, pricingMode: form.pricingMode, price: form.price, unit: form.unit, onlineResponse: form.onlineResponse, onsiteArrival: form.onsiteArrival, serviceIncludesText: form.serviceIncludesText, deliveryNotesText: form.deliveryNotesText, homepageFeatured: form.homepageFeatured ? 1 : 0, sortOrder: form.sortOrder, status: form.status }); if (ok) setForm(null); }}><div className="admin-form-grid"><Field label="技术人员"><select value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })}>{data.providers.filter((item) => text(item.status) === "active").map((item) => <option value={text(item.id)} key={text(item.id)}>{text(item.name)} · {text(item.city)}</option>)}</select></Field><Field label="服务名称"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field><Field label="服务 Slug"><input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase() })} placeholder="ai-site-deployment" /></Field><Field label="服务状态"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="inactive">暂不上架</option><option value="active">立即上架</option></select></Field><Field label="服务简介" wide><textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></Field><Field label="服务方式"><div className="onsite-check-row"><label><input type="checkbox" checked={form.online} onChange={(e) => setForm({ ...form, online: e.target.checked })} /> 在线沟通</label><label><input type="checkbox" checked={form.onsite} onChange={(e) => setForm({ ...form, onsite: e.target.checked })} /> 指定地点服务</label></div></Field><Field label="服务区域"><input value={form.coverage} onChange={(e) => setForm({ ...form, coverage: e.target.value })} placeholder="全市服务 / 上海、苏州、杭州" /></Field><Field label="计价方式"><select value={form.pricingMode} onChange={(e) => setForm({ ...form, pricingMode: e.target.value })}><option value="fixed">固定价格</option><option value="negotiable">价格面议</option></select></Field><Field label="价格"><input type="number" step="0.01" disabled={form.pricingMode === "negotiable"} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field><Field label="计价单位"><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="次 / 小时" /></Field><Field label="在线响应"><input value={form.onlineResponse} onChange={(e) => setForm({ ...form, onlineResponse: e.target.value })} /></Field><Field label="上门到场"><input value={form.onsiteArrival} onChange={(e) => setForm({ ...form, onsiteArrival: e.target.value })} /></Field><Field label="服务内容" wide><textarea value={form.serviceIncludesText} onChange={(e) => setForm({ ...form, serviceIncludesText: e.target.value })} placeholder={"每行一项：\n服务器环境部署：配置运行环境与必要组件\n域名配置：协助域名解析与证书配置"} /></Field><Field label="交付说明" wide><textarea value={form.deliveryNotesText} onChange={(e) => setForm({ ...form, deliveryNotesText: e.target.value })} placeholder={"每行一项：\n需求确认后开始实施\n过程同步与阶段验收"} /></Field><Field label="排序"><input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></Field><Field label="首页推荐"><div className="onsite-check-row"><label><input type="checkbox" checked={form.homepageFeatured} onChange={(e) => setForm({ ...form, homepageFeatured: e.target.checked })} /> 在首页技术服务频道推荐</label></div></Field></div><div className="admin-form-actions"><button type="button" className="ghost-button" onClick={() => setForm(null)}>取消</button><button>保存技术服务</button></div></form></Modal>}
    {deleteTarget && <Modal title="删除技术服务" onClose={() => setDeleteTarget(null)}><div className="confirm-content"><b>确认删除“{text(deleteTarget.title)}”吗？</b><p>已有历史订单的服务不能永久删除，可改为下架。</p></div><div className="admin-form-actions"><button className="ghost-button" onClick={() => setDeleteTarget(null)}>取消</button><button className="danger-button" onClick={async () => { if (await action({ action: "service-delete", id: Number(deleteTarget.id) })) setDeleteTarget(null); }}>确认删除</button></div></Modal>}
  </>;
}
