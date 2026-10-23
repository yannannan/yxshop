"use client";

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { CatalogProduct } from '../lib/catalog';
import type { ToolService } from '../lib/tool-services';
import { categorySectionKey, homepageSections, orderItems, orderSections, paginate, type HomepageDisplay } from '../lib/homepage-display';
import { ToolDirectory } from './tool-directory';
import { CatalogPagination } from './catalog-pagination';

function ProductSection({ title, products, renderProduct, category, query }: { title: string; products: CatalogProduct[]; renderProduct: (product: CatalogProduct) => ReactNode; category?: string; query: string }) {
  const [page, setPage] = useState(1);
  const result = paginate(products, page, 12);
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (query.trim()) params.set('q', query.trim());
  return <section className="product-category-section"><header><div><h2>{title}</h2><span>共 {products.length} 件商品</span></div><Link className="catalog-more-link" href={`/products${params.size ? `?${params}` : ''}`}>更多商品 →</Link></header><div className="product-grid refined-grid homepage-product-grid">{result.items.map(renderProduct)}</div><CatalogPagination page={result.page} totalPages={result.totalPages} onChange={setPage} label={`${title}分页`} /></section>;
}

export function HomepageCatalog({ products, tools, settings, loading, error, query, renderProduct }: { products: CatalogProduct[]; tools: ToolService[]; settings: HomepageDisplay; loading: boolean; error: string; query: string; renderProduct: (product: CatalogProduct) => ReactNode }) {
  const goods = orderItems(products, settings.itemOrder);
  const entries = orderItems(tools, settings.itemOrder);
  const sections = orderSections(homepageSections(goods.map(item => item.category), settings.mode), settings.sectionOrder).filter(section => section.key !== 'products' || goods.length > 0);
  return <div className="homepage-catalog-sections">{sections.map(section => section.key === 'tools' ?
    (entries.length || loading || error ? <ToolDirectory key={`${section.key}:${query}`} title="工具服务" tools={entries} loading={loading} error={error} /> : null) :
    <ProductSection key={`${section.key}:${query}`} title={section.name} products={section.key === 'products' ? goods : goods.filter(item => categorySectionKey(item.category) === section.key)} category={section.key === 'products' ? undefined : section.name} query={query} renderProduct={renderProduct} />)}</div>;
}
