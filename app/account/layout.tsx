import { getPageMetadata } from '@/lib/page-seo-server';
import { StorefrontHeader } from '@/components/storefront-header';
export default function AccountLayout({ children }: { children: React.ReactNode }) { return <><StorefrontHeader />{children}</>; }

export async function generateMetadata() { return getPageMetadata('account'); }
