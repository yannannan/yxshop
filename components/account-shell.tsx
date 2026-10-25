'use client';
import { useI18n } from '@/components/language-provider';

import type { ReactNode } from 'react';
import { accountLoginHref, accountSections, type AccountSection } from '../lib/account';
import { refreshAccount, useAccount } from '../lib/account-client';
import { accountIcons } from './account-menu';

/* eslint-disable @next/next/no-html-link-for-pages -- 个人中心导航使用原生链接，兼容既有页面及异常软路由。 */
export function AccountShell({ section = 'overview', children, allowGuest = false }: { section?: AccountSection; children: ReactNode; allowGuest?: boolean }) {
  const { t } = useI18n();
  const { account, loading, error } = useAccount();
  const href = accountSections.find(item => item.key === section)?.href || '/account';
  return <main className="account-shell">
    <aside className="account-sidebar"><p>{t("个人中心")}</p><nav aria-label={t("个人中心功能")}>{accountSections.map(item => { const Icon = accountIcons[item.key]; return <a key={item.key} href={item.href} className={section === item.key ? 'active' : ''} aria-current={section === item.key ? 'page' : undefined}><Icon aria-hidden="true" />{t(item.label)}</a>; })}</nav><a className="account-back-home" href="/">{t("返回商城")}</a></aside>
    <div className="account-body">
      {error && <div className="account-notice" role="alert">{t(error)}<button onClick={() => void refreshAccount()}>{t("重新读取")}</button></div>}
      {!allowGuest && !account?.authenticated ? <section className="account-empty"><h1>{t(loading ? '正在读取个人账户…' : account ? '登录后管理个人账户' : '账户暂不可用')}</h1><p>{t("查看自己的积分、订单、工具记录和账号资料。")}</p>{!loading && (account ? <a className="account-primary" href={accountLoginHref(href)}>{t("登录 / 注册")}</a> : <button className="account-primary" onClick={() => void refreshAccount()}>{t("重试读取")}</button>)}</section> : children}
    </div>
  </main>;
}
