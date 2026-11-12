'use client';
import { useState } from 'react';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { useI18n } from './language-provider';
import { softwareDownloadPath } from '../lib/software-release';
export function SoftwareDownloadButton({ id, name, ready }: { id?: string; name?: string; ready: boolean }) {
  const { t } = useI18n(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!id || !ready) return <button type="button" className="cleaner-download" disabled><ArrowDownTrayIcon aria-hidden="true" />{t(id ? '下载暂不可用' : '版本即将发布')}</button>;
  return <div className="cleaner-download-control"><a className="cleaner-download" href={softwareDownloadPath(id)} download={name} aria-disabled={busy} data-tool-slug="c-drive-cleaner" data-tool-module="download" onClick={async event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { const response = await fetch(`${softwareDownloadPath(id)}&format=json`, { cache: 'no-store' }); const data = await response.json() as { url?: string; message?: string };
      if (!response.ok || !data.url) throw Error(data.message || '软件暂时无法下载，请稍后重试');
      window.location.assign(data.url);
    } catch (reason) { setError(reason instanceof TypeError ? '软件暂时无法下载，请稍后重试' : (reason as Error).message); } finally { setBusy(false); }
  }}><ArrowDownTrayIcon aria-hidden="true" />{t(busy ? '正在准备下载…' : '免费下载 Windows版')}<span aria-hidden="true">↗</span></a>{error && <p role="alert" className="cleaner-download-error">{t(error)}</p>}</div>;
}
