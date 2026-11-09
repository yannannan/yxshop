import { degrees, PDFDocument, type PDFPage } from 'pdf-lib';
import { PNG } from 'pngjs';
import { encodePng } from './raster-codec';
import type { RasterImage } from './image-tool';
import { SignatureError, signatureLimits, type SignaturePlacement } from './signature-tool';

export function readSignatureRaster(bytes: Uint8Array, width: unknown, height: unknown, maxPixels: number): RasterImage {
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isInteger(width) || !Number.isInteger(height) ||
    width < 1 || height < 1 || width > 4000 || height > 4000 || width * height > maxPixels ||
    bytes.length !== width * height * 4) {
    throw new SignatureError('图片尺寸或像素数据不正确');
  }
  return { data: bytes, width, height };
}

export function trimSignature(image: RasterImage) {
  let left = image.width, right = -1, top = image.height, bottom = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (!image.data[(y * image.width + x) * 4 + 3]) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left) throw new SignatureError('请先写下签名或上传签名图片');
  const width = right - left + 1, height = bottom - top + 1;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const offset = ((y + top) * image.width + left) * 4;
    data.set(image.data.subarray(offset, offset + width * 4), y * width * 4);
  }
  return { width, height, png: encodePng({ data, width, height }) };
}

export function signImage(image: RasterImage, placements: SignaturePlacement[], signatures: Map<string, Buffer>) {
  const decoded = new Map([...signatures].map(([id, png]) => [id, PNG.sync.read(png)]));
  for (const placement of placements) {
    if (placement.page !== 1) throw new SignatureError('签名位置超出页面范围');
    const signature = decoded.get(placement.signatureId)!;
    const left = Math.floor(placement.x * image.width);
    const top = Math.floor(placement.y * image.height);
    const width = Math.min(image.width - left, Math.max(1, Math.round(placement.width * image.width)));
    const height = Math.min(image.height - top, Math.max(1, Math.round(placement.height * image.height)));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const source = (Math.floor(y * signature.height / height) * signature.width + Math.floor(x * signature.width / width)) * 4;
        const target = ((top + y) * image.width + left + x) * 4;
        const foreground = signature.data[source + 3] / 255;
        const background = image.data[target + 3] / 255 * (1 - foreground);
        const alpha = foreground + background;
        if (!alpha) continue;
        for (let channel = 0; channel < 3; channel++) {
          image.data[target + channel] = Math.round((signature.data[source + channel] * foreground +
            image.data[target + channel] * background) / alpha);
        }
        image.data[target + 3] = Math.round(alpha * 255);
      }
    }
  }
  return encodePng(image);
}

export function pdfSignaturePosition(page: PDFPage, placement: SignaturePlacement) {
  const media = page.getMediaBox(), crop = page.getCropBox();
  const cropX = Math.max(media.x, crop.x), cropY = Math.max(media.y, crop.y);
  const cropWidth = Math.min(media.x + media.width, crop.x + crop.width) - cropX;
  const cropHeight = Math.min(media.y + media.height, crop.y + crop.height) - cropY;
  if (![cropX, cropY, cropWidth, cropHeight].every(Number.isFinite) || cropWidth <= 0 || cropHeight <= 0) {
    throw new SignatureError('PDF 页面尺寸不正确');
  }
  const { x, y, width, height } = placement;
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  // PDF.js 按旋转后的可见区域以左上为原点，PDF 绘图使用未旋转的左下坐标。
  switch (rotation) {
    case 0: return { x: cropX + x * cropWidth, y: cropY + (1 - y - height) * cropHeight, width: width * cropWidth, height: height * cropHeight, rotate: degrees(0) };
    case 90: return { x: cropX + (y + height) * cropWidth, y: cropY + x * cropHeight, width: width * cropHeight, height: height * cropWidth, rotate: degrees(90) };
    case 180: return { x: cropX + (1 - x) * cropWidth, y: cropY + (y + height) * cropHeight, width: width * cropWidth, height: height * cropHeight, rotate: degrees(180) };
    case 270: return { x: cropX + (1 - y - height) * cropWidth, y: cropY + (1 - x) * cropHeight, width: width * cropHeight, height: height * cropWidth, rotate: degrees(270) };
    default: throw new SignatureError('PDF 页面旋转角度不受支持');
  }
}

export async function signPdf(bytes: Uint8Array, placements: SignaturePlacement[], signatures: Map<string, Buffer>) {
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(bytes, { throwOnInvalidObject: true, updateMetadata: false });
  } catch {
    throw new SignatureError('无法读取 PDF，请确认文件完整且未加密');
  }
  const pages = pdf.getPages();
  if (!pages.length || pages.length > signatureLimits.pages) throw new SignatureError('最多支持100页文档');
  const images = new Map(await Promise.all([...signatures].map(async ([id, png]) => [id, await pdf.embedPng(png)] as const)));
  for (const placement of placements) {
    const page = pages[placement.page - 1];
    if (!page) throw new SignatureError('签名位置超出页面范围');
    page.drawImage(images.get(placement.signatureId)!, pdfSignaturePosition(page, placement));
  }
  return Buffer.from(await pdf.save({ updateFieldAppearances: false }));
}
