import type { Metadata } from 'next';
import { StorefrontHeader } from '../../components/storefront-header';
import { PointsCenter } from '../../components/points-center';

export const metadata: Metadata = { title: '我的积分与充值 | 宇星商城', robots: { index: false, follow: false } };
export default function PointsPage() { return <><StorefrontHeader /><PointsCenter /></>; }
