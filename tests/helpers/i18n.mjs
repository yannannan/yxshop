// Existing business tests exercise the default Chinese UI. The actual locale
// provider, persistence, English rendering and isolation have separate tests.
export function i18nMock(name) {
  if (name === '@/components/language-provider') return { useI18n: () => ({ locale: 'zh-CN', t: value => value }) };
  if (name === '@/lib/i18n-server') return { getI18n: async () => ({ locale: 'zh-CN', t: value => value }), localizeMetadata: async value => value };
  if (name === './language-switcher') return { LanguageSwitcher: () => null };
}
