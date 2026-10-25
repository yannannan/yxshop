"use client";

import { useI18n } from '@/components/language-provider';
export function CatalogPagination({ page, totalPages, onChange, href, label = '列表分页' }: { page: number; totalPages: number; onChange?: (page: number) => void; href?: string; label?: string }) {
  const { t } = useI18n();
  if (totalPages <= 1) return null;
  const control = (next: number, text: string, disabled: boolean) => {
    if (onChange) return <button type="button" disabled={disabled} onClick={() => onChange(next)}>{t(text)}</button>;
    if (disabled || !href) return <span className="pagination-disabled" aria-disabled="true">{t(text)}</span>;
    return <a href={`${href}${href.includes('?') ? '&' : '?'}page=${next}`}>{t(text)}</a>;
  };
  return <nav className="catalog-pagination" aria-label={t(label)}>{t(control(page - 1, '上一页', page <= 1))}<span aria-live="polite">{t("第 ")}{t(page)} / {t(totalPages)}{t(" 页")}</span>{t(control(page + 1, '下一页', page >= totalPages))}</nav>;
}
