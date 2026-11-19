import { getI18n } from '@/lib/i18n-server';
import { getPageMetadata } from '@/lib/page-seo-server';
import type { Metadata } from 'next';
import { getPublishedProduct } from '@/lib/product-data';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) return getPageMetadata('missingProduct');
  try {
    const product = await getPublishedProduct(Number(id));
    if (!product) return getPageMetadata('missingProduct');
    const { locale, t } = await getI18n();
    return getPageMetadata('product', {
      title: `${t(product.name)}${locale === 'en' ? ' | Yuxing Maitong' : '｜宇星脉通'}`,
      description: `${t(product.name)}: ${t(product.desc || product.detail)}`,
      keywords: [product.name, product.category, product.subcategory],
      path: `/product/${product.id}`, images: product.coverImage ? [product.coverImage] : [],
    });
  } catch (error) {
    console.error('商品SEO读取失败', error);
    return getPageMetadata('product', { index: false, follow: false });
  }
}

export default function ProductLayout({ children }: { children: React.ReactNode }) { return children; }
