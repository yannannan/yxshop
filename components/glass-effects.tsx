'use client';
import { useEffect } from 'react';

// One delegated listener for the whole site; pointer motion never updates React state.
export function GlassEffects() {
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const cards = '.tool-entry-card,.portal-shortcut,.product-card,.points-package,.channel-switch>button';
    const navigation = '.site-navigation,.category-tabs,.ds-modes,.account-sidebar>nav,.al-sidebar>nav,.ip-sidebar>nav,.technician-sidebar>nav';
    let active: HTMLElement | null = null, bounds: DOMRect | null = null;
    let pointerFrame = 0, navigationFrame = 0, x = 0, y = 0;
    function reset() {
      if (active) for (const property of ['--glow-x', '--glow-y', '--tilt-x', '--tilt-y']) active.style.removeProperty(property);
      active = null; bounds = null;
      window.cancelAnimationFrame(pointerFrame); pointerFrame = 0;
    }
    function enter(event: PointerEvent) {
      if (!finePointer.matches || preference.matches || !(event.target instanceof Element)) return;
      const next = event.target.closest<HTMLElement>(cards);
      if (next === active) return;
      reset();
      if (next) { active = next; bounds = next.getBoundingClientRect(); }
    }
    function move(event: PointerEvent) {
      if (!active || !bounds) return;
      x = event.clientX - bounds.left; y = event.clientY - bounds.top;
      if (pointerFrame) return;
      pointerFrame = window.requestAnimationFrame(() => {
        pointerFrame = 0;
        if (!active || !bounds) return;
        active.style.setProperty('--glow-x', `${x}px`); active.style.setProperty('--glow-y', `${y}px`);
        active.style.setProperty('--tilt-x', `${(0.5 - Math.min(1, Math.max(0, y / bounds.height))) * 3}deg`);
        active.style.setProperty('--tilt-y', `${(Math.min(1, Math.max(0, x / bounds.width)) - 0.5) * 3}deg`);
      });
    }
    function leave(event: PointerEvent) {
      if (active && (!(event.relatedTarget instanceof Node) || !active.contains(event.relatedTarget))) reset();
    }
    function updateNavigation() {
      navigationFrame = 0;
      document.querySelectorAll<HTMLElement>(navigation).forEach(nav => {
        const selected = nav.querySelector<HTMLElement>(':scope>a.active,:scope>button.active,:scope>button[aria-pressed="true"],:scope>a[aria-current="page"],:scope>button[aria-current="page"]');
        if (!selected) { nav.removeAttribute('data-glass-nav'); return; }
        const container = nav.getBoundingClientRect(), item = selected.getBoundingClientRect();
        nav.style.setProperty('--nav-x', `${item.left - container.left + nav.scrollLeft}px`);
        nav.style.setProperty('--nav-y', `${item.top - container.top + nav.scrollTop}px`);
        nav.style.setProperty('--nav-w', `${item.width}px`); nav.style.setProperty('--nav-h', `${item.height}px`);
        nav.setAttribute('data-glass-nav', 'ready');
      });
    }
    function scheduleNavigation() { if (!navigationFrame) navigationFrame = window.requestAnimationFrame(updateNavigation); }
    const changes = new MutationObserver(scheduleNavigation);
    changes.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'aria-pressed', 'aria-current'] });
    const resize = new ResizeObserver(scheduleNavigation); resize.observe(document.body);
    document.addEventListener('pointerover', enter, { passive: true });
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerout', leave, { passive: true });
    window.addEventListener('scroll', reset, { passive: true });
    window.addEventListener('resize', scheduleNavigation, { passive: true });
    preference.addEventListener('change', reset); finePointer.addEventListener('change', reset);
    scheduleNavigation();
    return () => {
      reset(); window.cancelAnimationFrame(navigationFrame); changes.disconnect(); resize.disconnect();
      document.removeEventListener('pointerover', enter); document.removeEventListener('pointermove', move); document.removeEventListener('pointerout', leave);
      window.removeEventListener('scroll', reset); window.removeEventListener('resize', scheduleNavigation);
      preference.removeEventListener('change', reset); finePointer.removeEventListener('change', reset);
    };
  }, []);
  return null;
}
