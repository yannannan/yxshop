import type { Metadata } from 'next';
import { getI18n } from '@/lib/i18n-server';
import { AiLeadsWorkspace } from '@/components/ai-leads-workspace';
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: locale === 'en' ? 'Prospecting Workspace Preview | Yuxing Maitong' : '获客工作台预览｜宇星脉通', robots: { index: false, follow: true } };
}
export default function AiLeadsWorkspacePage() { return <AiLeadsWorkspace />; }
