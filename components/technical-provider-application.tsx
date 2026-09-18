"use client";

import { useState } from "react";

type Props = { open: boolean; onClose: () => void };

export function TechnicalProviderApplication({ open, onClose }: Props) {
  const [form, setForm] = useState({ applicantName: "", phone: "", email: "", city: "", experience: "", roleName: "", skillsText: "", intro: "", credentialUrlsText: "" });
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [success, setSuccess] = useState(false);

  if (!open) return null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setNotice("");
    try {
      const response = await fetch("/api/technical-provider-applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) {
        setNotice(result.message || "入驻申请提交失败");
        return;
      }
      setSuccess(true);
    } catch {
      setNotice("入驻申请提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="technical-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="technical-provider-application-modal" role="dialog" aria-modal="true" aria-label="技术人才入驻申请">
      <button className="modal-close" aria-label="关闭" onClick={onClose}>×</button>
      {success ? <div className="technical-provider-application-success"><span>✓</span><h2>入驻申请已提交</h2><p>平台会审核您的技术方向、经验与服务能力。审核结果由平台后续联系确认。</p><button onClick={onClose}>完成</button></div> : <>
        <header><span>TECH TALENT</span><h2>技术人才入驻</h2><p>提交基础资料和技术方向，通过审核后可在宇星商城发布技术服务并接单。</p></header>
        <form onSubmit={submit}>
          <div className="technical-provider-application-grid">
            <label><span>姓名 *</span><input value={form.applicantName} onChange={(e) => setForm({ ...form, applicantName: e.target.value })} /></label>
            <label><span>手机号 *</span><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label><span>邮箱</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label><span>所在城市 *</span><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
            <label><span>技术经验</span><input value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} placeholder="例如：8年经验" /></label>
            <label><span>技术方向 *</span><input value={form.roleName} onChange={(e) => setForm({ ...form, roleName: e.target.value })} placeholder="例如：服务器运维 / AI部署" /></label>
            <label className="wide"><span>技能标签</span><input value={form.skillsText} onChange={(e) => setForm({ ...form, skillsText: e.target.value })} placeholder="Linux、Java、AI部署、网站建设" /></label>
            <label className="wide"><span>个人介绍</span><textarea value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} placeholder="介绍您的经验、擅长解决的问题和可提供的服务" /></label>
            <label className="wide"><span>资质 / 案例链接</span><textarea value={form.credentialUrlsText} onChange={(e) => setForm({ ...form, credentialUrlsText: e.target.value })} placeholder="可填写证书、作品或案例链接，每行一个" /></label>
          </div>
          {notice && <small className="form-error">{notice}</small>}
          <div className="technical-provider-application-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button type="submit" disabled={submitting}>{submitting ? "正在提交…" : "提交入驻申请"}</button></div>
        </form>
      </>}
    </section>
  </div>;
}
