import { buildPageMetadata } from '@/lib/page-seo';
import { LanguageProvider } from '@/components/language-provider';

export const metadata = buildPageMetadata('admin');
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <LanguageProvider locale="zh-CN"><div lang="zh-CN" data-admin-ui style={{ display: 'contents' }}>{children}</div></LanguageProvider>;
}
