"use client";
import { useI18n } from '@/components/language-provider';


import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { CatalogProduct } from '../lib/catalog';
import type { ToolService } from '../lib/tool-services';
import { categorySectionKey, homepageSections, orderItems, orderSections, paginate, type HomepageDisplay } from '../lib/homepage-display';
import { ToolDirectory } from './tool-directory';
import { CatalogPagination } from './catalog-pagination';

function ProductSection({ title, products, renderProduct, category, query }: { title: string; products: CatalogProduct[]; renderProduct: (product: CatalogProduct) => ReactNode; category?: string; query: string }) {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const result = paginate(products, page, 12);
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (query.trim()) params.set('q', query.trim());
  return <section className="product-category-section"><header><div><h2>{t(title)}</h2><span>{t("共 ")}{t(products.length)}{t(" 件商品")}</span></div><Link className="catalog-more-link" href={`/products${params.size ? `?${params}` : ''}`}>{t("更多商品 →")}</Link></header><div className="product-grid refined-grid homepage-product-grid">{result.items.map(renderProduct)}</div><CatalogPagination page={result.page} totalPages={result.totalPages} onChange={setPage} label={t(`${title}分页`)} /></section>;
}

export function HomepageCatalog({ products, tools, settings, loading, error, onToolsRetry, query, renderProduct, portal = false }: { products: CatalogProduct[]; tools: ToolService[]; settings: HomepageDisplay; loading: boolean; error: string; onToolsRetry?: () => void; query: string; renderProduct: (product: CatalogProduct) => ReactNode; portal?: boolean }) {
  const { t } = useI18n();
  const goods = orderItems(products, settings.itemOrder);
  const entries = orderItems(tools, settings.itemOrder);
  const sections = orderSections(homepageSections(goods.map(item => item.category), settings.mode), settings.sectionOrder).filter(section => section.key !== 'products' || goods.length > 0);
  if (portal && !query.trim()) {
    const categories = sections.filter(section => section.key.startsWith('category:')).map(section => section.name);
    const names = settings.mode === 'flat' ? [...new Set(goods.map(item => item.category))] : categories;
    const shortcuts = names.slice(0, Math.min(4, Math.max(0, 12 - entries.length))).map(name => ({ name, href: `/products?category=${encodeURIComponent(name)}`, count: goods.filter(item => item.category === name).length }));
    return <div className="homepage-catalog-sections portal-catalog"><ToolDirectory title={t('探索全部服务')} tools={entries} loading={loading} error={error} onRetry={onToolsRetry} pageSize={12} portal shortcuts={shortcuts} /><div className="portal-more"><span>{t('从实用工具到数字服务，找到适合你的下一步。')}</span><Link href="/products">{t('查看全部数字商品 →')}</Link></div></div>;
  }
  return <div className="homepage-catalog-sections">{sections.map(section => section.key === 'tools' ?
    (entries.length || loading || error ? <ToolDirectory key={`${section.key}:${query}`} title={t("工具服务")} tools={entries} loading={loading} error={error} onRetry={onToolsRetry} /> : null) :
    <ProductSection key={`${section.key}:${query}`} title={t(section.name)} products={section.key === 'products' ? goods : goods.filter(item => categorySectionKey(item.category) === section.key)} category={section.key === 'products' ? undefined : section.name} query={query} renderProduct={renderProduct} />)}</div>;
}
