export const previewZoomLimits = { min: .25, max: 4, step: .25 };

export function limitPreviewZoom(value: number) {
  return Math.round(Math.min(previewZoomLimits.max, Math.max(previewZoomLimits.min, value)) * 100) / 100;
}

export function fitPreviewPage(width: number, height: number, aspect: number) {
  const pageWidth = Math.max(1, Math.min(width - 40, (height - 40) * aspect));
  return { width: pageWidth, height: pageWidth / aspect };
}
