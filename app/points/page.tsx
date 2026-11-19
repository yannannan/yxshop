import { getPageMetadata } from '@/lib/page-seo-server';
import { StorefrontHeader } from '../../components/storefront-header';
import { AccountPointsCenter } from '../../components/points-center';
import { AccountShell } from '../../components/account-shell';

export default function PointsPage() { return <><StorefrontHeader /><AccountShell section="points" allowGuest><AccountPointsCenter /></AccountShell></>; }

export async function generateMetadata() { return getPageMetadata('points'); }
