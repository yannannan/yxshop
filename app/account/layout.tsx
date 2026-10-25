import type { Metadata } from 'next';
import { StorefrontHeader } from '@/components/storefront-header';
export const metadata: Metadata = { title: '个人中心｜宇星商城', robots: { index: false, follow: false } };
export default function AccountLayout({ children }: { children: React.ReactNode }) { return <><StorefrontHeader />{children}</>; }
