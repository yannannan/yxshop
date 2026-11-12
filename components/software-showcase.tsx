'use client';
/* eslint-disable @next/next/no-img-element -- Product screenshots are administrator-uploaded images. */
import { useId, useState } from 'react';
import { useI18n } from './language-provider';
import type { SoftwareScreenshot } from '../lib/software-release';
export function SoftwareShowcase({ screenshots }: { screenshots: SoftwareScreenshot[] }) {
  const { t, locale } = useI18n(), [index, setIndex] = useState(0), id = useId();
  const current = screenshots[index] || screenshots[0];
  if (!current) return null;
  const caption = (shot: SoftwareScreenshot) => (locale === 'en' ? shot.captionEn || shot.caption : shot.caption) || t('软件界面');
  return <div className="cleaner-showcase"><div className="cleaner-showcase-image" id={id} role="tabpanel" aria-labelledby={`${id}-tab-${index}`}><img src={current.url} alt={caption(current)} loading="lazy" /><div className="cleaner-showcase-caption"><strong>{caption(current)}</strong><a href={current.url} target="_blank" rel="noopener noreferrer">{t('查看完整截图')} ↗</a></div></div>
    <div className="cleaner-screenshot-tabs" role="tablist" aria-label={t('软件界面预览')}>{screenshots.map((shot, i) => <button type="button" key={shot.url} id={`${id}-tab-${i}`} role="tab" aria-selected={index === i} aria-controls={id} tabIndex={index === i ? 0 : -1} onClick={() => setIndex(i)} onKeyDown={event => {
      const next = event.key === 'ArrowRight' ? (i + 1) % screenshots.length : event.key === 'ArrowLeft' ? (i + screenshots.length - 1) % screenshots.length : event.key === 'Home' ? 0 : event.key === 'End' ? screenshots.length - 1 : -1;
      if (next < 0) return; event.preventDefault(); setIndex(next); event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    }}><span>{String(i + 1).padStart(2, '0')}</span>{caption(shot)}</button>)}</div>
  </div>;
}
