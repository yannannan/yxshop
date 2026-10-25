import { AccountShell } from '@/components/account-shell';
import { AccountRecordList } from '@/components/account-center';
export default function AccountOrdersPage() { return <AccountShell section="orders"><AccountRecordList kind="orders" /></AccountShell>; }
