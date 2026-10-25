import type { Metadata } from 'next';
import { StorefrontHeader } from '@/components/storefront-header';
export const metadata: Metadata = { title: 'AI运营工具｜宇星商城' };
export default function AiOperationsPage() {
  /* eslint-disable @next/next/no-html-link-for-pages -- 新频道入口使用原生链接。 */
  return <><StorefrontHeader channel="ai-operations" /><main className="ai-channel-page"><span className="section-kicker">YXSTAR AI</span><h1>AI运营工具</h1><p>面向日常运营的工具与分析服务。</p><div className="ai-channel-note"><h2>站长分析工具 · 方案研讨中</h2><p>当前正在确认关键词、搜索排名及竞品对比的功能与数据方案，尚未开放分析任务。</p><a className="account-secondary" href="/tools">查看已开放工具</a></div></main></>;
}
