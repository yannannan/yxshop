'use client';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from './language-provider';

// Start the revised text-button design expanded, without inheriting the old icon-only mode.
const preferenceKey = 'yxshop.mobile-access-state.v2';
const readExpanded = (value: string | null) => value !== 'collapsed';

export function MobileAccess() {
  const { t } = useI18n(), pathname = usePathname(), panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(true);
  const [top, setTop] = useState(98);
  const admin = pathname === '/admin' || !!pathname?.startsWith('/admin/');

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try { setExpanded(readExpanded(window.localStorage.getItem(preferenceKey))); } catch { /* Storage is optional. */ }
    });
    function sync(event: StorageEvent) {
      if (event.key !== preferenceKey && event.key !== null) return;
      setExpanded(readExpanded(event.newValue));
    }
    window.addEventListener('storage', sync);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener('storage', sync); };
  }, []);

  useEffect(() => {
    if (admin) return;
    let frame = 0, header: Element | null = null;
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    function measure() {
      frame = 0;
      const nextHeader = document.querySelector('.unified-topbar');
      if (header !== nextHeader) {
        resize?.disconnect(); header = nextHeader;
        if (header) resize?.observe(header);
      }
      setTop(Math.max(12, Math.min((header?.getBoundingClientRect().height || 74) + 24, window.innerHeight - 60)));
    }
    function schedule() { if (!frame) frame = window.requestAnimationFrame(measure); }
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      window.cancelAnimationFrame(frame);
      resize?.disconnect(); mutations.disconnect(); window.removeEventListener('resize', schedule);
    };
  }, [pathname, admin]);

  function toggle(open: boolean) {
    const value = open ? 'expanded' : 'collapsed';
    setExpanded(open);
    try { window.localStorage.setItem(preferenceKey, value); } catch { /* Keep the in-memory choice when storage is unavailable. */ }
  }

  if (admin) return null;
  return <aside className={`mobile-access-floating${expanded ? ' is-expanded' : ''}`}
    data-mobile-access="true" aria-label={t('扫码手机端访问')}
    style={{ top, maxHeight: `calc(100dvh - ${top + 16}px)` }}
    onKeyDown={event => { if (event.key === 'Escape' && expanded) { event.preventDefault(); toggle(false); trigger.current?.focus(); } }}>
    <button type="button" className="mobile-access-trigger" ref={trigger} aria-expanded={expanded} aria-controls={panelId}
      aria-label={t('展开或收起手机访问二维码')} title={t('扫码手机端访问')} onClick={() => toggle(!expanded)}>
      <Image unoptimized src="/tool-icons/mobile-access.svg" alt="" width={20} height={20} />
      <b>{t('扫码手机端访问')}</b>
      <Image unoptimized className="mobile-access-toggle" src="/tool-icons/chevron-down.svg" alt="" width={13} height={13} />
    </button>
    <div className="mobile-access-code" id={panelId} hidden={!expanded}>
      <a href="https://www.yxstar.shop" target="_blank" rel="noopener noreferrer" aria-label={t('打开宇星脉通首页')}>
        <Image unoptimized src="/mobile-access-qr.png" alt={t('扫码访问宇星脉通手机端')} width={148} height={148} />
      </a>
      <span>www.yxstar.shop</span>
    </div>
  </aside>;
}
