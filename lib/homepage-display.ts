export type HomepageDisplay = { mode: 'grouped' | 'flat'; sectionOrder: string[]; itemOrder: number[] };
export type HomepageItem = { id: number; name: string; category: string; product_type: string; status: string };
export type HomepageSection = { key: string; name: string };
export const defaultHomepageDisplay = (): HomepageDisplay => ({ mode: 'grouped', sectionOrder: ['tools'], itemOrder: [] });
export const categorySectionKey = (name: string) => `category:${name}`;

export function validateHomepageDisplay(value: unknown): value is HomepageDisplay {
  if (!value || typeof value !== 'object') return false;
  const config = value as HomepageDisplay;
  return ['grouped', 'flat'].includes(config.mode) && Array.isArray(config.sectionOrder) && config.sectionOrder.length <= 1000 &&
    config.sectionOrder.every(key => typeof key === 'string' && (key === 'tools' || key === 'products' || /^category:.{1,255}$/u.test(key))) &&
    new Set(config.sectionOrder).size === config.sectionOrder.length && Array.isArray(config.itemOrder) && config.itemOrder.length <= 10000 &&
    config.itemOrder.every(id => Number.isSafeInteger(id) && id > 0) && new Set(config.itemOrder).size === config.itemOrder.length;
}

export function readHomepageDisplay(json: unknown): HomepageDisplay {
  try {
    const value = typeof json === 'string' ? JSON.parse(json) : json;
    return validateHomepageDisplay(value) ? value : defaultHomepageDisplay();
  } catch { return defaultHomepageDisplay(); }
}

export function orderItems<T extends { id: number }>(items: T[], ids: number[]): T[] {
  const rank = new Map(ids.map((id, index) => [id, index]));
  return items.map((item, index) => ({ item, index })).sort((a, b) =>
    (rank.get(a.item.id) ?? ids.length) - (rank.get(b.item.id) ?? ids.length) || a.index - b.index,
  ).map(({ item }) => item);
}

export function orderSections<T extends HomepageSection>(sections: T[], keys: string[]): T[] {
  const rank = new Map(keys.map((key, index) => [key, index]));
  return sections.map((section, index) => ({ section, index })).sort((a, b) =>
    (rank.get(a.section.key) ?? keys.length) - (rank.get(b.section.key) ?? keys.length) || a.index - b.index,
  ).map(({ section }) => section);
}

export function homepageSections(categories: string[], mode: HomepageDisplay['mode']): HomepageSection[] {
  return [{ key: 'tools', name: '工具服务' }, ...(mode === 'flat' ? [{ key: 'products', name: '全部商品' }] :
    [...new Set(categories)].map(name => ({ key: categorySectionKey(name), name })))];
}

export function paginate<T>(items: T[], requestedPage: number, size: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.max(1, Math.min(Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1, totalPages));
  return { page, totalPages, items: items.slice((page - 1) * size, page * size) };
}
