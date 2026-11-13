'use client';
/* eslint-disable @next/next/no-img-element -- Screenshots retain their original uploaded pixels. */
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from '@heroicons/react/24/outline';
import { useI18n } from './language-provider';
import type { SoftwareScreenshot } from '../lib/software-release';

export type SoftwareSlideDetail = { url: string; title: string; detail: string; points: string[] };

export function SoftwareShowcase({ screenshots, details = [], variant = 'full' }: { screenshots: SoftwareScreenshot[]; details?: SoftwareSlideDetail[]; variant?: 'full' | 'hero' }) {
  const { t, locale } = useI18n(), id = useId(), count = screenshots.length;
  const [index, setIndex] = useState(0), [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
  const region = useRef<HTMLElement>(null), inView = useRef(true), overrideMotion = useRef(false);
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const activeIndex = count ? index % count : 0, current = screenshots[activeIndex];
  const caption = (shot: SoftwareScreenshot) => (locale === 'en' ? shot.captionEn || shot.caption : shot.caption) || t('软件界面');
  const selectedDetail = details.find(row => row.url === current?.url);
  const step = (direction: number) => { if (count > 1) setIndex(value => (value + count + direction) % count); };

  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const respectMotion = () => { if (preference?.matches) { overrideMotion.current = false; setPlaying(false); } };
    const initial = window.setTimeout(respectMotion, 0);
    preference?.addEventListener?.('change', respectMotion);
    const observer = typeof IntersectionObserver === 'function' && region.current ? new IntersectionObserver(entries => { inView.current = entries[0]?.isIntersecting ?? true; }) : null;
    if (region.current) observer?.observe(region.current);
    return () => { window.clearTimeout(initial); preference?.removeEventListener?.('change', respectMotion); observer?.disconnect(); };
  }, []);

  useEffect(() => {
    if (count < 2 || !playing || hovered || focused) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden' || !inView.current || gesture.current) return;
      if (!overrideMotion.current && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      setIndex(value => (value + 1) % count);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [count, activeIndex, playing, hovered, focused]);

  useEffect(() => {
    const strip = region.current?.querySelector<HTMLElement>('.cleaner-screenshot-tabs');
    const selected = strip?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (strip && selected) strip.scrollTo?.({ left: Math.max(0, selected.offsetLeft - strip.offsetLeft - (strip.clientWidth - selected.offsetWidth) / 2), behavior: 'auto' });
  }, [activeIndex, count]);

  if (!current) return null;
  return <section className={`cleaner-showcase${variant==='hero'?' cleaner-showcase-hero':''}`} ref={region} aria-roledescription={t('轮播图')} aria-label={t(variant==='hero'?'首屏软件预览':'软件界面预览')}
    onPointerEnter={event => { if (event.pointerType === 'mouse' || event.pointerType === 'pen') setHovered(true); }} onPointerLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    {variant==='hero'&&<div className="cleaner-window-bar"><span/><span/><span/><small>YX DISK</small></div>}
    <div className="cleaner-carousel-toolbar"><div><span className="cleaner-carousel-kicker">YX DISK</span><h3>{caption(current)}</h3></div><div className="cleaner-carousel-actions">
      <span className="cleaner-carousel-count"><b>{String(activeIndex + 1).padStart(2, '0')}</b> / {String(count).padStart(2, '0')}</span>
      {count > 1 && <button type="button" className="cleaner-carousel-play" aria-label={t(playing ? '暂停轮播' : '开始轮播')} title={t(playing ? '暂停轮播' : '开始轮播')} onClick={() => { overrideMotion.current = !playing; setPlaying(value => !value); setFocused(false); }}>{playing ? <PauseIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}</button>}
    </div></div>
    <div className="cleaner-showcase-image" id={id} role="tabpanel" aria-labelledby={`${id}-tab-${activeIndex}`}>
      <div className="cleaner-carousel-viewport" onPointerDown={event => {
        if (event.pointerType !== 'touch') return;
        if (!event.isPrimary) { gesture.current = null; return; }
        if ((event.target as Element).closest?.('button,a')) return;
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerUp={event => {
        const start = gesture.current; gesture.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x, dy = event.clientY - start.y;
        if (Math.abs(dx) >= 44 && Math.abs(dx) > Math.abs(dy) * 1.2) step(dx < 0 ? 1 : -1);
      }} onPointerCancel={() => { gesture.current = null; }}>
        <div className="cleaner-carousel-track" style={{ transform: `translate3d(-${activeIndex * 100}%,0,0)` }}>{screenshots.map((shot, i) => <div className="cleaner-carousel-slide" key={shot.url} aria-hidden={i !== activeIndex}><img src={shot.url} alt={i === activeIndex ? caption(shot) : ''} width="1920" height="1009" loading={i === activeIndex ? 'eager' : 'lazy'} draggable={false} /></div>)}</div>
        {count > 1 && <><button type="button" className="cleaner-carousel-arrow previous" aria-label={t('上一张截图')} onClick={() => step(-1)}><ChevronLeftIcon aria-hidden="true" /></button><button type="button" className="cleaner-carousel-arrow next" aria-label={t('下一张截图')} onClick={() => step(1)}><ChevronRightIcon aria-hidden="true" /></button></>}
      </div>
      <div className="cleaner-showcase-caption"><strong>{caption(current)}</strong><a href={current.url} target="_blank" rel="noopener noreferrer">{t('查看完整截图')} ↗</a></div>
    </div>
    <div className="cleaner-screenshot-tabs" role="tablist" aria-label={t('软件界面预览')}>{screenshots.map((shot, i) => <button type="button" key={shot.url} id={`${id}-tab-${i}`} role="tab" aria-label={caption(shot)} aria-selected={activeIndex === i} aria-controls={id} title={caption(shot)} tabIndex={activeIndex === i ? 0 : -1} onClick={() => setIndex(i)} onKeyDown={event => {
      const next = event.key === 'ArrowRight' ? (i + 1) % count : event.key === 'ArrowLeft' ? (i + count - 1) % count : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : -1;
      if (next < 0) return; event.preventDefault(); setIndex(next); event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus({ preventScroll: true });
    }}>{variant!=='hero'&&<img src={shot.url} alt="" width="128" height="67" loading="lazy" draggable={false} />}<span>{caption(shot)}</span></button>)}</div>
    {variant!=='hero'&&<div className="cleaner-carousel-detail" aria-live={playing && !hovered && !focused ? 'off' : 'polite'}><div><h4>{selectedDetail?.title || caption(current)}</h4><p>{selectedDetail?.detail || t('查看软件的实际功能界面。')}</p></div>{selectedDetail?.points.length ? <ul>{selectedDetail.points.map(point => <li key={point}>{point}</li>)}</ul> : null}</div>}
  </section>;
}
