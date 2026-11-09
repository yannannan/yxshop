import { AccountShell } from '@/components/account-shell';
import { AccountRecordList } from '@/components/account-center';
export default async function AccountActivityPage({ searchParams }: { searchParams: Promise<{ filter?: string | string[] }> }) {
  const { filter } = await searchParams;
  const initialFilter = typeof filter === 'string' ? filter : undefined;
  return <AccountShell section="activity"><AccountRecordList key={initialFilter} kind="activity" initialFilter={initialFilter} /></AccountShell>;
}
