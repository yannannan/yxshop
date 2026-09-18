"use client";

import { useEffect, useMemo, useState } from "react";
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
  return [
    {
      id: `${service.slug}-welcome`,
      from: "provider",
      content: `您好，我是${service.provider}。请说明您的需求、使用场景和期望服务时间。`,
      time: "刚刚",
    },
  ];
}

export function TechnicalSupportChat({
  activeService,
  open,
  services,
  onClose,
}: TechnicalSupportChatProps) {
  const [threadSlugs, setThreadSlugs] = useState<string[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [messagesBySlug, setMessagesBySlug] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [contactRequestStates, setContactRequestStates] = useState<
    Record<string, ContactRequestState>
  >({});
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!activeService) return;
    setThreadSlugs((current) =>
      current.includes(activeService.slug)
        ? current
        : [...current, activeService.slug],
    );
    setActiveSlug(activeService.slug);
    setMessagesBySlug((current) =>
      current[activeService.slug]
        ? current
        : {
            ...current,
            [activeService.slug]: initialMessages(activeService),
          },
    );
  }, [activeService]);

  const threads = useMemo(
    () =>
      threadSlugs
        .map((slug) => services.find((service) => service.slug === slug))
        .filter((service): service is TechnicalService => Boolean(service)),
    [services, threadSlugs],
  );
  const currentService =
    threads.find((service) => service.slug === activeSlug) || activeService;
  const messages = currentService ? messagesBySlug[currentService.slug] || [] : [];
  const contactRequestState = currentService
    ? contactRequestStates[currentService.slug] || "idle"
    : "idle";

  if (!open || !currentService) return null;

  function sendMessage() {
    const content = draft.trim();
    if (!content) return;
    const message: ChatMessage = {
      id: `${currentService.slug}-${Date.now()}`,
      from: "customer",
      content,
      time: "刚刚",
    };
    setMessagesBySlug((current) => ({
      ...current,
      [currentService.slug]: [...(current[currentService.slug] || []), message],
    }));
    setDraft("");
  }

  function requestContact() {
    setContactRequestStates((current) => ({
      ...current,
      [currentService.slug]: "requested",
    }));
  }

  return (
    <div
      className="technical-chat-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="technical-support-chat"
        role="dialog"
        aria-modal="true"
        aria-label="在线免费技术支持"
      >
        <aside className="technical-chat-sidebar" aria-label="技术支持会话列表">
          <header>
            <div>
              <span>TECH SUPPORT</span>
              <b>在线免费技术支持</b>
            </div>
            <small>{threads.length} 个会话</small>
          </header>
          <div className="technical-chat-thread-list">
            {threads.map((thread) => {
              const lastMessage = messagesBySlug[thread.slug]?.at(-1);
              return (
                <button
                  type="button"
                  className={thread.slug === currentService.slug ? "active" : ""}
                  key={thread.slug}
                  onClick={() => setActiveSlug(thread.slug)}
                >
                  <span className="technical-avatar" aria-hidden="true">
                    {thread.initials}
                  </span>
                  <span>
                    <b>{thread.provider}</b>
                    <small>{lastMessage?.content || "开始技术咨询"}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="technical-chat-main">
          <header className="technical-chat-main-header">
            <div>
              <b>{currentService.provider}</b>
              <span>已认证技术服务者 · 在线沟通</span>
              <small>咨询服务：{currentService.title}</small>
            </div>
            <button
              type="button"
              className="modal-close"
              aria-label="关闭在线技术支持"
              onClick={onClose}
            >
              ×
            </button>
          </header>

          <div className="technical-chat-messages" aria-live="polite">
            <div className="technical-chat-notice">
              本次沟通用于确认服务范围、交付方式与价格；请勿发送账号密码等敏感信息。
            </div>
            {messages.map((message) => (
              <div
                className={`technical-chat-message ${message.from === "customer" ? "mine" : ""}`}
                key={message.id}
              >
                <span>{message.content}</span>
                <small>{message.time}</small>
              </div>
            ))}
          </div>

          <div className="technical-chat-composer">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && sendMessage()}
              placeholder="请输入咨询内容"
            />
            <button type="button" onClick={sendMessage}>
              发送
            </button>
          </div>
        </div>

        <aside className="technical-contact-protection" aria-label="联系方式保护">
          <header>
            <div>
              <span>CONTACT ACCESS</span>
              <b>联系方式申请</b>
              <small>微信二维码与手机号默认隐藏</small>
            </div>
            <em className={contactRequestState}>
              {contactRequestState === "approved"
                ? "已授权"
                : contactRequestState === "requested"
                  ? "审核中"
                  : "未授权"}
            </em>
          </header>
          <div className="technical-contact-preview">
            <div className="technical-contact-qr technical-contact-qr-locked">
              <span>微信二维码</span>
              <small>已保护</small>
            </div>
            <div>
              <span>技术人员手机号</span>
              <b>***********</b>
            </div>
            <p>
              技术人员或平台审核通过后，服务端才会返回真实联系方式。
            </p>
          </div>
          {contactRequestState === "idle" ? (
            <button type="button" onClick={requestContact}>
              申请添加联系方式
            </button>
          ) : (
            <p className="technical-contact-pending">
              申请已提交，等待技术人员确认后展示完整二维码和手机号。
            </p>
          )}
        </aside>
      </section>
    </div>
  );
}
