export const initialPoints = 100;
export const defaultPointsPackages = [
  { name: '轻享积分包', points: 200, price: 20 },
  { name: '常用积分包', points: 600, price: 50 },
  { name: '畅用积分包', points: 1200, price: 100 },
  { name: '尊享积分包', points: 2500, price: 200 },
] as const;
export const pointsLedgerLabels: Record<string, string> = { welcome: '初始赠送', recharge: '充值到账', consume: '工具消费' };
export type PointsPackage = { id: number; name: string; points: number; price: number; description: string; status: string; paymentReady?: boolean };
export type PointsLedger = { operation_id: string; kind: string; delta: number; balance_after: number; product_name?: string; order_id: string | null; created_at: string };
export type PointsAccount = { signedIn: boolean; balance: number; ledger: PointsLedger[]; page: number; total: number; packages: PointsPackage[] };
export const validPoints = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 1000000;
