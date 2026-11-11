'use client';
/* eslint-disable @next/next/no-img-element -- Private handprint previews use native images. */
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { ArrowDownTrayIcon, ArrowPathIcon, ArrowUpTrayIcon, CameraIcon, FingerPrintIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useI18n } from './language-provider';
import { extractHandprint, fullHandprintCrop, randomHandprint, type HandprintRaster } from '../lib/handprint-raster';
import type { SavedSignature, SignatureAccess } from '../lib/signature-tool';

export function HandprintMaker({ access, busy, cost, onSave, onRemove, onUse, signIn }: {
  access: SignatureAccess | null; busy: boolean; cost: number; signIn: React.ReactNode;
  onSave: (name: string, image: HandprintRaster, id: string) => void;
  onRemove: (id: string) => void; onUse: (item: SavedSignature) => void;
}) {
  const { t, locale } = useI18n();
  const [mode, setMode] = useState<'upload' | 'random'>('upload');
  const [name, setName] = useState('');
  const [color, setColor] = useState('#c93430');
  const [strength, setStrength] = useState(60);
  const [method, setMethod] = useState<'red' | 'dark'>('red');
  const [source, setSource] = useState<HandprintRaster | null>(null);
  const [crop, setCrop] = useState(fullHandprintCrop);
  const [seed, setSeed] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const upload = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const photo = useRef<HTMLCanvasElement>(null), preview = useRef<HTMLCanvasElement>(null);
  const selection = useRef<{ id: number; x: number; y: number } | null>(null);
  const request = useRef(0), task = useRef('');
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => { task.current = ''; }, [mode, source, crop, color, strength, method, seed, name]);
  const output = useMemo(() => {
    try {
      return { image: mode === 'random' ? randomHandprint(seed, color, strength) : source ? extractHandprint(source, crop, color, strength, method) : null, error: '' };
    } catch (reason) { return { image: null, error: (reason as Error).message }; }
  }, [mode, source, crop, color, strength, method, seed]);
  useEffect(() => {
    if (mode === 'upload' && source) photo.current?.getContext('2d')?.putImageData(new ImageData(source.data, source.width, source.height), 0, 0);
  }, [mode, source]);
  useEffect(() => {
    const canvas = preview.current;
    if (!canvas || !output.image) return;
    canvas.getContext('2d')?.putImageData(new ImageData(output.image.data, output.image.width, output.image.height), 0, 0);
  }, [output]);

  async function readPhoto(file: File) {
    if (busy || loading) return;
    const id = ++request.current;
    setLoading(true); setError('');
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) throw Error('请上传12MB以内的 PNG、JPG 或 WebP');
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      try {
        if (bitmap.width * bitmap.height > 40_000_000) throw Error('原图尺寸过大，请先缩小图片');
        const scale = Math.min(1, Math.sqrt(400_000 / (bitmap.width * bitmap.height)), 4000 / bitmap.width, 4000 / bitmap.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(bitmap.width * scale)); canvas.height = Math.max(1, Math.floor(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw Error('浏览器暂不支持图片处理');
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        if (request.current !== id) return;
        setSource({ width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data });
        setCrop(fullHandprintCrop); setMode('upload');
        if (!name.trim()) setName(file.name.replace(/\.[^.]+$/, '').slice(0, 48));
      } finally { bitmap.close(); }
    } catch (reason) { if (request.current === id) setError((reason as Error).message); }
    finally { if (request.current === id) setLoading(false); }
  }
  function select(event: PointerEvent<HTMLDivElement>, start: boolean) {
    if (busy || loading || (start ? event.button !== 0 : selection.current?.id !== event.pointerId)) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
    const y = Math.max(0, Math.min(1, (event.clientY - box.top) / box.height));
    if (start) { selection.current = { id: event.pointerId, x, y }; event.currentTarget.setPointerCapture(event.pointerId); }
    else if (selection.current) {
      const origin = selection.current;
      if (Math.abs(x - origin.x) < .01 || Math.abs(y - origin.y) < .01) return;
      setCrop({ x: Math.min(x, origin.x), y: Math.min(y, origin.y), width: Math.abs(x - origin.x), height: Math.abs(y - origin.y) });
    }
  }
  const library = access?.handprints ?? [];
  return <div className="ds-layout hp-layout">
    <section className="ds-panel">
      <div className="ds-panel-heading"><h3><FingerPrintIcon aria-hidden="true" />{t('手印制作')}</h3><span>{t(mode === 'random' ? '随机图案' : '照片提取')}</span></div>
      <div className="ds-panel-body">
        <div className="ds-asset-tabs hp-methods" role="group" aria-label={t('手印制作方式')}>
          <button type="button" disabled={busy || loading} aria-pressed={mode === 'upload'} onClick={() => { setMode('upload'); setError(''); }}>{t('上传提取')}</button>
          <button type="button" disabled={busy || loading} aria-pressed={mode === 'random'} onClick={() => { setMode('random'); setError(''); setSeed(crypto.getRandomValues(new Uint32Array(1))[0]); }}>{t('随机生成')}</button>
        </div>
        <div className="ds-form-row hp-fields">
          <label>{t('手印名称')}<input value={name} maxLength={48} disabled={busy || loading} onChange={event => setName(event.target.value)} placeholder={t('例如：我的手印')} /></label>
          <label>{t('手印颜色')}<input type="color" value={color} disabled={busy || loading} onChange={event => setColor(event.target.value)} /></label>
        </div>
        {mode === 'upload' ? <>
          <div className="hp-upload-actions">
            <button type="button" className="ds-secondary" disabled={busy || loading} onClick={() => upload.current?.click()}><ArrowUpTrayIcon aria-hidden="true" />{t('上传手印图片')}</button>
            <button type="button" className="ds-secondary" disabled={busy || loading} onClick={() => camera.current?.click()}><CameraIcon aria-hidden="true" />{t('拍照提取')}</button>
            {source && <button type="button" className="ds-secondary" disabled={busy || loading} onClick={() => setCrop(fullHandprintCrop)}>{t('使用整张图片')}</button>}
          </div>
          <input ref={upload} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void readPhoto(file); }} />
          <input ref={camera} hidden type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void readPhoto(file); }} />
          <p className="hp-hint">{t('请上传清晰的手印或指印照片，框选需要保留的区域。')}</p>
        </> : <div className="hp-upload-actions"><button className="ds-secondary" type="button" disabled={busy} onClick={() => setSeed(crypto.getRandomValues(new Uint32Array(1))[0])}><ArrowPathIcon aria-hidden="true" />{t('换一个图案')}</button><span className="hp-hint">{t('随机生成装饰性指印图案。')}</span></div>}
        {loading && <p role="status" className="hp-hint">{t('正在读取文件…')}</p>}
        {(error || output.error) && <p role="alert" className="ds-feedback ds-error">{t(error || output.error)}</p>}
        <div className={`hp-preview-grid${mode === 'random' ? ' hp-random' : ''}`}>
          {mode === 'upload' && <section><h4>{t('原照片')}</h4><div className="hp-preview">
            {source ? <div className="hp-photo" style={{ aspectRatio: source.width / source.height, width: `min(100%, ${300 * source.width / source.height}px)` }}
              onPointerDown={event => select(event, true)} onPointerMove={event => select(event, false)}
              onPointerUp={() => { selection.current = null; }} onPointerCancel={() => { selection.current = null; }} onLostPointerCapture={() => { selection.current = null; }}>
              <canvas ref={photo} width={source.width} height={source.height} aria-label={t('框选手印区域')} />
              <span className="hp-crop" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }} />
            </div> : <span>{t('上传图片或拍照开始提取')}</span>}
          </div></section>}
          <section><h4>{t('手印预览')}</h4><div className="hp-preview hp-transparent">
            {output.image ? <canvas ref={preview} width={output.image.width} height={output.image.height} aria-label={t('手印预览')} /> : <span>{t('处理后的手印将在这里展示')}</span>}
          </div></section>
        </div>
        <div className="hp-controls">
          {mode === 'upload' && <label>{t('提取方式')}<select value={method} disabled={busy} onChange={event => setMethod(event.target.value as 'red' | 'dark')}><option value="red">{t('红色印迹')}</option><option value="dark">{t('深色笔迹')}</option></select></label>}
          <label>{t(mode === 'random' ? '图案浓度' : '提取强度')}<input type="range" min="1" max="100" value={strength} disabled={busy} onChange={event => setStrength(Number(event.target.value))} /></label>
        </div>
        {access?.handprintReady === false && <p className="ds-feedback ds-error">{t('请管理员先执行14号手印制作增量SQL')}</p>}
        <div className="ds-panel-actions"><span className="ds-cost">{t('透明底 PNG，保存后可重复使用。')}</span><div><span className="ds-cost">{access?.hasMembership ? t('有效套餐优先使用') : <><b>{cost}</b> {t('积分 / 次')}</>}</span>
          {access?.signedIn ? <button type="button" className="ds-primary" disabled={busy || loading || !output.image || !name.trim() || !access.canProcess || access.handprintReady === false}
            onClick={() => { if (output.image) onSave(name, output.image, task.current ||= crypto.randomUUID()); }}>{t(busy ? '正在处理…' : '保存手印')}</button> : signIn}
        </div></div>
      </div>
    </section>
    <aside className="ds-panel"><div className="ds-panel-heading"><h3>{t('手印制作记录')}</h3><span>{library.length} / 30</span></div><div className="ds-panel-body">
      {!library.length ? <p className="ds-empty-copy">{t('暂无已保存的手印')}</p> : <ul className="hp-records">{library.map(item => <li key={item.id}>
        <div className="hp-record-title"><img src={item.previewUrl} alt="" loading="lazy" /><div><strong>{item.name}</strong>{item.createdAt && <small>{new Date(item.createdAt).toLocaleString(locale)}</small>}</div></div>
        <div className="hp-record-actions"><button type="button" className="ds-secondary" disabled={busy} onClick={() => onUse(item)}>{t('用于签署')}</button>
          <a className="ds-secondary" href={item.previewUrl} download={`handprint-${item.id}.png`}><ArrowDownTrayIcon aria-hidden="true" />{t('下载')}</a>
          <button type="button" className="ds-icon-button" disabled={busy} aria-label={t('删除手印')} onClick={() => onRemove(item.id)}><TrashIcon aria-hidden="true" /></button></div>
      </li>)}</ul>}
    </div></aside>
  </div>;
}
