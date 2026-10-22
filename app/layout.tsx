import type { Metadata } from 'next';
import './globals.css';
import './extra.css';
import './refined.css';
import './flow.css';
import './technical-services.css';
import './technician/technician.css';
import './tools.css';
import './storefront-banners.css';
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.yxstar.shop'),
  title: '宇星商城｜精选数字商品',
  description: '轻量、可靠的数字商品购买平台，支持自动发货与订单售后。',
  openGraph: {
    title: '宇星商城｜精选数字商品',
    description: '精选数字商品 · 简单买，放心用',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: '宇星商城' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '宇星商城｜精选数字商品',
    description: '精选数字商品 · 简单买，放心用',
    images: ['/og.png'],
  },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
