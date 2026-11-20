export type AccountUser = {
  id: number; nickname: string; phone: string; maskedPhone: string; email: string;
  avatarUrl: string; isAdmin: boolean; isTechnician: boolean; createdAt: string;
};
export type Account = { authenticated: boolean; user: AccountUser | null; pointsBalance: number | null; pointsMessage?: string; profileReady?: boolean };
export type AccountRecord = { id: string; title: string; kind: string; status: string; createdAt: string; href: string | null; amount?: number | null };
export type AccountRecords = { items: AccountRecord[]; total: number; page: number; pageSize: number; warnings: string[] };
export const defaultAvatar = '/account/default-avatar.png';
export const accountSections = [
  { key: 'overview', label: '账户总览', href: '/account' },
  { key: 'points', label: '我的积分', href: '/points' },
  { key: 'orders', label: '我的订单', href: '/account/orders' },
  { key: 'activity', label: '工具记录', href: '/account/activity' },
  { key: 'addresses', label: '地址管理', href: '/addresses' },
  { key: 'profile', label: '账号资料', href: '/account/profile' },
] as const;
export type AccountSection = typeof accountSections[number]['key'];
export function maskPhone(phone: string) { return phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone; }
export function accountReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return '';
  try {
    const url = new URL(value, 'https://account.invalid');
    if (url.origin !== 'https://account.invalid' || /^\/(?:api|admin)(?:\/|$)/.test(url.pathname)) return '';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return ''; }
}
export function accountLoginHref(path: string) { return `/?returnTo=${encodeURIComponent(accountReturnPath(path) || '/account')}`; }
export const recordKindLabels: Record<string, string> = { mall: '商城订单', points: '积分充值', technical: '技术服务', video: '视频提取', stamp: '印章制作', image: '图片处理', site: '站长分析', signature: '制作签名', handprint: '手印制作', 'signed-document': '签署文件' };
export function recordStatusLabel(row: Pick<AccountRecord, 'kind' | 'status'>) {
  if (row.status === 'deleted') return ['signature', 'handprint'].includes(row.kind) ? '已删除' : '成品已删除';
  if (row.kind === 'points' && ['paid', 'pending_delivery', 'delivered'].includes(row.status)) return '已到账';
  if (row.kind === 'stamp') return '已完成';
  if (row.kind === 'signed-document' && row.status === 'expired') return '已过期';
  if (row.kind === 'site') return ({ completed: '已完成', partial: '部分完成', queued: '排队中', running: '采集中', failed: '分析失败' } as Record<string,string>)[row.status] || '状态待确认';
  return ({ pending: '待支付', verification: '待核验', paid: '已支付', pending_delivery: '待发货', delivered: '已发货', pending_quote: '待报价', pending_payment: '待支付', payment_review: '支付核验中', in_service: '服务中', awaiting_acceptance: '待验收', completed: '已完成', closed: '已关闭', cancelled: '已取消', queued: '排队中', processing: '处理中', ready: '已完成', failed: '处理失败' } as Record<string, string>)[row.status] || '状态待确认';
}
