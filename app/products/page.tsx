import type { Metadata } from 'next';
import Link from 'next/link';
import { StorefrontHeader } from '@/components/storefront-header';
import { getPublishedProducts, getPublishedCategories } from '@/lib/product-data';
import { getHomepageDisplay } from '@/lib/homepage-display-data';
import { orderItems, paginate } from '@/lib/homepage-display';
import { StoreProductCard } from '@/components/store-product-card';
import { CatalogPagination } from '@/components/catalog-pagination';
import { matchesProductCategory } from '@/lib/categories';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '商品目录｜宇星商城', description: '浏览宇星商城的会员、账号及数字服务，按类型查找所需商品。' };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ category?: string; secondary?: string; third?: string; q?: string; page?: string }> }) {
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
  return <><StorefrontHeader /><main className="product-directory-page"><div className="product-directory-heading"><div><h1>{third !== '全部' ? third : secondary !== '全部' ? secondary : category || '全部商品'}</h1><p>共 {filtered.length} 件商品 · 每页 12 件</p></div><Link className="catalog-more-link" href="/products">全部商品 →</Link></div><form className="product-directory-search" action="/products">{category && <input type="hidden" name="category" value={category} />}{secondary !== '全部' && <input type="hidden" name="secondary" value={secondary} />}{third !== '全部' && <input type="hidden" name="third" value={third} />}<input name="q" defaultValue={query} placeholder="搜索商品" aria-label="搜索商品" /><button type="submit">搜索</button></form><div className="product-grid refined-grid homepage-product-grid">{result.items.map(product => <StoreProductCard key={product.id} product={product} />)}</div>{!filtered.length && <p className="tool-directory-empty">暂无匹配商品。</p>}<CatalogPagination page={result.page} totalPages={result.totalPages} href={`/products${base.size ? `?${base}` : ''}`} label="商品目录分页" /></main></>;
}
