import { getPageMetadata } from '@/lib/page-seo-server';

import { getI18n } from '@/lib/i18n-server';
import Link from 'next/link';
import { StorefrontHeader } from '@/components/storefront-header';
import { getPublishedProducts, getPublishedCategories } from '@/lib/product-data';
import { getHomepageDisplay } from '@/lib/homepage-display-data';
import { orderItems, paginate } from '@/lib/homepage-display';
import { StoreProductCard } from '@/components/store-product-card';
import { CatalogPagination } from '@/components/catalog-pagination';
import { matchesProductCategory } from '@/lib/categories';

export const dynamic = 'force-dynamic';

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ category?: string; secondary?: string; third?: string; q?: string; page?: string }> }) {
  const { t } = await getI18n();
  const [products, categories, config, params] = await Promise.all([getPublishedProducts(), getPublishedCategories(), getHomepageDisplay(), searchParams]);
  const category = params.category || '', query = (params.q || '').trim();
  const secondary = params.secondary || '全部', third = params.third || '全部';
  const filtered = orderItems(products, config.itemOrder).filter(item => matchesProductCategory(item, categories, category || '全部商品', secondary, third) && `${item.name}${item.desc}`.toLowerCase().includes(query.toLowerCase()));
  const result = paginate(filtered, Number(params.page || 1), 12);
  const base = new URLSearchParams();
  if (category) base.set('category', category);
  if (secondary !== '全部') base.set('secondary', secondary);
  if (third !== '全部') base.set('third', third);
  if (query) base.set('q', query);
  return <><StorefrontHeader /><main className="product-directory-page"><div className="product-directory-heading"><div><h1>{t(third !== '全部' ? third : secondary !== '全部' ? secondary : category || '全部商品')}</h1><p>{t("共 ")}{t(filtered.length)}{t(" 件商品 · 每页 12 件")}</p></div><Link className="catalog-more-link" href="/products">{t("全部商品 →")}</Link></div><form className="product-directory-search" action="/products">{category && <input type="hidden" name="category" value={category} />}{secondary !== '全部' && <input type="hidden" name="secondary" value={secondary} />}{third !== '全部' && <input type="hidden" name="third" value={third} />}<input name="q" defaultValue={query} placeholder={t("搜索商品")} aria-label={t("搜索商品")} /><button type="submit">{t("搜索")}</button></form><div className="product-grid refined-grid homepage-product-grid">{result.items.map(product => <StoreProductCard key={product.id} product={product} />)}</div>{!filtered.length && <p className="tool-directory-empty">{t("暂无匹配商品。")}</p>}<CatalogPagination page={result.page} totalPages={result.totalPages} href={`/products${base.size ? `?${base}` : ''}`} label={t("商品目录分页")} /></main></>;
}

export async function generateMetadata() { return getPageMetadata('products'); }
