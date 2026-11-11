export type HandprintRaster = { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> };
export type HandprintCrop = { x: number; y: number; width: number; height: number };
export type HandprintCrack = { id: string; angle: number; length: number; width: number; x: number; y: number };
export type HandprintEffects = { edgeFade: number; cracks: HandprintCrack[] };
export type HandprintSurface = { width: number; height: number; left: number; top: number; inkWidth: number; inkHeight: number; distance: Float32Array };
export const defaultHandprintEffects: HandprintEffects = { edgeFade: 0, cracks: [] };
export const defaultHandprintCrack = { angle: 0, length: 100, width: 3, x: 50, y: 50 };
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

type Point = { x: number; y: number };
const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

// Fill the ink's convex envelope before measuring distance, so gaps between ridges
// are preserved rather than treated as outside edges of the handprint.
export function handprintSurface(image: HandprintRaster): HandprintSurface {
  const { width, height, data } = image, points: Point[] = [];
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) {
    let first = width, last = -1;
    for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] >= 8) { first = Math.min(first, x); last = x; }
    if (last < first) continue;
    points.push({ x: first, y }, { x: last, y });
    left = Math.min(left, first); right = Math.max(right, last); top = Math.min(top, y); bottom = y;
  }
  if (!points.length) throw Error('未提取到清晰手印，请调整范围或提取强度');
  points.sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Point[] = [], upper: Point[] = [];
  for (const point of points) {
    while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  for (const point of points.slice().reverse()) {
    while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)], distance = new Float32Array(width * height);
  for (let y = top; y <= bottom; y++) {
    let start = left, end = right;
    if (hull.length >= 3) {
      start = width; end = -1;
      for (let i = 0; i < hull.length; i++) {
        const a = hull[i], b = hull[(i + 1) % hull.length];
        if (y < Math.min(a.y, b.y) || y > Math.max(a.y, b.y)) continue;
        if (a.y === b.y) { start = Math.min(start, a.x, b.x); end = Math.max(end, a.x, b.x); }
        else { const x = a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y); start = Math.min(start, x); end = Math.max(end, x); }
      }
    }
    if (end >= start) distance.fill(1_000_000, y * width + Math.ceil(start - 1e-6), y * width + Math.floor(end + 1e-6) + 1);
  }
  const diagonal = Math.SQRT2;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (distance[i]) distance[i] = Math.min(distance[i], x ? distance[i - 1] + 1 : 1, y ? distance[i - width] + 1 : 1,
      x && y ? distance[i - width - 1] + diagonal : diagonal, x + 1 < width && y ? distance[i - width + 1] + diagonal : diagonal);
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x;
    if (distance[i]) distance[i] = Math.min(distance[i], x + 1 < width ? distance[i + 1] + 1 : 1, y + 1 < height ? distance[i + width] + 1 : 1,
      x + 1 < width && y + 1 < height ? distance[i + width + 1] + diagonal : diagonal, x && y + 1 < height ? distance[i + width - 1] + diagonal : diagonal);
  }
  return { width, height, left, top, inkWidth: right - left + 1, inkHeight: bottom - top + 1, distance };
}

export function applyHandprintEffects(image: HandprintRaster, effects: HandprintEffects, prepared?: HandprintSurface): HandprintRaster {
  const valid = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max;
  if (!valid(effects.edgeFade, 0, 100) || !Array.isArray(effects.cracks) || effects.cracks.length > 6 || effects.cracks.some(crack =>
    typeof crack.id !== 'string' || !crack.id.length || crack.id.length > 80 || !valid(crack.angle, -180, 180) ||
    !valid(crack.length, 1, 200) || !valid(crack.width, .5, 80) || !valid(crack.x, 0, 100) || !valid(crack.y, 0, 100))) throw Error('手印效果参数不正确');
  if (!effects.edgeFade && !effects.cracks.length) return image;
  const surface = prepared ?? handprintSurface(image), { width, height } = image;
  if (surface.width !== width || surface.height !== height) throw Error('手印效果参数不正确');
  const radius = Math.min(surface.inkWidth, surface.inkHeight) * effects.edgeFade / 100 * .45;
  const cracks = effects.cracks.map(crack => {
    const radians = crack.angle * Math.PI / 180, cosine = Math.cos(radians), sine = Math.sin(radians);
    let seed = 0; for (const char of crack.id) seed = (Math.imul(seed, 31) + char.charCodeAt(0)) >>> 0;
    return { ...crack, cosine, sine, phase: seed % 10000 / 10000 * Math.PI * 2,
      cx: surface.left + surface.inkWidth * crack.x / 100, cy: surface.top + surface.inkHeight * crack.y / 100,
      halfLength: (Math.abs(cosine) * surface.inkWidth + Math.abs(sine) * surface.inkHeight) * crack.length / 200 };
  });
  const data = new Uint8ClampedArray(image.data);
  let visible = false;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const pixel = y * width + x, offset = pixel * 4 + 3;
    let alpha = data[offset];
    if (!alpha) continue;
    if (radius) { const ratio = bound((surface.distance[pixel] - .5) / radius, 0, 1); alpha *= ratio * ratio * (3 - 2 * ratio); }
    for (const crack of cracks) {
      const dx = x + .5 - crack.cx, dy = y + .5 - crack.cy;
      const along = dx * crack.cosine + dy * crack.sine, across = -dx * crack.sine + dy * crack.cosine;
      const progress = Math.abs(along) / crack.halfLength;
      if (progress >= 1) continue;
      const wave = (Math.sin(along * .035 + crack.phase) + .35 * Math.sin(along * .083 + crack.phase * 2)) * crack.width * .22;
      const halfWidth = crack.width / 2 * Math.sqrt(1 - progress ** 8) * (.85 + .15 * Math.sin(along * .041 + crack.phase));
      alpha *= 1 - bound(halfWidth + .5 - Math.abs(across - wave), 0, 1);
    }
    data[offset] = Math.round(alpha); if (data[offset]) visible = true;
  }
  if (!visible) throw Error('当前效果使手印完全透明，请减小淡化或裂纹');
  return { width, height, data };
}
