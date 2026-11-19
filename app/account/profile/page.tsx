import { AccountShell } from '@/components/account-shell';
import { AccountProfile } from '@/components/account-center';
import { getPageMetadata } from '@/lib/page-seo-server';
export async function generateMetadata() { return getPageMetadata('accountProfile'); }
export default function ProfilePage() { return <AccountShell section="profile"><AccountProfile /></AccountShell>; }
