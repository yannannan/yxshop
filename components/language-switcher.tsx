'use client';
import { localeCookie, parseLocale, type Locale } from '../lib/i18n';
import { useI18n } from './language-provider';

export function saveLanguage(locale: Locale) {
  // This is a display preference, never an authentication cookie. A full page
  // refresh also updates server-rendered copy and metadata, without changing URLs.
  document.cookie = `${localeCookie}=${parseLocale(locale)}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
  window.location.reload();
}
export function LanguageSwitcher() {
  const { locale } = useI18n();
  return <label className="language-switcher"><span aria-hidden="true">中 / EN</span><select aria-label="语言 / Language" title={locale === 'en' ? 'Changing language refreshes this page. Save your edits first.' : '切换语言会刷新当前页面，请先保存正在编辑的内容。'} value={locale} onChange={event => saveLanguage(parseLocale(event.target.value))}><option value="zh-CN">简体中文</option><option value="en">English</option></select></label>;
}
