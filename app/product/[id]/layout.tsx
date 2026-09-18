import type { Metadata } from 'next';
import { getProduct } from '../../../lib/catalog';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = getProduct(Number(id));
  if (!product) return { title: '商品不存在｜宇星商城' };
  return {
    title: `${product.name}｜宇星商城`,
    description: product.detail,
    openGraph: { title: `${product.name}｜宇星商城`, description: product.detail, images: [] },
    twitter: { title: `${product.name}｜宇星商城`, description: product.detail, images: [] },
  };
}

export default function ProductLayout({ children }: { children: React.ReactNode }) { return children; }
