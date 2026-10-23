'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toolPlanKey, toolPlanQuery, toolPlanLabel, toolPlanPrice, type ToolService } from '../lib/tool-services';

export function ToolLaunch({ tool }: { tool: ToolService }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [purchaseUrl, setPurchaseUrl] = useState('');
  async function launch() {
    if (loading) return;
    setLoading(true); setMessage(''); setPurchaseUrl('');
    try {
      const response = await fetch(`/api/tools/access?slug=${encodeURIComponent(tool.slug)}`, { cache: 'no-store' });
      const result = await response.json() as { entryUrl?: string; message?: string; purchaseUrl?: string };
      if (!response.ok || !result.entryUrl) { setMessage(result.message || '暂时无法进入工具'); setPurchaseUrl(result.purchaseUrl || ''); return; }
      window.location.assign(result.entryUrl);
    } catch { setMessage('无法连接服务器，请稍后重试'); }
    finally { setLoading(false); }
  }
  const unavailable = !tool.entryConfigured || tool.chargeType === 'pending';
  return <div className="tool-launch"><button disabled={unavailable || loading} onClick={() => void launch()}>{!tool.entryConfigured ? '工具入口待配置' : tool.chargeType === 'pending' ? '收费方式待确认' : loading ? '正在打开…' : '进入工具 →'}</button>
    {tool.entryConfigured && tool.chargeType === 'paid' && <div className="tool-purchase-plans">{tool.plans.map(plan => <Link className="tool-purchase-link" key={toolPlanKey(plan)} href={`/product/${tool.id}?${toolPlanQuery(plan)}`}>{toolPlanLabel(plan)} · {toolPlanPrice(plan)} →</Link>)}<small>按次套餐只在成功完成处理后扣次，打开和刷新页面不扣次。</small></div>}
    {message && <p role="alert">{message}{purchaseUrl && <> <Link href={purchaseUrl}>前往购买</Link></>}</p>}
  </div>;
}
