import { localizeMetadata } from '@/lib/i18n-server';
import type { Metadata } from 'next';
import { StorefrontHeader } from '@/components/storefront-header';
const pageMetadata: Metadata = { title: '个人中心｜宇星脉通', robots: { index: false, follow: false } };
export default function AccountLayout({ children }: { children: React.ReactNode }) { return <><StorefrontHeader />{children}</>; }

export async function generateMetadata() { return localizeMetadata(pageMetadata); }
