import type { ReactNode } from 'react';
import { StorefrontHeader } from '@/components/storefront-header';
export default function AiLeadsLayout({ children }: { children: ReactNode }) {
  return <><StorefrontHeader channel="ai-leads" />{children}</>;
}
