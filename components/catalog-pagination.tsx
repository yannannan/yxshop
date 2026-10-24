export function CatalogPagination({ page, totalPages, onChange, href, label = '列表分页' }: { page: number; totalPages: number; onChange?: (page: number) => void; href?: string; label?: string }) {
  if (totalPages <= 1) return null;
  const control = (next: number, text: string, disabled: boolean) => {
    if (onChange) return <button type="button" disabled={disabled} onClick={() => onChange(next)}>{text}</button>;
    if (disabled || !href) return <span className="pagination-disabled" aria-disabled="true">{text}</span>;
    return <a href={`${href}${href.includes('?') ? '&' : '?'}page=${next}`}>{text}</a>;
  };
  return <nav className="catalog-pagination" aria-label={label}>{control(page - 1, '上一页', page <= 1)}<span aria-live="polite">第 {page} / {totalPages} 页</span>{control(page + 1, '下一页', page >= totalPages)}</nav>;
}
