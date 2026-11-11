'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { toolFeatures } from '../lib/tool-analytics';

export function ToolActivity() {
  const path = usePathname();
  const lastView = useRef('');
  useEffect(() => {
    if (path?.startsWith('/admin') || !globalThis.crypto?.randomUUID || typeof fetch !== 'function') return;
    let session: string;
    try { session = sessionStorage.getItem('yx_tool_session') || crypto.randomUUID(); sessionStorage.setItem('yx_tool_session', session); }
    catch { session = crypto.randomUUID(); }
    function report(slug: string, type: string, module = '') {
      void fetch('/api/tools/activity', { method: 'POST', credentials: 'same-origin', keepalive: true,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: crypto.randomUUID(), session, slug, type, module }) }).catch(() => {});
    }
    const slug = /^\/tools\/([a-z0-9-]+)(?:\.html)?\/?$/.exec(path || '')?.[1];
    if (slug && lastView.current !== path) { lastView.current = path; report(slug, 'view', Object.keys(toolFeatures(slug))[0] || ''); }
    function clicked(event: MouseEvent) {
      if (event.defaultPrevented || event.type === 'auxclick' && event.button !== 1) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-tool-entry],[data-tool-module]') : null;
      if (!target || target.matches(':disabled') || target.getAttribute('aria-pressed') === 'true' || target.getAttribute('aria-current') === 'page') return;
      if (target.dataset.toolEntry) report(target.dataset.toolEntry, 'entry', Object.keys(toolFeatures(target.dataset.toolEntry))[0] || '');
      else if (target.dataset.toolSlug && target.dataset.toolModule) report(target.dataset.toolSlug, 'module', target.dataset.toolModule);
    }
    document.addEventListener('click', clicked, true); document.addEventListener('auxclick', clicked, true);
    return () => { document.removeEventListener('click', clicked, true); document.removeEventListener('auxclick', clicked, true); };
  }, [path]);
  return null;
}
