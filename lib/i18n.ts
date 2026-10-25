import { english } from './i18n-en';

export type Locale = 'zh-CN' | 'en';
export const localeCookie = 'yxshop_locale';
export function parseLocale(value: unknown): Locale { return value === 'en' ? 'en' : 'zh-CN'; }
export type Translator = <T>(value: T) => T;

const patterns = Object.entries(english).filter(([key]) => /\{\d+\}/.test(key) && /[\u3400-\u9fff]/u.test(key)).sort(([left], [right]) => right.replace(/\{\d+\}/g, '').length - left.replace(/\{\d+\}/g, '').length).map(([key, translated]) => {
  const slots: string[] = [];
  const source = key.split(/(\{\d+\})/).map(part => {
    if (/^\{\d+\}$/.test(part)) { slots.push(part); return '([\\s\\S]*?)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return { expression: new RegExp(`^${source}$`), slots, translated };
});

// Translate interface copy only. Values, identifiers, user content and requests
// remain in their original form; callers select the displayed labels explicitly.
export function translate<T>(value: T, locale: Locale): T {
  if (locale !== 'en' || typeof value !== 'string' || !/[\u3400-\u9fff]/u.test(value)) return value;
  const trimmed = value.trim();
  let result = english[trimmed];
  const price = /^([¥￥]?[\d,.]+)(\/(?:次|天|周|月|年))(\s*起)?$/.exec(trimmed);
  if (!result && price) result = `${price[1]}${english[price[2]]}${price[3] ? ' and up' : ''}`;
  if (!result) {
    for (const pattern of patterns) {
      const match = pattern.expression.exec(trimmed);
      if (!match) continue;
      result = pattern.translated.replace(/\{\d+\}/g, slot => {
        const index = pattern.slots.indexOf(slot);
        return index < 0 ? slot : translate(match[index + 1], locale);
      });
      break;
    }
  }
  return (result ? value.replace(trimmed, () => result) : value) as T;
}
export function translator(locale: Locale): Translator { return value => translate(value, locale); }
