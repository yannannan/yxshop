"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TechnicalService } from "../lib/technical-services";

type ChatMessage = {
  id: string;
  from: "provider" | "customer";
  content: string;
  time: string;
};

type ContactRequestState = "idle" | "requested" | "approved";

type TechnicalSupportChatProps = {
  activeService: TechnicalService | null;
  open: boolean;
  services: TechnicalService[];
  onClose: () => void;
};

function initialMessages(service: TechnicalService): ChatMessage[] {
  return [{
    id: `${service.slug}-welcome`,
    from: "provider",
    content: `您好，我是${service.provider}。请说明您的需求、使用场景和期望服务时间。`,
    time: "刚刚",
  }];
}

function formatMessageTime(value: unknown) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "刚刚";
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function TechnicalSupportChat({ activeService, open, services, onClose }: TechnicalSupportChatProps) {
  const [threadSlugs, setThreadSlugs] = useState<string[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [messagesBySlug, setMessagesBySlug] = useState<Record<string, ChatMessage[]>>({});
  const [contactRequestStates, setContactRequestStates] = useState<Record<string, ContactRequestState>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!activeService) return;
    setThreadSlugs((current) => current.includes(activeService.slug) ? current : [...current, activeService.slug]);
    setActiveSlug(activeService.slug);
    setMessagesBySlug((current) => current[activeService.slug] ? current : { ...current, [activeService.slug]: initialMessages(activeService) });
  }, [activeService]);

  const threads = useMemo(
    () => threadSlugs.map((slug) => services.find((service) => service.slug === slug)).filter((service): service is TechnicalService => Boolean(service)),
    [services, threadSlugs],
  );
  const currentService = threads.find((service) => service.slug === activeSlug) || activeService;
  const messages = currentService ? messagesBySlug[currentService.slug] || [] : [];
  const contactRequestState = currentService ? contactRequestStates[currentService.slug] || "idle" : "idle";

  const loadThread = useCallback(async (service: TechnicalService) => {
    try {
      const response = await fetch(`/api/technical-consultations?serviceSlug=${encodeURIComponent(service.slug)}&refresh=${Date.now()}`, { cache: "no-store" });
      if (response.status === 401) {
        setNotice("请先使用商城手机号登录，再使用在线免费技术支持。");
        return;
      }
      if (!response.ok) return;
      const result = await response.json() as {
        messages?: Array<{ id: number; sender_type: string; content: string; created_at: string }>;
        contactRequest?: { status?: string } | null;
      };
      if (Array.isArray(result.messages) && result.messages.length) {
        setMessagesBySlug((current) => ({
          ...current,
          [service.slug]: result.messages!.map((message) => ({
            id: String(message.id),
            from: message.sender_type === "customer" ? "customer" : "provider",
            content: String(message.content || ""),
            time: formatMessageTime(message.created_at),
          })),
        }));
      }
      const status = result.contactRequest?.status;
      setContactRequestStates((current) => ({
        ...current,
        [service.slug]: status === "approved" ? "approved" : status === "pending" ? "requested" : "idle",
      }));
      setNotice("");
    } catch {
      setNotice("在线技术支持暂时无法连接，请稍后重试。");
    }
  }, []);

  useEffect(() => {
    if (!open || !currentService) return;
    void loadThread(currentService);
    const timer = window.setInterval(() => void loadThread(currentService), 5000);
    return () => window.clearInterval(timer);
  }, [currentService, loadThread, open]);

  if (!open || !currentService) return null;

  async function sendMessage() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setNotice("");
    try {
      const response = await fetch("/api/technical-consultations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send", serviceSlug: currentService.slug, content }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) {
        setNotice(result.message || "消息发送失败");
        return;
      }
      setDraft("");
      await loadThread(currentService);
    } catch {
      setNotice("消息发送失败，请稍后重试。");
    } finally {
      setSending(false);
    }
  }

  async function requestContact() {
    setNotice("");
    try {
      const response = await fetch("/api/technical-consultations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "contact-request", serviceSlug: currentService.slug }),
      });
      const result = await response.json() as { message?: string; contactRequestStatus?: string };
      if (!response.ok) {
        setNotice(result.message || "联系方式申请失败");
        return;
      }
      setContactRequestStates((current) => ({
        ...current,
        [currentService.slug]: result.contactRequestStatus === "approved" ? "approved" : "requested",
      }));
    } catch {
      setNotice("联系方式申请失败，请稍后重试。");
    }
  }

  return (
    <div className="technical-chat-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="technical-support-chat" role="dialog" aria-modal="true" aria-label="在线免费技术支持">
        <aside className="technical-chat-sidebar" aria-label="技术支持会话列表">
          <header><div><span>TECH SUPPORT</span><b>在线免费技术支持</b></div><small>{threads.length} 个会话</small></header>
          <div className="technical-chat-thread-list">
            {threads.map((thread) => {
              const lastMessage = messagesBySlug[thread.slug]?.at(-1);
              return <button type="button" className={thread.slug === currentService.slug ? "active" : ""} key={thread.slug} onClick={() => setActiveSlug(thread.slug)}>
                <span className="technical-avatar" aria-hidden="true">{thread.initials}</span>
                <span><b>{thread.provider}</b><small>{lastMessage?.content || "开始技术咨询"}</small></span>
              </button>;
            })}
          </div>
        </aside>

        <div className="technical-chat-main">
          <header className="technical-chat-main-header">
            <div><b>{currentService.provider}</b><span>已认证技术服务者 · 在线沟通</span><small>咨询服务：{currentService.title}</small></div>
            <button type="button" className="modal-close" aria-label="关闭在线技术支持" onClick={onClose}>×</button>
          </header>
          <div className="technical-chat-messages" aria-live="polite">
            <div className="technical-chat-notice">本次沟通用于确认服务范围、交付方式与价格；请勿发送账号密码等敏感信息。</div>
            {notice && <div className="technical-chat-notice technical-chat-error">{notice}</div>}
            {messages.map((message) => <div className={`technical-chat-message ${message.from === "customer" ? "mine" : ""}`} key={message.id}><span>{message.content}</span><small>{message.time}</small></div>)}
          </div>
          <div className="technical-chat-composer">
            <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void sendMessage()} placeholder="请输入咨询内容" />
            <button type="button" disabled={sending || !draft.trim()} onClick={() => void sendMessage()}>{sending ? "发送中…" : "发送"}</button>
          </div>
        </div>

        <aside className="technical-contact-protection" aria-label="联系方式保护">
          <header><div><span>CONTACT ACCESS</span><b>联系方式申请</b><small>微信二维码与手机号默认隐藏</small></div><em className={contactRequestState}>{contactRequestState === "approved" ? "已授权" : contactRequestState === "requested" ? "审核中" : "未授权"}</em></header>
          <div className="technical-contact-preview">
            <div className="technical-contact-qr technical-contact-qr-locked"><span>微信二维码</span><small>{contactRequestState === "approved" ? "已授权" : "已保护"}</small></div>
            <div><span>技术人员手机号</span><b>{contactRequestState === "approved" ? "请通过平台确认" : "***********"}</b></div>
            <p>{contactRequestState === "approved" ? "联系方式申请已通过，请在平台沟通中确认具体联系方式。" : "技术人员或平台审核通过后，才会开放联系方式。"}</p>
          </div>
          {contactRequestState === "idle" ? <button type="button" onClick={() => void requestContact()}>申请添加联系方式</button> : <p className="technical-contact-pending">{contactRequestState === "approved" ? "申请已通过，可继续在平台内沟通。" : "申请已提交，等待技术人员或平台审核。"}</p>}
        </aside>
      </section>
    </div>
  );
}
