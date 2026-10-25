'use client';
import { useEffect, useSyncExternalStore } from 'react';
import type { Account } from './account';

type State = { account: Account | null; loading: boolean; error: string };
const initial: State = { account: null, loading: true, error: '' };
let state = initial, updatedAt = 0, revision = 0, running: Promise<void> | null = null, refreshAgain = false;
const listeners = new Set<() => void>();
function publish(next: State) { state = next; for (const listener of listeners) listener(); }
export function refreshAccount(force = true) {
  if (!force && Date.now() - updatedAt < 30000) return Promise.resolve();
  if (running) { if (force) refreshAgain = true; return running; }
  const current = revision;
  publish({ ...state, loading: true, error: '' });
  running = (async () => {
    try {
      const response = await fetch('/api/account', { cache: 'no-store' });
      const data = await response.json() as Account & { message?: string };
      if (!response.ok || typeof data.authenticated !== 'boolean') throw new Error(data.message || '账户读取失败');
      if (current === revision) { updatedAt = Date.now(); publish({ account: data, loading: false, error: '' }); }
    } catch (error) {
      if (current === revision) publish({ account: state.account ? { ...state.account, pointsBalance: null } : null, loading: false, error: (error as Error).message || '账户暂不可用' });
    } finally { running = null; if (refreshAgain) { refreshAgain = false; void refreshAccount(); } }
  })();
  return running;
}
export function notifyAccountChanged() {
  revision++; updatedAt = 0;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('yxshop-account-changed'));
    try { localStorage.setItem('yxshop-account-event', `${Date.now()}:${Math.random()}`); } catch { /* 禁用本地存储不影响当前页面。 */ }
  }
}
export async function signOutAccount() {
  const response = await fetch('/api/auth/logout', { method: 'POST' });
  if (!response.ok) throw new Error('退出失败，请稍后重试');
  revision++; updatedAt = Date.now();
  publish({ account: { authenticated: false, user: null, pointsBalance: null }, loading: false, error: '' });
  try { localStorage.removeItem('mall_phone'); } catch { /* 身份以服务器 Cookie 为准。 */ }
  notifyAccountChanged();
}
export function useAccount() {
  const result = useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => state, () => initial);
  useEffect(() => {
    void refreshAccount(false);
    const changed = () => { void refreshAccount(); };
    const focused = () => { if (document.visibilityState === 'visible') void refreshAccount(false); };
    const storage = (event: StorageEvent) => { if (event.key === 'yxshop-account-event') { revision++; updatedAt = 0; changed(); } };
    window.addEventListener('yxshop-account-changed', changed);
    window.addEventListener('focus', focused);
    document.addEventListener('visibilitychange', focused);
    window.addEventListener('storage', storage);
    return () => { window.removeEventListener('yxshop-account-changed', changed); window.removeEventListener('focus', focused); document.removeEventListener('visibilitychange', focused); window.removeEventListener('storage', storage); };
  }, []);
  return result;
}
