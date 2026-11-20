'use client';

import { useEffect, useRef, useState } from 'react';
import { TrashIcon } from '@heroicons/react/24/outline';
import { useI18n } from './language-provider';
import type { ToolResultKind } from '../lib/tool-result-deletion';

export function ToolResultDelete({ kind, id, disabled = false, onDeleted }: {
  kind: ToolResultKind; id: string; disabled?: boolean; onDeleted: (id: string) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function remove() {
    if (disabled || request.current || !window.confirm(t('删除此制作记录？删除后该成品将无法查看或下载。工具使用记录和积分消耗明细仍保留，已消耗权益不退回。'))) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/tools/results/${kind}/${encodeURIComponent(id)}`, { method: 'DELETE', signal: controller.signal });
      const data = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !data.ok) throw new Error(data.message || '删除失败，请稍后重试');
      if (!controller.signal.aborted) onDeleted(id);
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message || '删除失败，请稍后重试');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      if (request.current === controller) request.current = null;
    }
  }
  return <div className="tool-result-delete">
    <button type="button" disabled={disabled || busy} onClick={() => void remove()} aria-label={t('删除制作记录')} title={t(disabled ? '请等待当前操作完成后再删除' : '删除制作记录，保留使用流水')}>
      <TrashIcon aria-hidden="true" />{t(busy ? '删除中…' : '删除')}
    </button>
    {error && <small role="alert">{t(error)}</small>}
  </div>;
}
