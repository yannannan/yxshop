import StorePage from '@/components/storefront-page';
import { getPublishedTools } from '@/lib/tool-service-data';
import { getHomepageDisplay } from '@/lib/homepage-display-data';
import type { ToolService } from '@/lib/tool-services';
import { defaultHomepageDisplay } from '@/lib/homepage-display';

async function initialData<T>(request: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([request, new Promise<T>(resolve => { timer = setTimeout(() => resolve(fallback), 3000); })]);
  } catch { return fallback; }
  finally { clearTimeout(timer); }
}

export default async function HomePage({ searchParams }: { searchParams?: Promise<{ channel?: string | string[] }> }) {
  const params = await searchParams;
  const channel = params?.channel === 'technical' ? 'technical' : 'mall';
  const [toolResult, config] = await Promise.all([
    channel === 'mall' ? initialData(getPublishedTools().then(tools => ({ tools, error: '' })).catch(error => {
      console.error('首页工具读取失败', (error as { code?: string }).code || (error as Error).name);
      return { tools: null, error: '工具服务暂不可用，请稍后重试' };
    }), { tools: null, error: '工具列表读取超时，请重试' }) : Promise.resolve({ tools: null as ToolService[] | null, error: '' }),
    initialData(getHomepageDisplay(), defaultHomepageDisplay()),
  ]);
  return <StorePage initialTools={toolResult.tools} initialToolsError={toolResult.error} initialConfig={config} initialChannel={channel} />;
}
