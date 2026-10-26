export class SiteAnalysisRequestError extends Error {
  constructor(message: string, public status: number, public retryAfter?: number) { super(message); }
}

export async function siteAnalysisRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/tools/site-analysis${path}`, { cache: 'no-store', ...init });
  const invalidResponse = () => new Error('分析服务返回异常响应，请重试或联系管理员检查服务日志');
  let data: unknown;
  try { data = await response.json(); }
  catch (error) {
    // Aborting a stale account/request must retain its cancellation semantics.
    if (init.signal?.aborted || (error as Error)?.name === 'AbortError') throw error;
    throw invalidResponse();
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalidResponse();
  if (!response.ok) {
    const message = (data as { message?: unknown }).message;
    const delay = response.headers.get('Retry-After') || (data as { retryAfter?: unknown }).retryAfter;
    const seconds = typeof delay === 'number' || typeof delay === 'string' && /^\d+$/.test(delay) ? Number(delay) : NaN;
    const retryAfter = response.status === 429 && Number.isFinite(seconds) && seconds > 0 ? Math.min(10, Math.ceil(seconds)) : undefined;
    throw new SiteAnalysisRequestError(typeof message === 'string' && message.trim() ? message : '分析服务暂不可用，请稍后重试', response.status, retryAfter);
  }
  return data as T;
}
