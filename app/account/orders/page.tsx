import { AccountShell } from '@/components/account-shell';
import { AccountRecordList } from '@/components/account-center';
import { getPageMetadata } from '@/lib/page-seo-server';
export async function generateMetadata() { return getPageMetadata('accountOrders'); }
export default function AccountOrdersPage() { return <AccountShell section="orders"><AccountRecordList kind="orders" /></AccountShell>; }
