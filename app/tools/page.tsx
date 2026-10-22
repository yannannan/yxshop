import type { Metadata } from 'next';
import Link from 'next/link';
import { ToolDirectory } from '@/components/tool-directory';
import { getPublishedTools } from '@/lib/tool-service-data';
import { siteOrigin } from '@/lib/tool-services';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: '工具服务｜宇星商城', description: '发现清理、视频提取、文件签名与印章制作等实用工具，查看介绍和使用入口。',
  alternates: { canonical: `${siteOrigin()}/tools` },
};

export default async function ToolsPage() {
  const tools = await getPublishedTools();
  return <main className="tools-page"><header className="tools-page-header"><Link href="/" className="tools-brand">宇星商城</Link><Link href="/">返回商城</Link></header><ToolDirectory tools={tools} /></main>;
}
