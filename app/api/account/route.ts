import { readAccount, saveAccountProfile, accountFailure, accountHeaders } from '@/lib/account-service';
export async function GET(request: Request) {
  try { return Response.json(await readAccount(request), { headers: accountHeaders }); } catch (error) { return accountFailure(error); }
}
export async function POST(request: Request) {
  try { await saveAccountProfile(request); return Response.json({ ok: true }, { headers: accountHeaders }); } catch (error) { return accountFailure(error); }
}
