export type HandprintRaster = { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> };
export type HandprintCrop = { x: number; y: number; width: number; height: number };
export const fullHandprintCrop: HandprintCrop = { x: 0, y: 0, width: 1, height: 1 };
const bound = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
function rgb(color: string) {
  if (!/^#[a-f\d]{6}$/i.test(color)) throw Error('手印颜色不正确');
  return [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
}

export function extractHandprint(source: HandprintRaster, crop: HandprintCrop, color: string, strength: number, method: 'dark' | 'red'): HandprintRaster {
  const left = bound(Math.floor(crop.x * source.width), 0, source.width - 1);
  const top = bound(Math.floor(crop.y * source.height), 0, source.height - 1);
  const width = bound(Math.round(crop.width * source.width), 1, source.width - left);
  const height = bound(Math.round(crop.height * source.height), 1, source.height - top);
  const data = new Uint8ClampedArray(width * height * 4), ink = rgb(color);
  const threshold = 150 - bound(strength, 1, 100) * 1.25;
  let visible = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const input = ((top + y) * source.width + left + x) * 4, output = (y * width + x) * 4;
    const r = source.data[input], g = source.data[input + 1], b = source.data[input + 2], a = source.data[input + 3];
    const score = method === 'red' ? Math.max(0, r - Math.max(g, b)) : 255 - (.2126 * r + .7152 * g + .0722 * b);
    const alpha = Math.round(bound((score - threshold) / 38, 0, 1) * a);
    data[output] = ink[0]; data[output + 1] = ink[1]; data[output + 2] = ink[2]; data[output + 3] = alpha;
    if (alpha > 20) visible++;
  }
  if (visible < Math.min(20, width * height * .01)) throw Error('未提取到清晰手印，请调整范围或提取强度');
  return { width, height, data };
}

// A decorative, seeded ridge pattern; it is not derived from a person's biometric data.
export function randomHandprint(seed: number, color: string, strength: number): HandprintRaster {
  const width = 360, height = 480, ink = rgb(color), data = new Uint8ClampedArray(width * height * 4);
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const phase = random() * 6.28, bend = .08 + random() * .18, frequency = 110 + random() * 30;
  const rotation = (random() - .5) * .25, cosine = Math.cos(rotation), sine = Math.sin(rotation);
  const opacity = .45 + bound(strength, 1, 100) / 180;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const nx = (x - width / 2) / (width * .44), ny = (y - height / 2) / (height * .44);
    const px = nx * cosine - ny * sine, py = nx * sine + ny * cosine;
    const edge = bound((1 - px * px - py * py) * 24, 0, 1);
    if (!edge) continue;
    const cx = px + bend * Math.sin(py * 3 + phase), cy = py + .18;
    const radius = Math.sqrt(cx * cx + cy * cy * .75);
    const ridge = Math.cos(radius * frequency + Math.sin(py * 5 + phase) * .7 + .2 * Math.atan2(cy, cx));
    const alpha = bound((ridge - .05) * 2.4, 0, 1) * edge * opacity * (1 - random() * .22);
    const offset = (y * width + x) * 4;
    data[offset] = ink[0]; data[offset + 1] = ink[1]; data[offset + 2] = ink[2]; data[offset + 3] = Math.round(alpha * 255);
  }
  return { width, height, data };
}
