// Existing business tests exercise the default Chinese UI. The actual locale
// provider, persistence, English rendering and isolation have separate tests.
import { buildPageMetadata, buildToolMetadata } from '../../lib/page-seo.ts';

export function i18nMock(name) {
  if (name === '@/components/language-provider') return { useI18n: () => ({ locale: 'zh-CN', t: value => value }) };
  if (name === '@/lib/i18n-server') return { getI18n: async () => ({ locale: 'zh-CN', t: value => value }), localizeMetadata: async value => value };
  if (name === '@/lib/page-seo-server') return { getPageMetadata: async (page, options) => buildPageMetadata(page, options), getToolMetadata: async tool => buildToolMetadata(tool) };
  if (name === '@/lib/page-seo') return { buildPageMetadata, buildToolMetadata };
  if (name === './language-switcher') return { LanguageSwitcher: () => null };
}
