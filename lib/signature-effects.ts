import { handprintSurface, type HandprintSurface } from './handprint-raster';
import type { RasterImage } from './image-tool';
import type { SignaturePlacement } from './signature-tool';

export type SigningEffects = Pick<SignaturePlacement, 'opacity' | 'edgeFade'>;

// Measure the outside ink envelope, keeping holes and spaces between strokes.
// Empty or almost transparent saved stamps remain valid, including at 0% opacity.
export function signingEffectSurface(image: RasterImage): HandprintSurface | null {
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i] >= 8) return handprintSurface(image);
  return null;
}

export function applySigningEffects(image: RasterImage, effects: SigningEffects, prepared?: HandprintSurface | null): RasterImage {
  const opacity = effects.opacity ?? 100, fade = effects.edgeFade ?? 0;
  if (opacity === 100 && fade === 0) return image;
  const surface = fade ? prepared === undefined ? signingEffectSurface(image) : prepared : null;
  const radius = surface ? Math.min(surface.inkWidth, surface.inkHeight) * fade / 100 * .45 : 0;
  const data = new Uint8Array(image.data);
  for (let i = 3; i < data.length; i += 4) {
    let alpha = image.data[i] * opacity / 100;
    if (radius && surface) {
      const ratio = Math.max(0, Math.min(1, (surface.distance[(i - 3) / 4] - .5) / radius));
      const softness = ratio * ratio * (3 - 2 * ratio);
      alpha *= 1 - fade / 100 * (1 - softness);
    }
    data[i] = Math.round(alpha);
  }
  return { ...image, data };
}
