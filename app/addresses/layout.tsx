import { getPageMetadata } from '@/lib/page-seo-server';
export async function generateMetadata() { return getPageMetadata('addresses'); }
export default function AddressLayout({ children }: { children: React.ReactNode }) { return children; }
