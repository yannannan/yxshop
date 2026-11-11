'use client';
import { useCallback, useLayoutEffect, useRef, useState, type DragEventHandler, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { ArrowsPointingInIcon, MinusIcon, PlusIcon } from '@heroicons/react/24/outline';
import { useI18n } from './language-provider';
import { fitPreviewPage, limitPreviewZoom, previewZoomLimits } from '../lib/signature-zoom';

type Point = { x: number; y: number };
type Anchor = { page: Point; view: Point };
type Pan = { start: Point; scroll: Point; moved: boolean };
type Pinch = { distance: number; zoom: number; anchor: Anchor };

export function SignatureViewport({ aspect, zoom, onZoom, pageRef, children, onPlace, onGestureStart, onDragOver, onDrop }: {
  aspect: number;
  zoom: number;
  onZoom: (zoom: number) => void;
  pageRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  onPlace: (x: number, y: number) => void;
  onGestureStart: () => void;
  onDragOver: DragEventHandler<HTMLDivElement>;
  onDrop: DragEventHandler<HTMLDivElement>;
}) {
  const { t } = useI18n();
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 320, height: 480 });
  const pendingAnchor = useRef<Anchor | null>(null);
  const currentZoom = useRef(zoom);
  const touches = useRef(new Map<number, Point>());
  const pan = useRef<Pan | null>(null);
  const pinch = useRef<Pinch | null>(null);
  const suppressTap = useRef(false);
  const ignoreClickUntil = useRef(0);
  const fit = fitPreviewPage(size.width, size.height, aspect);
  const pageWidth = fit.width * zoom, pageHeight = fit.height * zoom;

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth, height = element.clientHeight;
      if (width && height) setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const alignAnchor = useCallback((anchor: Anchor) => {
    const element = viewport.current, page = pageRef.current;
    if (!element || !page) return;
    const box = element.getBoundingClientRect(), sheet = page.getBoundingClientRect();
    element.scrollLeft += sheet.left + sheet.width * anchor.page.x - box.left - element.clientLeft - anchor.view.x;
    element.scrollTop += sheet.top + sheet.height * anchor.page.y - box.top - element.clientTop - anchor.view.y;
  }, [pageRef]);

  useLayoutEffect(() => {
    currentZoom.current = zoom;
    if (!pendingAnchor.current) return;
    alignAnchor(pendingAnchor.current);
    pendingAnchor.current = null;
  }, [zoom, pageWidth, pageHeight, alignAnchor]);

  function anchorAt(point?: Point): Anchor | null {
    const element = viewport.current, page = pageRef.current;
    if (!element || !page) return null;
    const box = element.getBoundingClientRect(), sheet = page.getBoundingClientRect();
    const x = point?.x ?? box.left + element.clientLeft + element.clientWidth / 2;
    const y = point?.y ?? box.top + element.clientTop + element.clientHeight / 2;
    return {
      page: { x: (x - sheet.left) / sheet.width, y: (y - sheet.top) / sheet.height },
      view: { x: x - box.left - element.clientLeft, y: y - box.top - element.clientTop },
    };
  }

  function changeZoom(value: number, anchor = anchorAt()) {
    const next = limitPreviewZoom(value);
    currentZoom.current = next;
    if (anchor) {
      if (next === zoom) alignAnchor(anchor);
      else pendingAnchor.current = anchor;
    }
    onZoom(next);
  }

  function startPinch(element: HTMLDivElement) {
    const [first, second] = [...touches.current.values()];
    const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    const anchor = anchorAt(center);
    if (!anchor) return;
    pinch.current = { distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)), zoom: currentZoom.current, anchor };
    pan.current = null;
    suppressTap.current = true;
    onGestureStart();
    for (const id of touches.current.keys()) element.setPointerCapture(id);
  }

  function touchDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'touch') return;
    const point = { x: event.clientX, y: event.clientY };
    touches.current.set(event.pointerId, point);
    if (touches.current.size > 1) {
      event.preventDefault();
      event.stopPropagation();
      startPinch(event.currentTarget);
      return;
    }
    suppressTap.current = false;
    const target = event.target;
    if (target instanceof Element && target.closest('.ds-placement')) return;
    const element = viewport.current;
    if (!element) return;
    pan.current = { start: point, scroll: { x: element.scrollLeft, y: element.scrollTop }, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function touchMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'touch' || !touches.current.has(event.pointerId)) return;
    touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = pinch.current, element = viewport.current;
    if (gesture && touches.current.size > 1 && element) {
      event.preventDefault();
      event.stopPropagation();
      const [first, second] = [...touches.current.values()];
      const box = element.getBoundingClientRect();
      changeZoom(gesture.zoom * Math.hypot(first.x - second.x, first.y - second.y) / gesture.distance, {
        page: gesture.anchor.page,
        view: {
          x: (first.x + second.x) / 2 - box.left - element.clientLeft,
          y: (first.y + second.y) / 2 - box.top - element.clientTop,
        },
      });
      return;
    }
    const movement = pan.current;
    if (!movement || !element) return;
    const x = event.clientX - movement.start.x, y = event.clientY - movement.start.y;
    if (Math.hypot(x, y) > 6) movement.moved = true;
    if (!movement.moved) return;
    suppressTap.current = true;
    event.preventDefault();
    event.stopPropagation();
    element.scrollLeft = movement.scroll.x - x;
    element.scrollTop = movement.scroll.y - y;
  }

  function placeAt(point: Point) {
    const page = pageRef.current;
    if (!page) return;
    const box = page.getBoundingClientRect();
    if (point.x < box.left || point.x > box.right || point.y < box.top || point.y > box.bottom) return;
    page.focus({ preventScroll: true });
    onPlace((point.x - box.left) / box.width, (point.y - box.top) / box.height);
  }

  function touchEnd(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    if (event.pointerType !== 'touch' || !touches.current.has(event.pointerId)) return;
    ignoreClickUntil.current = Date.now() + 500;
    const wasPinching = Boolean(pinch.current);
    if (!cancelled && touches.current.size === 1 && pan.current && !pan.current.moved && !suppressTap.current) {
      placeAt({ x: event.clientX, y: event.clientY });
    }
    touches.current.delete(event.pointerId);
    if (touches.current.size >= 2) startPinch(event.currentTarget);
    else {
      pinch.current = null;
      pan.current = null;
      const [remaining] = [...touches.current.entries()];
      const element = viewport.current;
      if (remaining && wasPinching && element) {
        pan.current = { start: remaining[1], scroll: { x: element.scrollLeft, y: element.scrollTop }, moved: true };
        event.currentTarget.setPointerCapture(remaining[0]);
      }
    }
    if (wasPinching || cancelled) onGestureStart();
  }

  return <>
    <div className="ds-zoom-controls" role="group" aria-label={t('预览缩放')}>
      <button className="ds-icon-button" type="button" aria-label={t('缩小文件')} disabled={zoom <= previewZoomLimits.min}
        onClick={() => changeZoom(zoom - previewZoomLimits.step)}><MinusIcon aria-hidden="true" /></button>
      <label className="sr-only" htmlFor="ds-preview-zoom">{t('预览缩放')}</label>
      <input id="ds-preview-zoom" type="range" min="25" max="400" step="1" value={Math.round(zoom * 100)}
        onChange={event => changeZoom(Number(event.target.value) / 100)} />
      <button className="ds-icon-button" type="button" aria-label={t('放大文件')} disabled={zoom >= previewZoomLimits.max}
        onClick={() => changeZoom(zoom + previewZoomLimits.step)}><PlusIcon aria-hidden="true" /></button>
      <output htmlFor="ds-preview-zoom">{Math.round(zoom * 100)}%</output>
      <button className="ds-secondary" type="button" onClick={() => changeZoom(1)}><ArrowsPointingInIcon aria-hidden="true" />{t('适应窗口')}</button>
    </div>
    <div className="ds-preview-surface" ref={viewport} tabIndex={0} role="region" aria-label={t('文件预览')}>
      <div className="ds-preview-content" style={{ width: Math.max(size.width, pageWidth + 40), height: Math.max(size.height, pageHeight + 40) }}
        onPointerDownCapture={touchDown} onPointerMoveCapture={touchMove}
        onPointerUpCapture={event => touchEnd(event)} onPointerCancelCapture={event => touchEnd(event, true)}
        onClickCapture={event => {
          if (Date.now() < ignoreClickUntil.current) { event.preventDefault(); event.stopPropagation(); }
        }}>
        <div className="ds-page" ref={pageRef} tabIndex={-1} style={{ width: pageWidth, height: pageHeight }}
          onClick={event => { if (event.button === 0) placeAt({ x: event.clientX, y: event.clientY }); }}
          onDragOver={onDragOver} onDrop={onDrop}>{children}</div>
      </div>
    </div>
  </>;
}
