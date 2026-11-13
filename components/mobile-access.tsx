'use client';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from './language-provider';

const preferenceKey = 'yxshop.mobile-access-state.v1';
type Preference = 'auto' | 'expanded' | 'collapsed';
const readPreference = (value: string | null): Preference => value === 'expanded' || value === 'collapsed' ? value : 'auto';

export function MobileAccess() {
  const { t } = useI18n(), pathname = usePathname(), panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [preference, setPreference] = useState<Preference>('auto');
  const [revealedOn, setRevealedOn] = useState<string | null>(null);
  const [placement, setPlacement] = useState({ roomy: false, top: 98, right: 16, compactSize: 32 });
  const admin = pathname === '/admin' || !!pathname?.startsWith('/admin/');
  const expanded = (revealedOn !== null && revealedOn === pathname) || (placement.roomy && preference !== 'collapsed');

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try { setPreference(readPreference(window.localStorage.getItem(preferenceKey))); } catch { /* Storage is optional. */ }
    });
    function sync(event: StorageEvent) {
      if (event.key !== preferenceKey && event.key !== null) return;
      setPreference(readPreference(event.newValue));
      setRevealedOn(null);
    }
    window.addEventListener('storage', sync);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener('storage', sync); };
  }, []);

  useEffect(() => {
    if (admin) return;
    let frame = 0, header: Element | null = null, content: Element | null = null;
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    function measure() {
      frame = 0;
      const nextHeader = document.querySelector('.unified-topbar');
      const nextContent = document.querySelector('.cleaner-hero-inner') || document.querySelector('main');
      if (header !== nextHeader || content !== nextContent) {
        resize?.disconnect(); header = nextHeader; content = nextContent;
        if (header) resize?.observe(header);
        if (content) resize?.observe(content);
      }
      const width = document.documentElement.clientWidth || window.innerWidth;
      const height = window.innerHeight;
      const padding = content ? parseFloat(window.getComputedStyle(content).paddingRight) || 0 : 0;
      const edge = content ? content.getBoundingClientRect().right - padding : width;
      const gutter = Math.max(0, width - edge);
      const top = Math.max(12, Math.min((header?.getBoundingClientRect().height || 74) + 24, height - 60));
      const roomy = width > 720 && gutter >= 220 && height - top >= 240;
      const compactSize = gutter >= 60 ? 44 : gutter >= 40 ? 32 : 28;
      const right = roomy ? 24 : Math.max(0, Math.min(16, gutter - compactSize));
      const next = { roomy, top, right, compactSize };
      setPlacement(previous => Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
    }
    function schedule() { if (!frame) frame = window.requestAnimationFrame(measure); }
    function resized() { setRevealedOn(null); schedule(); }
    // A new page may have a full-width workspace instead of the previous page's side gutter.
    const resetFrame = window.requestAnimationFrame(() => { setRevealedOn(null); schedule(); });
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', resized);
    schedule();
    return () => {
      window.cancelAnimationFrame(frame); window.cancelAnimationFrame(resetFrame);
      resize?.disconnect(); mutations.disconnect(); window.removeEventListener('resize', resized);
    };
  }, [pathname, admin]);

  function toggle(open: boolean) {
    const value = open ? 'expanded' : 'collapsed';
    setPreference(value);
    setRevealedOn(open && !placement.roomy ? pathname : null);
    try { window.localStorage.setItem(preferenceKey, value); } catch { /* Keep the in-memory choice when storage is unavailable. */ }
  }

  if (admin) return null;
  const iconOnly = !expanded && !placement.roomy;
  return <aside className={`mobile-access-floating${expanded ? ' is-expanded' : ''}${iconOnly ? ' is-icon' : ''}`}
    data-mobile-access="true" aria-label={t('扫码手机端访问')}
    style={{ top: placement.top, right: placement.right, width: iconOnly ? placement.compactSize : 180, maxHeight: `calc(100dvh - ${placement.top + 16}px)` }}
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
