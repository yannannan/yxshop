'use client';
/* eslint-disable @next/next/no-img-element -- Private signature previews and local image URLs use native images. */
/* eslint-disable @next/next/no-html-link-for-pages -- Cross-page tool navigation uses native links. */
import { useEffect, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import {
  ArrowDownTrayIcon, ArrowLeftIcon, ArrowPathIcon, ArrowUpTrayIcon, ChevronLeftIcon, ChevronRightIcon,
  CheckBadgeIcon, ClockIcon, DocumentCheckIcon, DocumentTextIcon, FingerPrintIcon, PencilSquareIcon, PlusIcon, RectangleStackIcon, TrashIcon,
} from '@heroicons/react/24/outline';
import type { RenderTask } from 'pdfjs-dist';
import { useI18n } from './language-provider';
import { StampMaker } from './stamp-maker';
import { SignatureViewport } from './signature-viewport';
import { HandprintMaker } from './handprint-maker';
import type { HandprintRaster } from '../lib/handprint-raster';
import { notifyAccountChanged, useAccount } from '../lib/account-client';
import { accountLoginHref } from '../lib/account';
import {
  disposeSignatureSource, loadSignatureSource, signatureAccess, signaturePage, signatureRequest, type SignatureSource,
} from '../lib/signature-client';
import {
  signatureActions, signatureLimits, signingAssetKey, type SavedSignature, type SignatureAccess, type SignatureAction,
  type SignaturePlacement, type SignedDocument,
} from '../lib/signature-tool';
import type { ToolService } from '../lib/tool-services';

type Placement = SignaturePlacement & { key: string };
type WorkspaceMode = SignatureAction | 'stamp';
type SigningChoice = Pick<SavedSignature, 'id' | 'name' | 'width' | 'height' | 'previewUrl'> & Pick<SignaturePlacement, 'asset'>;
type PageSize = { page: number; width: number; height: number };
const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
const assetDragType = 'application/x-yxstar-signing-asset';
const choiceKey = (item: SigningChoice) => signingAssetKey({ signatureId: item.id, asset: item.asset });

function SigningAssetList({ items, busy, selectedKey, draggable = false, onChoose, onRemove }: {
  items: SigningChoice[];
  busy: boolean;
  selectedKey?: string;
  draggable?: boolean;
  onChoose: (item: SigningChoice) => void;
  onRemove?: (id: string) => void;
}) {
  const { t } = useI18n();
  if (!items.length) return <p className="ds-empty-copy">{t('签名库暂时为空')}</p>;
  return <ul className="ds-library-list">
    {items.map(item => <li key={choiceKey(item)}>
      <button type="button" className="ds-signature-choice" disabled={busy}
        aria-pressed={selectedKey === undefined ? undefined : choiceKey(item) === selectedKey}
        draggable={draggable && !busy}
        onDragStart={draggable && !busy ? event => {
          event.dataTransfer.effectAllowed = 'copy';
          event.dataTransfer.setData(assetDragType, choiceKey(item));
        } : undefined}
        onClick={() => onChoose(item)}>
        <img src={item.previewUrl} alt="" loading="lazy" draggable={false} /><span title={item.name}>{item.name}</span>
      </button>
      {onRemove && <button type="button" className="ds-icon-button" aria-label={t('删除签名')}
        disabled={busy} onClick={() => onRemove(item.id)}><TrashIcon /></button>}
    </li>)}
  </ul>;
}

type SignatureEditorProps = { tool: ToolService; stampTool: ToolService | null };

export function DocumentSignature({ tool, stampTool }: SignatureEditorProps) {
  const { account } = useAccount();
  return <SignatureEditor key={account?.user?.id ?? 'guest'} tool={tool} stampTool={stampTool} />;
}

function SignatureEditor({ tool, stampTool }: SignatureEditorProps) {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<WorkspaceMode>('create');
  const [access, setAccess] = useState<SignatureAccess | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileLoading, setFileLoading] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [ink, setInk] = useState('#192b42');
  const [hasInk, setHasInk] = useState(false);
  const [source, setSource] = useState<SignatureSource | null>(null);
  const [page, setPage] = useState(1);
  const [pdfSize, setPdfSize] = useState<PageSize | null>(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [renderZoom, setRenderZoom] = useState(1);
  const [assetType, setAssetType] = useState<'signature' | 'stamp' | 'handprint'>('signature');
  const [selectedAssetKey, setSelectedAssetKey] = useState('');
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [activeKey, setActiveKey] = useState('');
  const [result, setResult] = useState<SignedDocument | null>(null);
  const [stampVisited, setStampVisited] = useState(false);
  const [handprintVisited, setHandprintVisited] = useState(false);
  const penCanvas = useRef<HTMLCanvasElement>(null);
  const draft = useRef<ImageData | null>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const signatureUpload = useRef<HTMLInputElement>(null);
  const documentUpload = useRef<HTMLInputElement>(null);
  const pen = useRef<{ id: number; x: number; y: number } | null>(null);
  const drag = useRef<{ key: string; id: number; x: number; y: number } | null>(null);
  const operation = useRef<AbortController | null>(null);
  const taskIds = useRef({ create: '', sign: '' });
  const stampReload = useRef<AbortController | null>(null);
  const toolbar = useRef<HTMLElement>(null);

  async function refresh(signal: AbortSignal) {
    const data = await signatureAccess(signal);
    if (!signal.aborted) setAccess(data);
  }

  useEffect(() => {
    const request = new AbortController();
    void signatureAccess(request.signal).then(data => {
      if (!request.signal.aborted) setAccess(data);
    }).catch(reason => { if (!request.signal.aborted) setError(reason.message); });
    return () => {
      request.abort();
      stampReload.current?.abort();
      operation.current?.abort();
    };
  }, []);

  useEffect(() => () => { if (source) disposeSignatureSource(source); }, [source]);
  useEffect(() => {
    if (mode !== 'create' || !draft.current) return;
    penCanvas.current?.getContext('2d')?.putImageData(draft.current, 0, 0);
  }, [mode]);

  useEffect(() => {
    const timer = setTimeout(() => setRenderZoom(previewZoom), 150);
    return () => clearTimeout(timer);
  }, [previewZoom]);

  useEffect(() => {
    if (source?.kind !== 'pdf' || mode !== 'sign') return;
    let active = true;
    let rendering: RenderTask | undefined;
    void (async () => {
      let buffer: HTMLCanvasElement | undefined;
      try {
        const pdfPage = await source.pdf.getPage(page);
        const canvas = preview.current;
        if (!active || !canvas) return;
        const original = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({ scale: Math.min(2 * renderZoom, 3000 / original.width,
          4000 / original.height, Math.sqrt(6_000_000 / (original.width * original.height))) });
        buffer = document.createElement('canvas');
        buffer.width = Math.max(1, Math.ceil(viewport.width));
        buffer.height = Math.max(1, Math.ceil(viewport.height));
        rendering = pdfPage.render({ canvas: buffer, viewport, background: '#ffffff' });
        await rendering.promise;
        if (active && preview.current === canvas) {
          canvas.width = buffer.width;
          canvas.height = buffer.height;
          canvas.getContext('2d')?.drawImage(buffer, 0, 0);
          setPdfSize({ page, width: viewport.width, height: viewport.height });
        }
      } catch {
        if (active) setError('PDF 页面预览失败，请切换页面或重新上传');
      } finally {
        if (buffer) { buffer.width = 0; buffer.height = 0; }
      }
    })();
    return () => { active = false; rendering?.cancel(); };
  }, [mode, page, source, renderZoom]);

  const signatures = access?.signatures ?? [];
  const stamps: SigningChoice[] = (access?.stamps ?? []).map(stamp => ({
    ...stamp, asset: 'stamp', name: t(`印章 · ${new Date(stamp.createdAt).toLocaleString(locale)}`),
  }));
  const handprints: SigningChoice[] = (access?.handprints ?? []).map(item => ({ ...item, asset: 'handprint' }));
  const choices: SigningChoice[] = assetType === 'stamp' ? stamps : assetType === 'handprint' ? handprints : signatures;
  const currentAsset = choices.find(item => choiceKey(item) === selectedAssetKey) ?? choices[0];
  const pageCount = source?.kind === 'pdf' ? source.pdf.numPages : 1;
  const pageSize = source?.kind === 'image' ? source : pdfSize?.page === page ? pdfSize : null;
  const activePlacement = placements.find(item => item.key === activeKey && item.page === page);
  const visiblePlacements = placements.filter(item => item.page === page);
  const estimate = (action: SignatureAction) => access?.hasMembership ? 0 : access?.costs[action] ?? tool.pointsCost ?? 0;
  const canRun = Boolean(access?.canProcess);

  async function run(work: (signal: AbortSignal) => Promise<void>) {
    if (operation.current) return;
    const request = new AbortController();
    operation.current = request;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work(request.signal);
    } catch (reason) {
      if (!request.signal.aborted) setError((reason as Error).message);
    } finally {
      if (operation.current === request) operation.current = null;
      if (!request.signal.aborted) setBusy(false);
    }
  }

  function switchMode(next: WorkspaceMode) {
    if (mode === next) return;
    if (mode === 'create' && hasInk) {
      const canvas = penCanvas.current;
      draft.current = canvas?.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height) ?? null;
    }
    setError('');
    setNotice('');
    if (next === 'stamp') setStampVisited(true);
    if (next === 'handprint') setHandprintVisited(true);
    setMode(next);
    toolbar.current?.scrollIntoView({ block: 'nearest' });
  }

  function draw(event: PointerEvent<HTMLCanvasElement>, start: boolean) {
    if (busy || (start ? event.button !== 0 : pen.current?.id !== event.pointerId)) return;
    const canvas = event.currentTarget;
    const context = canvas.getContext('2d');
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * canvas.width / rect.width;
    const y = (event.clientY - rect.top) * canvas.height / rect.height;
    context.strokeStyle = ink;
    context.lineWidth = 4.5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(start ? x - .1 : pen.current!.x, start ? y : pen.current!.y);
    context.lineTo(x, y);
    context.stroke();
    if (start) canvas.setPointerCapture(event.pointerId);
    pen.current = { id: event.pointerId, x, y };
    taskIds.current.create = '';
    setHasInk(true);
  }

  function clearDraft() {
    const canvas = penCanvas.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    draft.current = null;
    taskIds.current.create = '';
    setHasInk(false);
  }

  function importDraft(file: File) {
    void run(async signal => {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > signatureLimits.fileBytes) {
        throw Error('请上传12MB以内的 PNG、JPG 或 WebP');
      }
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      try {
        signal.throwIfAborted();
        const canvas = penCanvas.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) throw Error('浏览器暂不支持图片处理');
        clearDraft();
        const ratio = Math.min((canvas.width - 32) / bitmap.width, (canvas.height - 32) / bitmap.height);
        const width = bitmap.width * ratio, height = bitmap.height * ratio;
        context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
        setHasInk(true);
      } finally { bitmap.close(); }
    });
  }

  function saveSignature() {
    void run(async signal => {
      const canvas = penCanvas.current;
      const context = canvas?.getContext('2d');
      if (!access || !canvas || !context) return;
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
      const id = taskIds.current.create ||= crypto.randomUUID();
      const response = await signatureRequest<{ signature: SavedSignature }>('POST', signal, {
        id, name, action: 'create', width, height, chargeType: access.chargeType, cost: access.costs.create,
      }, new Blob([new Uint8Array(data)]));
      signal.throwIfAborted();
      setAccess(old => old && ({
        ...old, signatures: [response.signature, ...old.signatures.filter(item => item.id !== response.signature.id)],
      }));
      setAssetType('signature');
      setSelectedAssetKey(response.signature.id);
      clearDraft();
      setName('');
      setNotice('签名已保存到签名库');
      notifyAccountChanged();
      await refresh(signal);
    });
  }

  function selectFile(file: File) {
    void run(async signal => {
      const word = /\.docx$/i.test(file.name);
      setFileLoading(word ? '正在将 Word 转换为 PDF…' : '正在读取文件…');
      try {
        const loaded = await loadSignatureSource(file, access?.wordReady, signal);
        if (signal.aborted) { disposeSignatureSource(loaded); return; }
        setSource(loaded);
        setPage(1);
        setPdfSize(null);
        setPreviewZoom(1);
        setRenderZoom(1);
        setPlacements([]);
        setActiveKey('');
        resetResult();
      } finally {
        if (!signal.aborted) setFileLoading('');
      }
    });
  }

  function resetResult() {
    taskIds.current.sign = '';
    setResult(null);
  }

  function place(x: number, y: number, asset = currentAsset) {
    if (!pageSize || !asset || busy || operation.current || placements.length >= signatureLimits.placements) return false;
    const ratio = pageSize.width / pageSize.height * asset.height / asset.width;
    const width = Math.min(.25, .8 / ratio), height = width * ratio;
    const entry: Placement = {
      key: crypto.randomUUID(), signatureId: asset.id, asset: asset.asset, page,
      x: clamp(x - width / 2, 1 - width), y: clamp(y - height / 2, 1 - height), width, height,
    };
    setPlacements(previous => [...previous, entry]);
    setActiveKey(entry.key);
    resetResult();
    return true;
  }

  function dropAsset(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes(assetDragType)) return;
    event.preventDefault();
    const key = event.dataTransfer.getData(assetDragType);
    const availableAssets: SigningChoice[] = [...signatures, ...stamps, ...handprints];
    const asset = availableAssets.find(item => choiceKey(item) === key);
    if (!asset) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!place((event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height, asset)) return;
    event.currentTarget.focus({ preventScroll: true });
    setAssetType(asset.asset ?? 'signature');
    setSelectedAssetKey(key);
  }

  function movePlacement(key: string, x: number, y: number) {
    setPlacements(previous => previous.map(item => item.key === key
      ? { ...item, x: clamp(x, 1 - item.width), y: clamp(y, 1 - item.height) } : item));
    resetResult();
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, item: Placement) {
    event.stopPropagation();
    if (busy || event.button !== 0) return;
    event.currentTarget.focus({ preventScroll: true });
    setActiveKey(item.key);
    const bounds = stage.current?.getBoundingClientRect();
    if (!bounds) return;
    drag.current = { key: item.key, id: event.pointerId, x: (event.clientX - bounds.left) / bounds.width - item.x,
      y: (event.clientY - bounds.top) / bounds.height - item.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragPlacement(event: PointerEvent<HTMLButtonElement>) {
    const bounds = stage.current?.getBoundingClientRect();
    const current = drag.current;
    if (!bounds || current?.id !== event.pointerId) return;
    movePlacement(current.key, (event.clientX - bounds.left) / bounds.width - current.x,
      (event.clientY - bounds.top) / bounds.height - current.y);
  }

  function resizePlacement(item: Placement, width: number) {
    const ratio = item.height / item.width;
    const nextWidth = Math.min(width, 1, 1 / ratio), nextHeight = nextWidth * ratio;
    setPlacements(previous => previous.map(entry => entry.key === item.key ? {
      ...entry, width: nextWidth, height: nextHeight, x: clamp(entry.x, 1 - nextWidth), y: clamp(entry.y, 1 - nextHeight),
    } : entry));
    resetResult();
  }

  function removePlacement() {
    if (!activePlacement || busy || operation.current) return;
    setPlacements(previous => previous.filter(item => item.key !== activeKey));
    setActiveKey('');
    setNotice('');
    resetResult();
  }

  function removeSignature(id: string) {
    if (!window.confirm(t('确认删除此签名？'))) return;
    void run(async signal => {
      await signatureRequest('DELETE', signal, undefined, undefined, `/${id}`);
      signal.throwIfAborted();
      setAccess(old => old && ({ ...old, signatures: old.signatures.filter(signature => signature.id !== id) }));
      setPlacements(previous => previous.filter(entry => entry.asset !== undefined || entry.signatureId !== id));
      resetResult();
      await refresh(signal);
    });
  }

  function signDocument() {
    void run(async signal => {
      if (!source || !access) return;
      const id = taskIds.current.sign ||= crypto.randomUUID();
      const response = await signatureRequest<{ document: SignedDocument }>('POST', signal, {
        id, action: 'sign', name: source.name, kind: source.kind, placements,
        ...(source.kind === 'image' ? { width: source.width, height: source.height } : {}),
        chargeType: access.chargeType, cost: access.costs.sign,
      }, source.file);
      signal.throwIfAborted();
      setResult(response.document);
      setAccess(old => old && ({
        ...old, documents: [response.document, ...old.documents.filter(item => item.id !== response.document.id)],
      }));
      setNotice('签署文件已生成，可下载');
      notifyAccountChanged();
      await refresh(signal);
    });
  }

  function saveHandprint(handprintName: string, image: HandprintRaster, id: string) {
    void run(async signal => {
      if (!access) return;
      const response = await signatureRequest<{ signature: SavedSignature }>('POST', signal, {
        id, action: 'handprint', name: handprintName, width: image.width, height: image.height,
        chargeType: access.chargeType, cost: access.costs.handprint,
      }, new Blob([new Uint8Array(image.data)], { type: 'application/octet-stream' }));
      signal.throwIfAborted();
      setAccess(old => old && ({ ...old, handprints: [response.signature, ...(old.handprints ?? []).filter(item => item.id !== response.signature.id)] }));
      setAssetType('handprint');
      setSelectedAssetKey(signingAssetKey({ signatureId: response.signature.id, asset: 'handprint' }));
      setNotice('手印已保存，可用于签署');
      notifyAccountChanged();
      await refresh(signal);
    });
  }

  function removeHandprint(id: string) {
    if (!window.confirm(t('确认删除此手印？'))) return;
    void run(async signal => {
      await signatureRequest('DELETE', signal, undefined, undefined, `/${id}?kind=handprint`);
      signal.throwIfAborted();
      setAccess(old => old && ({ ...old, handprints: old.handprints.filter(item => item.id !== id) }));
      setPlacements(previous => previous.filter(item => item.asset !== 'handprint' || item.signatureId !== id));
      resetResult();
    });
  }

  function chooseLibrarySignature(item: SigningChoice) {
    setSelectedAssetKey(item.id);
    setAssetType('signature');
    switchMode('sign');
  }

  function syncStamp(id: string, useInDocument = false) {
    if (useInDocument) switchMode('sign');
    stampReload.current?.abort();
    const request = new AbortController();
    stampReload.current = request;
    void signatureAccess(request.signal).then(data => {
      if (request.signal.aborted) return;
      setAccess(old => old ? { ...old, stamps: data.stamps, pointsBalance: data.pointsBalance } : data);
      if (data.stamps.some(stamp => stamp.id === id)) {
        setAssetType('stamp');
        setSelectedAssetKey(signingAssetKey({ asset: 'stamp', signatureId: id }));
        if (useInDocument) setNotice('新印章已加入素材列表');
      }
    }).catch(reason => { if (!request.signal.aborted) setError(reason.message); });
  }

  const priceNote = (action: SignatureAction) => <span className="ds-cost">
    {access?.hasMembership ? t('有效套餐优先使用') : <><b>{estimate(action)}</b> {t('积分 / 次')}</>}
  </span>;
  const signIn = <a className="ds-primary" href={accountLoginHref(signaturePage)}>{t('登录后使用')}</a>;
  const aspect = pageSize ? pageSize.width / pageSize.height : .78;

  return <div className="ds-workspace">
    <aside className="ds-sidebar">
      <div className="ds-brand">
        <DocumentCheckIcon aria-hidden="true" />
        <h1>{t('文件在线签名')}</h1>
      </div>
      <nav className="ds-modes" aria-label={t('文件签名功能')}>
        {(['create', 'sign'] as const).map(action => <button type="button" key={action} aria-pressed={mode === action}
          disabled={busy} onClick={() => switchMode(action)}>
          {action === 'create' ? <PencilSquareIcon aria-hidden="true" /> : <DocumentTextIcon aria-hidden="true" />}
          <span>{t(signatureActions[action])}</span>
        </button>)}
        {stampTool && <button type="button" aria-controls="ds-stamp-maker" aria-pressed={mode === 'stamp'}
          disabled={busy} onClick={() => switchMode('stamp')}>
          <CheckBadgeIcon aria-hidden="true" /><span>{t('印章制作')}</span>
        </button>}
        <button type="button" disabled={busy} aria-controls="ds-handprint-maker" aria-pressed={mode === 'handprint'} onClick={() => switchMode('handprint')}>
          <FingerPrintIcon aria-hidden="true" /><span>{t('手印制作')}</span>
        </button>
      </nav>
      <a className="ds-return" href="/tools"><ArrowLeftIcon aria-hidden="true" />{t('工具服务')}</a>
    </aside>
    <main className="ds-main" aria-labelledby="ds-mode-title" onKeyDown={event => {
      if (event.key !== 'Delete' || event.repeat || event.defaultPrevented || event.nativeEvent.isComposing ||
        event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || mode !== 'sign' || !activePlacement || busy) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input:not([type=range]), textarea, select'))) return;
      event.preventDefault();
      removePlacement();
    }}>
      <header className="ds-toolbar" ref={toolbar}>
        <h2 id="ds-mode-title">{t(mode === 'stamp' ? '印章制作' : signatureActions[mode])}</h2>
        {access?.signedIn && <a className="ds-secondary" href={mode === 'handprint' ? '/account/activity?filter=handprint' : mode === 'stamp' ? '/account/activity?filter=stamp' : '/account/activity'}><ClockIcon aria-hidden="true" />{t('工具记录')}</a>}
      </header>
      {error && <p className="ds-feedback ds-error" role="alert">{t(error)}</p>}
      {notice && <p className="ds-feedback ds-success" role="status">{t(notice)}</p>}

      {(mode === 'create' || mode === 'sign') && <div className={`ds-layout${mode === 'sign' ? ' ds-layout-sign' : ''}`}>
        {mode === 'create' ? (
          <section className="ds-panel" aria-labelledby="ds-draw-heading">
            <div className="ds-panel-heading"><h3 id="ds-draw-heading"><PencilSquareIcon aria-hidden="true" />{t('签名画板')}</h3>
              <button className="ds-secondary" type="button" disabled={busy} onClick={() => signatureUpload.current?.click()}>
                <ArrowUpTrayIcon aria-hidden="true" />{t('上传签名图片')}
              </button>
              <input ref={signatureUpload} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event => {
                const file = event.target.files?.[0]; event.target.value = ''; if (file) importDraft(file);
              }} />
            </div>
            <div className="ds-panel-body">
              <div className="ds-form-row">
                <label>{t('签名名称')}<input value={name} maxLength={48} disabled={busy} placeholder={t('例如：我的签名')}
                  onChange={event => { setName(event.target.value); taskIds.current.create = ''; }} /></label>
                <label>{t('笔迹颜色')}<input type="color" value={ink} disabled={busy} onChange={event => setInk(event.target.value)} /></label>
              </div>
              <div className="ds-draw-surface">
                <canvas ref={penCanvas} width={840} height={300} aria-label={t('手写签名画板')}
                  onPointerDown={event => draw(event, true)} onPointerMove={event => draw(event, false)}
                  onPointerUp={() => { pen.current = null; }} onPointerCancel={() => { pen.current = null; }}
                  onLostPointerCapture={() => { pen.current = null; }} />
                {!hasInk && <span>{t('在这里手写签名')}</span>}
              </div>
              <div className="ds-panel-actions">
                <button type="button" className="ds-secondary" disabled={busy || !hasInk} onClick={clearDraft}>
                  <TrashIcon aria-hidden="true" />{t('清空画板')}
                </button>
                <div>{priceNote('create')}{access?.signedIn ? <button type="button" className="ds-primary"
                  disabled={busy || !hasInk || !name.trim() || !canRun} onClick={saveSignature}>{t(busy ? '正在处理…' : '保存签名')}</button> : signIn}</div>
              </div>
            </div>
          </section>
        ) : (
          <section className="ds-panel ds-file-panel" aria-labelledby="ds-file-heading">
            <div className="ds-panel-heading"><h3 id="ds-file-heading"><DocumentTextIcon aria-hidden="true" />{t('文件预览')}</h3>
              <button type="button" className="ds-secondary" disabled={busy} onClick={() => documentUpload.current?.click()}>
                <ArrowUpTrayIcon aria-hidden="true" />{t(source ? '更换文件' : '上传文件')}
              </button>
              <input ref={documentUpload} hidden type="file" accept={access?.wordReady === false ? '.pdf,.png,.jpg,.jpeg,.webp' : '.pdf,.docx,.png,.jpg,.jpeg,.webp'} onChange={event => {
                const file = event.target.files?.[0]; event.target.value = ''; if (file) selectFile(file);
              }} />
            </div>
            {fileLoading && <p className="ds-file-status" role="status"><ArrowPathIcon aria-hidden="true" />{t(fileLoading)}</p>}
            {access?.wordReady === false && <p className="ds-file-status">{t('当前环境暂未启用 DOCX，请先将 Word 另存为 PDF 后上传')}</p>}
            {source ? <>
              <div className="ds-page-tools"><span title={source.name}>{source.name}</span>
                {source.kind === 'pdf' ? <div>
                  <button className="ds-icon-button" type="button" aria-label={t('上一页')} disabled={busy || page <= 1}
                    onClick={() => { setPage(page - 1); setActiveKey(''); }}><ChevronLeftIcon /></button>
                  <span>{page} / {pageCount}</span>
                  <button className="ds-icon-button" type="button" aria-label={t('下一页')} disabled={busy || page >= pageCount}
                    onClick={() => { setPage(page + 1); setActiveKey(''); }}><ChevronRightIcon /></button>
                </div> : <div>{source.width} × {source.height}</div>}
              </div>
              <SignatureViewport aspect={aspect} zoom={previewZoom} onZoom={setPreviewZoom} pageRef={stage}
                  onPlace={place} onGestureStart={() => { drag.current = null; }}
                  onDragOver={event => {
                    if (busy || !pageSize || placements.length >= signatureLimits.placements || !event.dataTransfer.types.includes(assetDragType)) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'copy';
                  }}
                  onDrop={dropAsset}>
                  {source.kind === 'image' ? <img src={source.url} alt={t('文件预览')} draggable={false} />
                    : <canvas ref={preview} aria-label={t('文件预览')} style={{ visibility: pageSize ? 'visible' : 'hidden' }} />}
                  {!pageSize && <span className="ds-rendering"><ArrowPathIcon />{t('正在加载预览…')}</span>}
                  {pageSize && visiblePlacements.map(item => {
                    const asset = (item.asset === 'stamp' ? stamps : item.asset === 'handprint' ? handprints : signatures).find(saved => saved.id === item.signatureId);
                    return asset && <button type="button" key={item.key} className="ds-placement"
                      aria-label={asset.name} aria-pressed={item.key === activeKey} disabled={busy}
                      style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%`, width: `${item.width * 100}%`, height: `${item.height * 100}%` }}
                      onClick={event => { event.stopPropagation(); setActiveKey(item.key); }} onPointerDown={event => startDrag(event, item)}
                      onPointerMove={dragPlacement} onPointerUp={() => { drag.current = null; }}
                      onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
                      <img src={asset.previewUrl} alt="" draggable={false} />
                    </button>;
                  })}
              </SignatureViewport>
            </> : <button type="button" className="ds-file-empty" disabled={busy} onClick={() => documentUpload.current?.click()}>
              <DocumentTextIcon aria-hidden="true" />
              <strong>{t('选择要签署的文件')}</strong>
              <span>{t(access?.wordReady === false ? 'PDF、PNG、JPG、WebP，每个文件最多12MB' : 'PDF、DOCX、PNG、JPG、WebP，每个文件最多12MB')}</span>
            </button>}
          </section>
        )}
        {mode === 'create' ? (
          <aside className="ds-panel">
            <div className="ds-panel-heading"><h3><RectangleStackIcon aria-hidden="true" />{t('签名库')}</h3><span>{signatures.length} / {signatureLimits.savedSignatures}</span></div>
            <div className="ds-panel-body"><SigningAssetList items={signatures} busy={busy} onChoose={chooseLibrarySignature} onRemove={removeSignature} /></div>
          </aside>
        ) : (
          <aside className="ds-panel">
            <div className="ds-panel-heading"><h3><DocumentCheckIcon aria-hidden="true" />{t('签署素材')}</h3></div>
            <div className="ds-panel-body ds-placement-settings">
              <div className="ds-asset-tabs ds-signing-tabs" role="group" aria-label={t('签署素材')}>
                <button type="button" disabled={busy} aria-pressed={assetType === 'signature'} onClick={() => setAssetType('signature')}>{t('签名')}</button>
                <button type="button" disabled={busy} aria-pressed={assetType === 'stamp'} onClick={() => setAssetType('stamp')}>{t('印章')}</button>
                <button type="button" disabled={busy} aria-pressed={assetType === 'handprint'} onClick={() => setAssetType('handprint')}>{t('手印')}</button>
              </div>
              {assetType === 'stamp' && stampTool && <button type="button" className="ds-secondary" disabled={busy}
                aria-controls="ds-stamp-maker" onClick={() => switchMode('stamp')}>
                  <CheckBadgeIcon aria-hidden="true" />{t('印章制作')}
              </button>}
              {assetType === 'handprint' && <button type="button" className="ds-secondary" disabled={busy} onClick={() => switchMode('handprint')}>
                <FingerPrintIcon aria-hidden="true" />{t('手印制作')}
              </button>}
              {assetType === 'stamp' && !stamps.length ? <p className="ds-empty-copy">{t('暂无已保存的印章')}</p>
                : assetType === 'handprint' && !handprints.length ? <p className="ds-empty-copy">{t('暂无已保存的手印')}</p>
                : <SigningAssetList items={choices} busy={busy} draggable={Boolean(pageSize)} selectedKey={currentAsset && choiceKey(currentAsset)}
                onChoose={item => setSelectedAssetKey(choiceKey(item))} />}
              <p>{t('点击素材后在页面上放置，也可以直接拖入页面。')}</p>
              <button className="ds-secondary" type="button" disabled={busy || !pageSize || !currentAsset || placements.length >= signatureLimits.placements}
                onClick={() => place(.5, .5)}><PlusIcon aria-hidden="true" />{t('在页面中央放置')}</button>
              {activePlacement && <div className="ds-position">
                <label>{t(activePlacement.asset === 'handprint' ? '手印大小' : activePlacement.asset === 'stamp' ? '印章大小' : '签名大小')}<input type="range" min=".1" max="100" step=".1" disabled={busy}
                  value={activePlacement.width * 100} onChange={event => resizePlacement(activePlacement, Number(event.target.value) / 100)} /></label>
                <label>{t('横向位置')}<input type="range" min="0" max={(1 - activePlacement.width) * 100} step=".1" disabled={busy}
                  value={activePlacement.x * 100} onChange={event => movePlacement(activeKey, Number(event.target.value) / 100, activePlacement.y)} /></label>
                <label>{t('纵向位置')}<input type="range" min="0" max={(1 - activePlacement.height) * 100} step=".1" disabled={busy}
                  value={activePlacement.y * 100} onChange={event => movePlacement(activeKey, activePlacement.x, Number(event.target.value) / 100)} /></label>
                <button className="ds-secondary" type="button" disabled={busy} onClick={removePlacement} aria-keyshortcuts="Delete">
                  <TrashIcon aria-hidden="true" />{t('移除选中项')}<kbd className="ds-key">Delete</kbd>
                </button>
              </div>}
              <div className="ds-summary">
                <span>{t('已放置')} <b>{placements.length}</b></span>{priceNote('sign')}
              </div>
              <p>{t(access?.wordReady === false ? 'PDF 输出 PDF，图片输出 PNG。成品保留7天。' : 'PDF 和 DOCX 输出 PDF，图片输出 PNG。成品保留7天。')}</p>
              {access && !access.storageReady && <p className="ds-error">{t('签署文件云存储暂未配置')}</p>}
              {result ? <a className="ds-primary" href={result.downloadUrl} download><ArrowDownTrayIcon aria-hidden="true" />{t('下载签署文件')}</a>
                : access?.signedIn ? <button type="button" className="ds-primary"
                  disabled={busy || !source || !placements.length || !access.storageReady || !canRun} onClick={signDocument}>
                  <DocumentCheckIcon aria-hidden="true" />{t(busy ? '正在处理…' : '生成签署文件')}
                </button> : signIn}
            </div>
          </aside>
        )}
      </div>}

      {stampTool && <section id="ds-stamp-maker" hidden={mode !== 'stamp'} aria-labelledby="ds-mode-title">
        {stampVisited && <StampMaker tool={stampTool} onStampReady={syncStamp} />}
      </section>}

      <section id="ds-handprint-maker" hidden={mode !== 'handprint'} aria-labelledby="ds-mode-title">
        {handprintVisited && <HandprintMaker access={access} busy={busy} cost={estimate('handprint')} signIn={signIn}
          onSave={saveHandprint} onRemove={removeHandprint} onUse={item => {
            setAssetType('handprint'); setSelectedAssetKey(signingAssetKey({ signatureId: item.id, asset: 'handprint' })); switchMode('sign');
          }} />}
      </section>

      {(mode === 'create' || mode === 'sign') && Boolean(access?.documents.length) && <section className="ds-panel ds-history">
        <div className="ds-panel-heading"><h3><ClockIcon aria-hidden="true" />{t('最近签署文件')}</h3><span>{t('重复下载不扣积分')}</span></div>
        <ul>{access?.documents.map(file => <li key={file.id}>
          <div><strong>{file.name}</strong><small>{(file.bytes / 1024).toFixed(0)} KB · {t('有效期至')} {new Date(file.expiresAt).toLocaleString(locale)}</small></div>
          <a className="ds-secondary" href={file.downloadUrl} download><ArrowDownTrayIcon aria-hidden="true" />{t('下载签署文件')}</a>
        </li>)}</ul>
      </section>}
    </main>
  </div>;
}
