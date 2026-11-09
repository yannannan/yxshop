/// <reference types="vite/client" />
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { readUploadedImage } from './image-tool-client';
import { signatureLimits, type SignatureAccess } from './signature-tool';

export const signatureApi = '/api/tools/document-signature';
export const signaturePage = '/tools/document-signature.html';

type SourceImage = { kind: 'image'; name: string; file: Blob; url: string; width: number; height: number };
type SourcePdf = { kind: 'pdf'; name: string; file: Blob; pdf: PDFDocumentProxy; close: () => Promise<void> };
export type SignatureSource = SourceImage | SourcePdf;

export async function signatureRequest<T>(method: string, signal: AbortSignal, data?: object, file?: Blob, suffix = '') {
  let body: FormData | undefined;
  if (data && file) {
    body = new FormData();
    body.set('metadata', JSON.stringify(data));
    body.set('file', file, 'document');
  }
  const response = await fetch(signatureApi + suffix, { method, cache: 'no-store', signal, body });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string } | null;
    throw Error(error?.message || '文件签名暂不可用，可重试同一任务');
  }
  return (data && 'action' in data && data.action === 'word-preview' ? response.blob() : response.json()) as Promise<T>;
}

export function signatureAccess(signal: AbortSignal) {
  return signatureRequest<SignatureAccess>('GET', signal);
}

export function disposeSignatureSource(source: SignatureSource) {
  if (source.kind === 'image') URL.revokeObjectURL(source.url);
  else void source.close().catch(() => undefined);
}

export async function loadSignatureSource(file: File, wordReady: boolean | undefined, signal: AbortSignal): Promise<SignatureSource> {
  if (!file.size || file.size > signatureLimits.fileBytes) throw Error('上传文件不得超过12MB');
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp'].includes(extension || '')) {
    const image = await readUploadedImage(file);
    return { kind: 'image', name: file.name, file: image.pixels, url: image.url, width: image.width, height: image.height };
  }
  if (extension !== 'pdf' && extension !== 'docx') throw Error('请选择 PDF、DOCX 或图片');
  if (extension === 'docx' && wordReady === false) throw Error('当前环境暂未启用 DOCX，请先将 Word 另存为 PDF 后上传');
  const input = extension === 'docx'
    ? await signatureRequest<Blob>('POST', signal, { action: 'word-preview' }, file)
    : file;
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  const data = new Uint8Array(await input.arrayBuffer());
  signal.throwIfAborted();
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const assets = `${location.origin}${signatureApi}/assets/`;
  const loading = pdfjs.getDocument({
    data,
    cMapUrl: assets + 'cmaps/', cMapPacked: true,
    standardFontDataUrl: assets + 'standard_fonts/', wasmUrl: assets + 'wasm/', iccUrl: assets + 'iccs/',
    maxImageSize: 25_000_000,
  });
  const abort = () => void loading.destroy().catch(() => undefined);
  signal.addEventListener('abort', abort, { once: true });
  try {
    const pdf = await loading.promise;
    if (!pdf.numPages || pdf.numPages > signatureLimits.pages) throw Error('最多支持100页文档');
    return { kind: 'pdf', name: file.name, file: input, pdf, close: () => loading.destroy() };
  } catch (error) {
    await loading.destroy().catch(() => undefined);
    if ((error as Error).message === '最多支持100页文档') throw error;
    throw Error('无法读取 PDF，请确认文件完整且未加密');
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
