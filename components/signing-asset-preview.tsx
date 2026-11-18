'use client';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from './language-provider';
import { applySigningEffects, signingEffectSurface, type SigningEffects } from '../lib/signature-effects';
import { signatureLimits } from '../lib/signature-tool';
import type { RasterImage } from '../lib/image-tool';

export function SigningAssetPreview({ src, asset, opacity, edgeFade }: SigningEffects & { src: string; asset?: 'stamp' | 'handprint' }) {
  const { t } = useI18n();
  // Use the same stamp pixels as export; library thumbnails stay lightweight.
  const url = asset === 'stamp' ? `${src}&quality=signing` : src;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState<{ url: string; image: RasterImage } | null>(null);
  const [failed, setFailed] = useState('');
  const prepared = useRef<{ image: RasterImage; surface: ReturnType<typeof signingEffectSurface> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      try {
        const width = image.naturalWidth, height = image.naturalHeight;
        if (!width || !height || width * height > signatureLimits.signaturePixels) throw Error('Invalid asset');
        const buffer = document.createElement('canvas'); buffer.width = width; buffer.height = height;
        const context = buffer.getContext('2d', { willReadFrequently: true });
        if (!context) throw Error('Canvas unavailable');
        context.drawImage(image, 0, 0);
        setLoaded({ url, image: { width, height, data: new Uint8Array(context.getImageData(0, 0, width, height).data) } });
      } catch { setFailed(url); }
    };
    image.onerror = () => { if (!cancelled) setFailed(url); };
    image.src = url;
    return () => { cancelled = true; image.onload = null; image.onerror = null; image.src = ''; };
  }, [url]);

  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    if (!loaded || loaded.url !== url) { target.width = 0; target.height = 0; return; }
    const { image } = loaded;
    if (edgeFade && prepared.current?.image !== image) prepared.current = { image, surface: signingEffectSurface(image) };
    const raster = applySigningEffects(image, { opacity, edgeFade }, prepared.current?.image === image ? prepared.current.surface : undefined);
    target.width = raster.width; target.height = raster.height;
    const context = target.getContext('2d');
    if (!context) return;
    const pixels = context.createImageData(raster.width, raster.height); pixels.data.set(raster.data);
    context.putImageData(pixels, 0, 0);
  }, [loaded, url, opacity, edgeFade]);

  return <><canvas ref={canvas} aria-hidden="true" />{failed === url && loaded?.url !== url && <span className="ds-asset-preview-error" role="status">{t('素材预览加载失败，请重新选择')}</span>}</>;
}
