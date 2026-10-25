'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { ArrowPathIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { defaultAvatar, recordKindLabels, recordStatusLabel, type AccountRecord, type AccountRecords, type AccountUser } from '../lib/account';
import { notifyAccountChanged, refreshAccount, useAccount } from '../lib/account-client';

const date = (value: string) => { const timestamp = new Date(value); return Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '时间待确认'; };
type RecordsState = { data: AccountRecords | null; error: string; loading: boolean; owner?: number };
function useRecords(kind: 'orders' | 'activity', filter = 'all', page = 1) {
  const { account } = useAccount(), userId = account?.authenticated ? account.user?.id : null;
  const [state, setState] = useState<RecordsState>({ data: null, loading: true, error: '' }), [version, setVersion] = useState(0);
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setState({ data: null, loading: true, error: '', owner: userId });
      try {
        const response = await fetch(`/api/account/records?kind=${kind}&filter=${encodeURIComponent(filter)}&page=${page}`, { cache: 'no-store', signal: controller.signal });
        const result = await response.json() as AccountRecords & { message?: string };
        if (!response.ok) throw new Error(result.message || '记录读取失败');
        if (!controller.signal.aborted) setState({ data: result, loading: false, error: '', owner: userId });
      } catch (error) { if (!controller.signal.aborted) setState({ data: null, loading: false, error: (error as Error).message || '记录暂不可用', owner: userId }); }
    });
    return () => controller.abort();
  }, [userId, kind, filter, page, version]);
  return { ...(state.owner === userId ? state : { data: null, loading: true, error: '' }), retry: () => setVersion(value => value + 1) };
}
/* eslint-disable @next/next/no-html-link-for-pages -- 账户、订单及工具入口均使用可靠的原生跨页导航。 */
function RecordsTable({ state, kind, compact = false }: { state: ReturnType<typeof useRecords>; kind: 'orders' | 'activity'; compact?: boolean }) {
  if (state.loading) return <p className="account-empty-line" role="status">正在读取记录…</p>;
  if (state.error) return <p className="account-notice" role="alert">{state.error}<button onClick={state.retry}>重新读取</button></p>;
  const rows = compact ? state.data?.items.slice(0, 3) : state.data?.items;
  return <>{state.data?.warnings.map(warning => <p className="account-notice" key={warning}>{warning}</p>)}{!rows?.length ? <div className="account-empty-line">暂无{kind === 'orders' ? '订单' : '已保存的工具'}记录。{kind === 'activity' && <a href="/tools">去使用工具</a>}</div> : <div className="account-table-wrap"><table className="account-table"><thead><tr><th>{kind === 'orders' ? '商品 / 服务' : '工具 / 任务'}</th><th>类型</th><th>时间</th><th>状态</th><th>操作</th></tr></thead><tbody>{rows.map((row: AccountRecord) => <tr key={`${row.kind}:${row.id}`}><td><strong>{row.title}</strong>{kind === 'orders' && <small>{row.id}</small>}</td><td>{recordKindLabels[row.kind] || row.kind}</td><td>{date(row.createdAt)}</td><td><span className={`account-status ${['ready','completed','delivered'].includes(row.status) ? 'complete' : row.status === 'failed' ? 'failed' : ''}`}>{recordStatusLabel(row)}</span></td><td><a href={row.href}>{kind === 'orders' ? '查看详情' : '查看记录'}<ArrowRightIcon aria-hidden="true" /></a></td></tr>)}</tbody></table></div>}</>;
}
export function AccountOverview() {
  const { account, error } = useAccount(), user = account?.user;
  const orders = useRecords('orders'), activity = useRecords('activity');
  if (!user) return null;
  return <><div className="account-page-heading"><div><h1>个人中心</h1><p>管理账户、积分与使用记录。</p></div><button className="account-quiet" onClick={() => { void refreshAccount(); orders.retry(); activity.retry(); }}><ArrowPathIcon aria-hidden="true" />刷新</button></div>
    <section className="account-summary"><div className="account-profile-summary"><Image unoptimized src={user.avatarUrl || defaultAvatar} alt="我的头像" width={116} height={116} /><div><h2>{user.nickname}</h2><p>{user.maskedPhone}</p><a className="account-secondary" href="/account/profile">编辑资料</a></div></div><div className="account-summary-points"><span>剩余积分</span><strong>{error || account.pointsBalance === null ? '—' : account.pointsBalance.toLocaleString('zh-CN')}</strong>{(error || account.pointsMessage) && <p role="status">{error || account.pointsMessage}</p>}<div><a className="account-primary" href="/points">积分充值</a><a href="/points#points-records-title">积分明细<ArrowRightIcon aria-hidden="true" /></a></div></div></section>
    <section className="account-panel"><div className="account-section-heading"><h2>最近使用的工具</h2><a href="/account/activity">查看全部记录<ArrowRightIcon aria-hidden="true" /></a></div><RecordsTable state={activity} kind="activity" compact /></section>
    <section className="account-panel"><div className="account-section-heading"><h2>最近订单</h2><a href="/account/orders">查看全部订单<ArrowRightIcon aria-hidden="true" /></a></div><RecordsTable state={orders} kind="orders" compact /></section>
  </>;
}
export function AccountRecordList({ kind }: { kind: 'orders' | 'activity' }) {
  const [filter, setFilter] = useState('all'), [page, setPage] = useState(1), state = useRecords(kind, filter, page);
  const options = kind === 'orders' ? [['all','全部订单'],['mall','商城订单'],['points','积分充值'],['technical','技术服务']] : [['all','全部记录'],['video','视频提取'],['stamp','印章制作']];
  return <><div className="account-page-heading"><div><h1>{kind === 'orders' ? '我的订单' : '工具记录'}</h1><p>{kind === 'orders' ? '商城、积分充值与技术服务订单，集中查看。' : '查看服务端已保存的任务和成品，重复查看不扣积分。'}</p></div><button className="account-quiet" onClick={state.retry}><ArrowPathIcon aria-hidden="true" />刷新</button></div><section className="account-panel"><div className="account-filters" aria-label="记录类型">{options.map(([value,label]) => <button key={value} aria-pressed={filter === value} className={filter === value ? 'active' : ''} onClick={() => { setFilter(value); setPage(1); }}>{label}</button>)}</div><RecordsTable state={state} kind={kind} /><div className="account-pagination"><button disabled={state.loading || !state.data || state.data.page <= 1} onClick={() => setPage((state.data?.page || 1) - 1)}>上一页</button><span>共 {state.data?.total ?? '—'} 条 · 第 {state.data?.page || 1} / {Math.max(1, Math.ceil((state.data?.total || 0) / 10))} 页</span><button disabled={state.loading || !state.data || state.data.page >= Math.ceil(state.data.total / 10)} onClick={() => setPage((state.data?.page || 1) + 1)}>下一页</button></div></section></>;
}
function ProfileForm({ user, ready }: { user: AccountUser; ready: boolean }) {
  const [nickname, setNickname] = useState(user.nickname), [email, setEmail] = useState(user.email);
  const [avatar, setAvatar] = useState<{ data: string; mime: string } | null>(null), [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false), [reading, setReading] = useState(false), [message, setMessage] = useState(''), [saved, setSaved] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const preview = avatar ? `data:${avatar.mime};base64,${avatar.data}` : removed ? defaultAvatar : user.avatarUrl;
  async function choose(file?: File) {
    if (!file) return;
    setMessage(''); setSaved(false); setReading(true);
    try {
      if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('请选择 5MB 以内的 PNG、JPG 或 WebP 图片');
      const bitmap = await createImageBitmap(file);
      try {
        if (!bitmap.width || !bitmap.height || bitmap.width > 8192 || bitmap.height > 8192) throw new Error('图片尺寸过大，请选择较小的图片');
        const canvas = document.createElement('canvas'), scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d'); if (!context) throw new Error('当前浏览器无法读取图片');
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
        if (!data || data.length > 1398104) throw new Error('图片过大，请重新选择');
        setAvatar({ data, mime: 'image/jpeg' }); setRemoved(false);
      } finally { bitmap.close(); }
    } catch (error) { setMessage((error as Error).message || '图片无法读取，请重新选择'); }
    finally { setReading(false); if (input.current) input.current.value = ''; }
  }
  function reset() { setNickname(user.nickname); setEmail(user.email); setAvatar(null); setRemoved(false); setMessage(''); setSaved(false); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy || reading) return;
    setBusy(true); setMessage(''); setSaved(false);
    try {
      const response = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname, email, ...(avatar ? { avatar } : {}), ...(removed ? { removeAvatar: true } : {}) }) });
      const result = await response.json() as { ok?: boolean; message?: string }; if (!response.ok) throw new Error(result.message || '资料保存失败');
      notifyAccountChanged(); await refreshAccount(); setAvatar(null); setRemoved(false); setMessage('资料已保存'); setSaved(true);
    } catch (error) { setMessage((error as Error).message || '保存失败，请稍后重试'); }
    finally { setBusy(false); }
  }
  return <form className="account-panel account-profile-form" onSubmit={event => void save(event)}>
    {!ready && <p className="account-notice">个人资料尚未初始化，请管理员执行 09 个人中心增量 SQL。现有账号和积分仍可使用。</p>}
    <div className="account-avatar-editor"><Image unoptimized src={preview || defaultAvatar} alt="头像预览" width={96} height={96} /><div><b>个人头像</b><p>选择图片后预览，点击底部保存后生效。</p><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => void choose(event.target.files?.[0])} /><button type="button" className="account-secondary" disabled={busy || reading || !ready} onClick={() => input.current?.click()}>{reading ? '读取中…' : '更换头像'}</button><button type="button" className="account-quiet" disabled={busy || reading || !ready} onClick={() => { setAvatar(null); setRemoved(true); setSaved(false); }}>使用默认头像</button></div></div>
    <div className="account-form-grid"><label>昵称<input value={nickname} maxLength={32} required disabled={busy || !ready} onChange={event => setNickname(event.target.value)} /></label><label>登录手机号<input value={user.maskedPhone} readOnly /><small>用于当前登录，保持原账号绑定。</small></label><label className="account-field-wide">联系邮箱<input type="email" value={email} maxLength={254} required disabled={busy || !ready} onChange={event => setEmail(event.target.value)} /><small>账户联系与订单通知使用此邮箱，请确认可正常收信。</small></label></div>
    {message && <p className={`account-form-message${saved ? ' success' : ''}`} role="status">{message}</p>}
    <div className="account-form-actions"><button type="button" className="account-secondary" disabled={busy || reading} onClick={reset}>取消修改</button><button className="account-primary" disabled={busy || reading || !ready}>{busy ? '保存中…' : '保存资料'}</button></div>
  </form>;
}
export function AccountProfile() {
  const { account } = useAccount();
  return <><div className="account-page-heading"><div><h1>账号资料</h1><p>设置头像、昵称和联系邮箱。</p></div></div>{account?.user && <ProfileForm key={account.user.id} user={account.user} ready={account.profileReady !== false} />}</>;
}
