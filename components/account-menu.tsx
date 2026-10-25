'use client';
import { useI18n } from '@/components/language-provider';

import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRightOnRectangleIcon, ChevronDownIcon, HomeIcon, CircleStackIcon, DocumentTextIcon, ClockIcon, MapPinIcon, UserCircleIcon, ShieldCheckIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import { accountLoginHref, accountSections, defaultAvatar } from '../lib/account';
import { signOutAccount, useAccount, refreshAccount } from '../lib/account-client';

export const accountIcons = { overview: HomeIcon, points: CircleStackIcon, orders: DocumentTextIcon, activity: ClockIcon, addresses: MapPinIcon, profile: UserCircleIcon };
export function AccountMenu({ onSignIn, onSignedOut }: { onSignIn?: () => void; onSignedOut?: () => void }) {
  const { t } = useI18n();
  const { account, loading, error } = useAccount(), user = account?.user;
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const container = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), id = useId();
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) { if (!container.current?.contains(event.target as Node)) setOpen(false); }
    function keyboard(event: KeyboardEvent) { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', keyboard);
    panel.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keyboard); };
  }, [open]);
  async function logout() {
    setBusy(true); setMessage('');
    try { await signOutAccount(); setOpen(false); if (onSignedOut) onSignedOut(); else window.location.assign('/'); }
    catch (failure) { setMessage((failure as Error).message); }
    finally { setBusy(false); }
  }
  if (!account && loading) return <div className="account-control account-loading" role="status">{t("正在读取账户…")}</div>;
  if (!account && error) return <div className="account-control account-load-error"><button onClick={() => void refreshAccount()}>{t("账户重试")}</button><a href="/account">{t("个人中心")}</a></div>;
  if (!account?.authenticated || !user) return <div className="account-control"><button className="login-btn" onClick={() => { if (onSignIn) onSignIn(); else window.location.assign(accountLoginHref(`${window.location.pathname}${window.location.search}${window.location.hash}`)); }}>{t("登录 / 注册")}</button></div>;
  return <div className="account-control" ref={container} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <a className="account-points-link" href="/points" aria-label={t(`剩余积分 ${error || account.pointsBalance === null ? '暂不可用' : account.pointsBalance}`)}><span>{t("剩余积分")}</span><b>{t(error || account.pointsBalance === null ? '—' : account.pointsBalance.toLocaleString('zh-CN'))}</b></a>
    <button ref={trigger} type="button" className="account-trigger" aria-label={t("打开个人账户菜单")} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <Image unoptimized src={user.avatarUrl || defaultAvatar} alt="" width={36} height={36} /><span>{user.nickname}</span><ChevronDownIcon aria-hidden="true" /></button>
    {open && <div ref={panel} id={id} className="account-dropdown" aria-label={t("个人账户")}>
      <div className="account-menu-profile"><Image unoptimized src={user.avatarUrl || defaultAvatar} alt="" width={52} height={52} /><div><b>{user.nickname}</b><small>{t(user.maskedPhone)}</small></div></div>
      <div className="account-menu-points"><span>{t("剩余积分")}</span><b>{t(error || account.pointsBalance === null ? '暂不可用' : account.pointsBalance.toLocaleString('zh-CN'))}</b>{(error || account.pointsMessage) && <button onClick={() => void refreshAccount()}>{t("点击重试")}</button>}</div>
      <nav aria-label={t("个人中心导航")}>{accountSections.map(section => { const Icon = accountIcons[section.key]; return <a href={section.href} key={section.key}><Icon aria-hidden="true" /><span>{t(section.key === 'overview' ? '个人中心' : section.label)}</span></a>; })}
        {user.isAdmin && <a href="/admin" target="_blank" rel="noopener noreferrer"><ShieldCheckIcon aria-hidden="true" />{t("管理后台")}</a>}
        {user.isTechnician && <a href="/technician"><WrenchScrewdriverIcon aria-hidden="true" />{t("技术人员工作台")}</a>}
      </nav>
      <button className="account-logout" disabled={busy} onClick={() => void logout()}><ArrowRightOnRectangleIcon aria-hidden="true" />{t(busy ? '正在退出…' : '退出登录')}</button>
      {message && <p role="alert">{t(message)}</p>}
    </div>}
  </div>;
}
