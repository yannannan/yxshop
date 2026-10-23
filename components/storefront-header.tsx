"use client";

import Image from 'next/image';
import Link from 'next/link';
import type { MouseEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';

type Channel = 'mall' | 'technical';
type Target = 'content' | 'talent-entry';
type Props = {
  channel?: Channel;
  onNavigate?: (channel: Channel, target: Target) => void;
  isAdmin?: boolean;
  isTechnician?: boolean;
  children?: ReactNode;
};

export function StorefrontHeader({ channel = 'mall', onNavigate, isAdmin, isTechnician, children }: Props) {
  const [identity, setIdentity] = useState({ isAdmin: false, isTechnician: false });
  useEffect(() => {
    if (isAdmin !== undefined && isTechnician !== undefined) return;
    let active = true;
    fetch('/api/auth/session', { cache: 'no-store' }).then(async response => {
      if (!response.ok) return;
      const session = await response.json() as { authenticated?: boolean; isAdmin?: boolean; isTechnician?: boolean };
      if (active) setIdentity({ isAdmin: session.authenticated === true && session.isAdmin === true, isTechnician: session.authenticated === true && session.isTechnician === true });
    }).catch(() => {});
    return () => { active = false; };
  }, [isAdmin, isTechnician]);
  const adminVisible = isAdmin ?? identity.isAdmin, technicianVisible = isTechnician ?? identity.isTechnician;
  function navigate(event: MouseEvent<HTMLAnchorElement>, next: Channel, target: Target) {
    if (!onNavigate || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(next, target);
  }

  return <header className={`topbar refined-topbar compact-topbar${adminVisible || technicianVisible ? ' has-admin-entry' : ''}`}>
    <Link className="brand" href="/" aria-label="宇星商城首页">
      <span className="brand-mark"><Image src="/yxstar_logo.png" alt="宇星商城 Logo" fill sizes="34px" /></span><span>宇星商城</span>
    </Link>
    <nav className="site-navigation" aria-label="主导航">
      <Link href="/#channel-content" className={channel === 'mall' ? 'active' : ''} aria-current={channel === 'mall' ? 'location' : undefined} onClick={event => navigate(event, 'mall', 'content')}>AI商城服务</Link>
      <Link href="/?channel=technical#channel-content" className={channel === 'technical' ? 'active' : ''} aria-current={channel === 'technical' ? 'location' : undefined} onClick={event => navigate(event, 'technical', 'content')}>上门技术服务</Link>
      <Link href="/?channel=technical#talent-entry" onClick={event => navigate(event, 'technical', 'talent-entry')}>技术人才入驻</Link>
    </nav>
    {adminVisible && <Link className="admin-entry" href="/admin" target="_blank" rel="noopener noreferrer">进入管理后台</Link>}
    {technicianVisible && <Link className="admin-entry" href="/technician">进入技术人员工作台</Link>}
    {children ?? <div className="account-actions"><Link className="orders-link" href="/points">我的积分</Link><Link className="orders-link" href="/orders">我的订单</Link><Link className="catalog-home-link" href="/">返回首页</Link></div>}
  </header>;
}
