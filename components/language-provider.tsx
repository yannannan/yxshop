'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { translator, type Locale } from '../lib/i18n';

const LanguageContext = createContext<Locale>('zh-CN');
export function LanguageProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LanguageContext.Provider value={locale}>{children}</LanguageContext.Provider>;
}
export function useI18n() {
  const locale = useContext(LanguageContext);
  return useMemo(() => ({ locale, t: translator(locale) }), [locale]);
}
