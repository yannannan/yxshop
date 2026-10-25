import type { Metadata } from 'next';
import { StorefrontHeader } from '../../components/storefront-header';
import { AccountPointsCenter } from '../../components/points-center';
import { AccountShell } from '../../components/account-shell';

export const metadata: Metadata = { title: '我的积分与充值 | 宇星脉通', robots: { index: false, follow: false } };
export default function PointsPage() { return <><StorefrontHeader /><AccountShell section="points" allowGuest><AccountPointsCenter /></AccountShell></>; }
