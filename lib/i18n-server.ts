import { cookies } from 'next/headers';
import { localeCookie, parseLocale, translator } from './i18n';

export async function getI18n() {
  const locale = parseLocale((await cookies()).get(localeCookie)?.value);
  return { locale, t: translator(locale) };
}

export async function localizeMetadata<T>(metadata: T): Promise<T> {
  const { t } = await getI18n();
  function visit(value: unknown): unknown {
    if (typeof value === 'string') return t(value);
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, visit(entry)]));
    return value;
  }
  return visit(metadata) as T;
}
