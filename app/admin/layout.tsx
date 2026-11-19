import type { Metadata } from 'next';
import { LanguageProvider } from '@/components/language-provider';

export const metadata: Metadata = { title: '管理后台｜宇星脉通', robots: { index: false, follow: false } };
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <LanguageProvider locale="zh-CN"><div lang="zh-CN" data-admin-ui style={{ display: 'contents' }}>{children}</div></LanguageProvider>;
}
