"use client";

import Image from 'next/image';
import type { MouseEvent, ReactNode } from 'react';
import { AccountMenu } from './account-menu';

type Channel = 'mall' | 'technical' | 'ai-leads' | 'ai-operations';
type Target = 'content' | 'talent-entry';
type Props = {
  channel?: Channel;
  onNavigate?: (channel: 'mall' | 'technical', target: Target) => void;
  isAdmin?: boolean;
  isTechnician?: boolean;
  children?: ReactNode;
  onSignIn?: () => void;
  onSignedOut?: () => void;
};

export function StorefrontHeader({ channel = 'mall', onNavigate, children, onSignIn, onSignedOut }: Props) {
  function navigate(event: MouseEvent<HTMLAnchorElement>, next: 'mall' | 'technical', target: Target) {
    if (!onNavigate || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(next, target);
  }

  /* eslint-disable @next/next/no-html-link-for-pages -- 首页及跨页频道入口采用原生导航，避免软路由异常时点击失效。 */
  return <header className="topbar refined-topbar compact-topbar unified-topbar">
    <a className="brand" href="/" aria-label="宇星脉通首页">
      <span className="brand-mark"><Image src="/yxstar_logo.png" alt="宇星脉通 Logo" fill sizes="34px" /></span><span>宇星脉通</span>
    </a>
    <nav className="site-navigation" aria-label="主导航">
      <a href="/#channel-content" className={channel === 'mall' ? 'active' : ''} aria-current={channel === 'mall' ? 'location' : undefined} onClick={event => navigate(event, 'mall', 'content')}>AI数字服务</a>
      <a href="/?channel=technical#channel-content" className={channel === 'technical' ? 'active' : ''} aria-current={channel === 'technical' ? 'location' : undefined} onClick={event => navigate(event, 'technical', 'content')}>上门技术服务</a>
      <a href="/ai-leads" className={channel === 'ai-leads' ? 'active' : ''} aria-current={channel === 'ai-leads' ? 'page' : undefined}>AI智能获客</a>
      <a href="/ai-operations" className={channel === 'ai-operations' ? 'active' : ''} aria-current={channel === 'ai-operations' ? 'page' : undefined}>AI运营工具</a>
    </nav>
    {children}<AccountMenu onSignIn={onSignIn} onSignedOut={onSignedOut} />
  </header>;
  /* eslint-enable @next/next/no-html-link-for-pages */
}
