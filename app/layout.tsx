import type { Metadata } from 'next';
import { getI18n, localizeMetadata } from '@/lib/i18n-server';
import { LanguageProvider } from '@/components/language-provider';
import './globals.css';
import './extra.css';
import './refined.css';
import './flow.css';
import './technical-services.css';
import './technician/technician.css';
import './tools.css';
import './storefront-banners.css';
import './storefront-navigation.css';
import './stamp-maker.css';
import './homepage-display.css';
import './points.css';
import './video-extractor.css';
import './account.css';
import './language.css';
import './site-analysis.css';
import './image-processor.css';
import './document-signature.css';
const pageMetadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.yxstar.shop'),
  title: '宇星脉通｜精选数字商品',
  description: '轻量、可靠的数字商品购买平台，支持自动发货与订单售后。',
  openGraph: {
    title: '宇星脉通｜精选数字商品',
    description: '精选数字商品 · 简单买，放心用',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: '宇星脉通' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '宇星脉通｜精选数字商品',
    description: '精选数字商品 · 简单买，放心用',
    images: ['/og.png'],
  },
};
export async function generateMetadata() { return localizeMetadata(pageMetadata); }
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { locale } = await getI18n();
  return <html lang={locale}><head><script async src="https://www.yxstar.shop/s/RDYfVdtkRd-iXLHGxvrdEA" data-exclude-path="/admin" /></head><body><LanguageProvider locale={locale}>{children}</LanguageProvider></body></html>;
}
