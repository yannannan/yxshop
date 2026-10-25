import { localizeMetadata } from '@/lib/i18n-server';
import type { Metadata } from 'next';
import { StorefrontHeader } from '../../components/storefront-header';
import { AccountPointsCenter } from '../../components/points-center';
import { AccountShell } from '../../components/account-shell';

const pageMetadata: Metadata = { title: '我的积分与充值 | 宇星脉通', robots: { index: false, follow: false } };
export default function PointsPage() { return <><StorefrontHeader /><AccountShell section="points" allowGuest><AccountPointsCenter /></AccountShell></>; }

export async function generateMetadata() { return localizeMetadata(pageMetadata); }
