'use client';
/* eslint-disable @next/next/no-img-element -- Small raster UI icons are generated from the installed Heroicons library. */
import { useEffect, useId, useRef, type ReactNode } from 'react';

export function WorkspaceIcon({ name, className = '' }: { name: string; className?: string }) {
  return <img className={'ag-icon ' + className} src={'/media/ai-workspace/icons/' + name + '.png'} width={24} height={24} alt="" aria-hidden="true" />;
}
export function WorkspaceDialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={'ag-dialog' + (wide ? ' ag-dialog-wide' : '')} aria-labelledby={titleId} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header><h2 id={titleId}>{title}</h2><button type="button" className="ag-icon-button" onClick={onClose} aria-label="Close / 关闭"><WorkspaceIcon name="close" /></button></header><div className="ag-dialog-body">{children}</div>
  </dialog>;
}
export function WorkspaceStats({ items }: { items: { label: string; value: string | number; detail: string }[] }) {
  return <div className="ag-stats">{items.map(item => <article key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small></article>)}</div>;
}
