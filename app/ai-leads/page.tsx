import { getI18n } from '@/lib/i18n-server';
import type { Metadata } from 'next';
import { siteOrigin } from '@/lib/tool-services';
import { AiLeadsLanding } from '@/components/ai-leads-landing';
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: locale === 'en' ? 'AI Lead Intelligence | Yuxing Maitong' : 'AI智能获客｜宇星脉通',
    description: locale === 'en' ? 'Explore a workspace for domestic and international prospecting, keyword search, lead analysis and customer profiles. UI preview.' : '面向国内与海外的AI获客工作空间，体验关键词检索、数据筛选、客户画像与线索管理。当前为界面预览版。',
    alternates: { canonical: `${siteOrigin()}/ai-leads` } };
}
export default function AiLeadsPage() { return <AiLeadsLanding />; }
