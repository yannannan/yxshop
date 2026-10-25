import { requireAccount, readAccountRecords, accountFailure, accountHeaders, AccountError } from '@/lib/account-service';
export async function GET(request: Request) {
  try {
    const user = await requireAccount(request), params = new URL(request.url).searchParams;
    const kind = params.get('kind') || 'orders';
    if (!['orders','activity'].includes(kind)) throw new AccountError('记录类型不正确');
    return Response.json(await readAccountRecords(Number(user.id), kind as 'orders' | 'activity', Number(params.get('page') || 1), params.get('filter') || 'all'), { headers: accountHeaders });
  } catch (error) { return accountFailure(error); }
}
