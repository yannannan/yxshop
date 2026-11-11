import type { SignaturePlacement } from './signature-tool';

export function rotationComponents(angle: number) {
  const radians = angle * Math.PI / 180;
  const snap = (value: number) => Math.abs(value) < 1e-12 ? 0 : value;
  return { cosine: snap(Math.cos(radians)), sine: snap(Math.sin(radians)) };
}

export function signingBounds(placement: SignaturePlacement, aspect: number) {
  const { cosine, sine } = rotationComponents(placement.rotation ?? 0);
  const width = Math.abs(cosine) * placement.width + Math.abs(sine) * placement.height / aspect;
  const height = Math.abs(sine) * placement.width * aspect + Math.abs(cosine) * placement.height;
  return { x: placement.x + (placement.width - width) / 2, y: placement.y + (placement.height - height) / 2, width, height };
}

export function signingPositionRange(placement: SignaturePlacement, aspect: number) {
  const rotated = signingBounds(placement, aspect);
  const halfWidth = Math.max(placement.width, rotated.width) / 2;
  const halfHeight = Math.max(placement.height, rotated.height) / 2;
  return { minX: halfWidth - placement.width / 2, maxX: 1 - halfWidth - placement.width / 2,
    minY: halfHeight - placement.height / 2, maxY: 1 - halfHeight - placement.height / 2 };
}

// Keep both the placement frame and its rotated artwork inside the visible page.
export function fitSigningPlacement<T extends SignaturePlacement>(placement: T, aspect: number): T {
  const bounds = signingBounds(placement, aspect);
  const scale = Math.min(1, 1 / Math.max(placement.width, bounds.width), 1 / Math.max(placement.height, bounds.height));
  const width = placement.width * scale, height = placement.height * scale;
  const resized = { ...placement, width, height, x: placement.x + (placement.width - width) / 2,
    y: placement.y + (placement.height - height) / 2 };
  const range = signingPositionRange(resized, aspect);
  return { ...resized, x: Math.max(range.minX, Math.min(range.maxX, resized.x)),
    y: Math.max(range.minY, Math.min(range.maxY, resized.y)) };
}
