'use client';
import { useEffect, useId, useState, type CSSProperties, type FormEvent } from 'react';
import { AdjustmentsHorizontalIcon, ArrowRightIcon, CheckIcon, ClockIcon, DocumentMagnifyingGlassIcon, GlobeAltIcon, MagnifyingGlassIcon, SparklesIcon, UserGroupIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useI18n } from './language-provider';
import { acquisitionDraftError, acquisitionFields, acquisitionPlatforms, acquisitionQuantities, type AcquisitionDraft, type AcquisitionField, type AcquisitionPlatform } from '../lib/ai-leads-design';
import { convertProspect, sampleCustomers, sampleProspects, workspaceAgents, type WorkspaceProspect, type WorkspaceView } from '../lib/ai-workspace-design';
import { WorkspaceIcon } from './ai-workspace-ui';
import { WorkspaceDataPanel } from './ai-workspace-data';
import { WorkspaceMarketingPanel, WorkspaceSocialPanel, WorkspaceWebsitePanel } from './ai-workspace-studio';

type PreviewRecord = { id: number; draft: AcquisitionDraft; time: string };
export function AiLeadsWorkspace() {
  const { locale } = useI18n(), id = useId();
  const tx = (zh: string, en: string) => locale === 'en' ? en : zh;
  const [view, setView] = useState<WorkspaceView>('collect'), [region, setRegion] = useState('all');
  const [keyword, setKeyword] = useState(''), [quantity, setQuantity] = useState(20);
  const [platforms, setPlatforms] = useState<AcquisitionPlatform[]>(['douyin', 'facebook', 'alibaba']);
  const [fields, setFields] = useState<AcquisitionField[]>(['avatar', 'name']);
  const [topics, setTopics] = useState<string[]>([]), [customTopic, setCustomTopic] = useState('');
  const [preview, setPreview] = useState<AcquisitionDraft | null>(null), [history, setHistory] = useState<PreviewRecord[]>([]);
  const [error, setError] = useState(''), [profile, setProfile] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [leads, setLeads] = useState<WorkspaceProspect[]>(sampleProspects);
  const [customers, setCustomers] = useState<WorkspaceProspect[]>(sampleCustomers);
  useEffect(() => { window.scrollTo(0, 0); }, [view]);
  const draft: AcquisitionDraft = { keyword, quantity, platforms, fields, marketing: [...topics, customTopic.trim()].filter(Boolean).join(' / ') };
  const visiblePlatforms = acquisitionPlatforms.filter(p => region === 'all' || p.region === region || p.region === 'both');
  const samplePlatforms = preview ? acquisitionPlatforms.filter(p => preview.platforms.includes(p.id)).slice(0, 3) : [];
  const selectedProfile = samplePlatforms.find(p => p.id === profile);
  const statusNames = [['new', tx('待分类', 'Uncategorized')], ['qualified', tx('意向客户', 'Potential customer')], ['followup', tx('待跟进', 'To follow up')]];
  function togglePlatform(value: AcquisitionPlatform) { setPlatforms(current => current.includes(value) ? current.filter(p => p !== value) : [...current, value]); }
  function submit(event: FormEvent) {
    event.preventDefault();
    const invalid = acquisitionDraftError(draft);
    if (invalid) { setError(invalid === 'keyword' ? tx('请先输入搜索关键词。', 'Enter a search keyword first.') : invalid === 'platforms' ? tx('请至少选择一个平台。', 'Select at least one platform.') : tx('请至少选择一个展示字段。', 'Select at least one data field.')); return; }
    const next = { ...draft, keyword: keyword.trim(), platforms: [...platforms], fields: [...fields] };
    setPreview(next); setProfile(null); setStatuses({}); setError('');
    setHistory(current => [{ id: (current[0]?.id || 0) + 1, draft: next, time: new Date().toLocaleTimeString(locale, { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }) }, ...current].slice(0, 20));
    const nextId = (history[0]?.id || 0) + 1;
    const added: WorkspaceProspect[] = acquisitionPlatforms.filter(p => next.platforms.includes(p.id)).slice(0, 3).map((platform, index) => ({
      id: 'preview-' + nextId + '-' + platform.id, name: tx(`企业线索示例 ${index + 1}`, `Sample business lead ${index + 1}`),
      industry: { zh: next.keyword, en: next.keyword }, region: { zh: platform.region === 'china' ? '中国国内' : '国际市场', en: platform.region === 'china' ? 'China' : 'International' },
      platform: platform.en, interest: { zh: next.marketing || '业务方向待补充', en: next.marketing || 'Business focus not specified' },
      status: 'new', score: 0, email: next.fields.includes('email') ? 'preview-' + nextId + '-' + index + '@example.com' : '', note: '',
    }));
    setLeads(current => [...added, ...current].slice(0, 64));
  }
  function restore(record: PreviewRecord) {
    setKeyword(record.draft.keyword); setQuantity(record.draft.quantity); setPlatforms([...record.draft.platforms]); setFields([...record.draft.fields]);
    setTopics([]); setCustomTopic(record.draft.marketing); setPreview(record.draft); setStatuses({}); setProfile(null); setError(''); setView('collect');
  }
  function sampleValue(field: AcquisitionField, index: number) {
    if (field === 'name') return tx(`企业线索示例 ${index + 1}`, `Sample business lead ${index + 1}`);
    if (field === 'accountId') return `demo_account_0${index + 1}`;
    if (field === 'phone') return tx('待接入', 'Not connected');
    if (field === 'email') return 'contact@example.com';
    if (field === 'bio') return preview?.marketing || tx('企业主页介绍示例', 'Sample business profile');
    return '';
  }
  const headings = {
    collect: [tx('获客工作台', 'Prospecting workspace'), tx('从目标市场出发，发现值得建立联系的下一位客户。', 'Start with your market. Discover your next meaningful business connection.')],
    social: [tx('AI新媒体运营', 'AI social media'), tx('从品牌目标到内容表达，让每一次发布都有方向。', 'Connect brand goals, content and your next publishing plan.')],
    marketing: [tx('AI自动化营销', 'AI marketing'), tx('围绕目标客户，组织营销计划与每一次互动。', 'Organize campaigns and conversations around the right customers.')],
    website: [tx('AI智能建站', 'AI website builder'), tx('把企业与产品资料，变成清晰、专业的品牌网站。', 'Turn your business and products into a clear, professional website.')],
    leads: [tx('线索管理', 'Lead management'), tx('汇总来源、筛选价值，让有潜力的线索进入下一步。', 'Connect sources, review relevance and move promising leads forward.')],
    customers: [tx('客户管理', 'Customer management'), tx('统一客户资料与画像，让每一次跟进都有上下文。', 'Keep customer profiles and follow-up in one shared context.')],
    history: [tx('获客工作台', 'Prospecting workspace'), tx('回看每一次关键词与条件组合，完善你的获客计划。', 'Review your keywords and criteria to refine your prospecting plan.')],
  };
  const [heading, description] = headings[view];
  function updateLead(record: WorkspaceProspect) { setLeads(current => current.map(value => value.id === record.id ? record : value)); }
  function updateCustomer(record: WorkspaceProspect) { setCustomers(current => current.map(value => value.id === record.id ? record : value)); }
  function convertToCustomer(record: WorkspaceProspect) { setCustomers(current => convertProspect(current, record)); updateLead({ ...record, status: 'converted' }); }
  return <div className="al-site al-workspace-shell al-agent-workspace">
    <aside className="ag-sidebar"><a href="/ai-leads" className="ag-workspace-brand"><span className="ag-brand-icon"><WorkspaceIcon name="sparkles" /></span><span><strong>{tx('AI增长工作台', 'AI growth workspace')}</strong><small>YUXING INTELLIGENCE</small></span></a>
      <nav aria-label={tx('智能体选择', 'AI agents')} className="ag-agent-nav"><div className="ag-nav-heading"><span>{tx('我的智能体', 'MY AGENTS')}</span><small>04</small></div>
        {workspaceAgents.map(agent => <button className="ag-agent-card" type="button" key={agent.key} aria-label={locale === 'en' ? agent.en : agent.zh} aria-current={(view === agent.key || agent.key === 'collect' && view === 'history') ? 'page' : undefined} onClick={() => { setView(agent.key); setProfile(null); }}><span className="ag-agent-icon"><WorkspaceIcon name={agent.icon} /></span><span className="ag-agent-card-copy"><strong>{locale === 'en' ? agent.en : agent.zh}</strong><small>{locale === 'en' ? agent.detailEn : agent.detailZh}</small></span></button>)}
      </nav><nav className="ag-data-nav" aria-label={tx('平台数据', 'Platform data')}><div className="ag-nav-heading"><span>{tx('平台数据', 'PLATFORM DATA')}</span></div><button type="button" aria-label={tx('线索管理', 'Lead management')} aria-current={view === 'leads' ? 'page' : undefined} onClick={() => setView('leads')}><WorkspaceIcon name="leads" /><span>{tx('线索管理', 'Lead management')}</span><small>{leads.length}</small></button><button type="button" aria-label={tx('客户管理', 'Customer management')} aria-current={view === 'customers' ? 'page' : undefined} onClick={() => setView('customers')}><WorkspaceIcon name="customers" /><span>{tx('客户管理', 'Customer management')}</span><small>{customers.length}</small></button></nav>
      <div className="ag-sidebar-footer"><span><WorkspaceIcon name="check" />{tx('界面设计版 · 账户通用', 'UI prototype · Shared account')}</span><a href="/ai-leads"><WorkspaceIcon name="back" />{tx('返回产品介绍', 'Product overview')}</a></div>
    </aside>
    <main className="al-workspace-main ag-main"><header className="al-workspace-heading ag-workspace-heading"><div><span className="ag-eyebrow">{view === 'leads' || view === 'customers' ? 'PLATFORM DATA' : 'AGENT WORKSPACE'}</span><h1>{heading}</h1><p>{description}</p></div><span className="ag-badge ag-preview-badge">{tx('交互设计预览', 'Interactive prototype')}</span></header>
      <div className="al-preview-notice ag-preview-notice"><DocumentMagnifyingGlassIcon /><p>{tx('当前为交互演示：不会启动真实采集、不扣积分。所有示例资料、草稿与操作仅在本页保留，刷新后清除。', 'Interactive preview: no real collection or point charges. All sample data, drafts and actions stay on this page and clear on reload.')}</p></div>
      {(view === 'collect' || view === 'history') && <div className="ag-subnav"><div className="ag-tabs"><button type="button" aria-pressed={view === 'collect'} onClick={() => setView('collect')}>{tx('获客配置', 'Prospecting criteria')}</button><button type="button" aria-pressed={view === 'history'} onClick={() => setView('history')}>{tx('预览记录', 'Preview history')}{history.length > 0 && <span className="ag-tab-count">{history.length}</span>}</button></div><span className="ag-muted">{tx('检索 → 分析 → 线索', 'Discover → Analyze → Leads')}</span></div>}
      {view === 'collect' && <div className="al-conditions-layout"><form className="al-panel al-conditions" onSubmit={submit} aria-labelledby={`${id}-conditions`}>
        <header className="al-panel-header"><span><AdjustmentsHorizontalIcon /><h2 id={`${id}-conditions`}>{tx('获客条件', 'Prospecting criteria')}</h2></span><small>{tx('定义范围，聚焦目标', 'Set your scope. Find your focus.')}</small></header>
        <div className="al-conditions-body"><div className="al-search-row"><label htmlFor={`${id}-keyword`}>{tx('搜索关键词', 'Search keywords')}<span className="al-input-icon"><MagnifyingGlassIcon /><input id={`${id}-keyword`} name="keyword" maxLength={80} value={keyword} onChange={e => setKeyword(e.target.value)} placeholder={tx('例如：眼科设备、electric bicycle', 'e.g. ophthalmic equipment, electric bicycle')} aria-describedby={error ? `${id}-error` : undefined} aria-invalid={error && !keyword.trim() ? true : undefined} /></span></label><label htmlFor={`${id}-quantity`}>{tx('每次采集数量', 'Leads per collection')}<select id={`${id}-quantity`} value={quantity} onChange={e => setQuantity(Number(e.target.value))}>{acquisitionQuantities.map(n => <option key={n} value={n}>{n}{tx(' 条', ' leads')}</option>)}</select></label></div>
        <fieldset className="al-fieldset"><legend><b>01</b>{tx('平台选择', 'Choose platforms')}</legend><div className="al-platform-controls"><div className="al-segment" role="group" aria-label={tx('筛选平台区域', 'Filter platform region')}>{[['all', tx('全部', 'All')], ['china', tx('国内', 'China')], ['global', tx('海外', 'International')]].map(([value, label]) => <button type="button" key={value} aria-pressed={region === value} onClick={() => setRegion(value)}>{label}</button>)}</div><span>{tx('已选', 'Selected')} {platforms.length}<button type="button" onClick={() => setPlatforms([])}>{tx('清空', 'Clear')}</button></span></div>
        <div className="al-platform-options">{visiblePlatforms.map(p => <label className={platforms.includes(p.id) ? 'is-checked' : ''} key={p.id}><input type="checkbox" name="platforms" value={p.id} checked={platforms.includes(p.id)} onChange={() => togglePlatform(p.id)} /><span className="al-platform-mark" style={{ '--al-platform': p.color } as CSSProperties}>{p.mark}</span><span>{locale === 'en' ? p.en : p.zh}</span></label>)}</div></fieldset>
        <fieldset className="al-fieldset"><legend><b>02</b>{tx('营销内容', 'Marketing focus')}</legend><p>{tx('选择业务方向，或补充你希望关注的产品、行业与合作类型。', 'Choose your focus or add products, industries and partnership types.')}</p><div className="al-topic-options">{[['眼科设备', 'Ophthalmic equipment'], ['电动车', 'Electric vehicles'], ['工业机械', 'Industrial machinery'], ['代理商／经销商', 'Agents / distributors']].map(([zh, en]) => <label key={zh}><input type="checkbox" checked={topics.includes(tx(zh, en))} onChange={() => setTopics(current => current.includes(tx(zh, en)) ? current.filter(t => t !== tx(zh, en)) : [...current, tx(zh, en)])} />{tx(zh, en)}</label>)}</div><input name="marketing" aria-label={tx('自定义营销内容', 'Custom marketing focus')} maxLength={180} value={customTopic} onChange={e => setCustomTopic(e.target.value)} placeholder={tx('补充营销内容，例如：医疗采购、出口贸易、渠道合作', 'Add a focus, e.g. medical purchasing, export trade, channel partnerships')} /></fieldset>
        <fieldset className="al-fieldset"><legend><b>03</b>{tx('数据精度与展示字段', 'Data detail and fields')}</legend><p>{tx('选择希望在线索中展示的信息，默认包含头像与账号名称。', 'Choose the information to display. Avatar and account name are selected by default.')}</p><div className="al-data-options">{acquisitionFields.map(field => <label key={field.id}><input type="checkbox" name="fields" value={field.id} checked={fields.includes(field.id)} onChange={() => setFields(current => current.includes(field.id) ? current.filter(f => f !== field.id) : [...current, field.id])} />{locale === 'en' ? field.en : field.zh}</label>)}</div></fieldset>
        {error && <p id={`${id}-error`} role="alert" className="al-form-error">{error}</p>}</div>
        <footer className="al-conditions-footer"><span><CheckIcon />{tx('本次为方案预览，不消耗积分', 'Preview only. No points used.')}</span><button className="al-primary" type="submit"><SparklesIcon />{tx('预览获客方案', 'Preview prospecting plan')}<ArrowRightIcon /></button></footer>
      </form><aside className="al-plan-summary al-panel"><header className="al-panel-header"><span><DocumentMagnifyingGlassIcon /><h2>{tx('我的获客方案', 'Your prospecting plan')}</h2></span></header><div className="al-plan-body"><span className="al-plan-symbol"><GlobeAltIcon /></span><h3>{keyword.trim() || tx('等待你的第一个关键词', 'Your first keyword starts here')}</h3><p>{draft.marketing || tx('选择行业与营销方向，让目标更明确。', 'Choose an industry and a marketing focus.')}</p><dl><div><dt>{tx('目标平台', 'Platforms')}</dt><dd>{platforms.length}</dd></div><div><dt>{tx('每次数量', 'Leads per collection')}</dt><dd>{quantity}</dd></div><div><dt>{tx('展示字段', 'Data fields')}</dt><dd>{fields.length}</dd></div></dl><div className="al-summary-tags">{acquisitionPlatforms.filter(p => platforms.includes(p.id)).map(p => <span key={p.id}>{locale === 'en' ? p.en : p.zh}</span>)}</div><div className="al-summary-tip"><SparklesIcon /><p>{tx('预览后可查看示例线索、调整分类与打开客户画像。', 'Preview to explore sample leads, categories and customer profiles.')}</p></div></div></aside></div>}
      {view === 'collect' && <section className="al-panel al-results" aria-labelledby={`${id}-results`}><header className="al-panel-header"><span><UserGroupIcon /><h2 id={`${id}-results`}>{tx('线索结果预览', 'Sample lead preview')}</h2></span><small>{preview ? `${samplePlatforms.length} ${tx('条示例', 'sample leads')}` : tx('等待预览', 'Awaiting preview')}</small></header>
        {!preview ? <div className="al-empty"><MagnifyingGlassIcon /><h3>{tx('先定义目标，再发现机会。', 'Define your target. Explore the possibilities.')}</h3><p>{tx('在获客工作台输入关键词并预览方案，这里将展示示例线索。', 'Enter a keyword in the workspace and preview a plan to see sample leads here.')}</p></div> : <><p className="al-result-caption" role="status">{tx('方案预览已更新。以下仅展示最多3条结构示例，不代表真实采集结果或所选采集数量。', 'Plan preview updated. Up to 3 illustrative rows are shown; these are not real collection results or the requested collection volume.')}</p><div className="al-table-scroll"><table><thead><tr>{preview.fields.map(field => <th key={field}>{locale === 'en' ? acquisitionFields.find(f => f.id === field)!.en : acquisitionFields.find(f => f.id === field)!.zh}</th>)}<th>{tx('来源平台', 'Platform')}</th><th>{tx('线索分类', 'Category')}</th><th>{tx('操作', 'Action')}</th></tr></thead><tbody>{samplePlatforms.map((p, index) => <tr key={p.id}>{preview.fields.map(field => <td key={field}>{field === 'avatar' ? <span className="al-sample-avatar" aria-label={tx('示例头像', 'Sample avatar')}>0{index + 1}</span> : sampleValue(field, index)}</td>)}<td><span className="al-table-platform"><i style={{ color: p.color }}>{p.mark}</i>{locale === 'en' ? p.en : p.zh}</span></td><td><select aria-label={`${locale === 'en' ? p.en : p.zh} ${tx('线索分类', 'lead category')}`} value={statuses[p.id] || 'new'} onChange={e => setStatuses(current => ({ ...current, [p.id]: e.target.value }))}>{statusNames.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td><td><button className="al-table-action" type="button" onClick={() => setProfile(p.id)}>{tx('查看画像', 'View profile')}<ArrowRightIcon /></button></td></tr>)}</tbody></table></div></>}
      </section>}
      {view === 'collect' && preview && selectedProfile && <section className="al-panel al-profile" aria-labelledby={`${id}-profile`}><header className="al-panel-header"><span><SparklesIcon /><h2 id={`${id}-profile`}>{tx('客户画像示例', 'Sample customer profile')}</h2></span><button className="al-icon-button" type="button" aria-label={tx('关闭客户画像', 'Close customer profile')} onClick={() => setProfile(null)}><XMarkIcon /></button></header><div className="al-profile-body"><div><span className="al-mode-badge">{tx('演示资料', 'Sample data')}</span><h3>{tx('渠道合作型客户', 'Channel partnership prospect')}</h3><p>{tx('用于展示客户画像的组织方式，不是真实用户信息。', 'An example of a customer profile structure, not a real person or business.')}</p></div><dl><div><dt>{tx('检索关键词', 'Search keyword')}</dt><dd>{preview.keyword}</dd></div><div><dt>{tx('来源平台', 'Source platform')}</dt><dd>{locale === 'en' ? selectedProfile.en : selectedProfile.zh}</dd></div><div><dt>{tx('业务方向', 'Business focus')}</dt><dd>{preview.marketing || tx('尚未补充', 'Not specified')}</dd></div>{preview.fields.filter(f => f !== 'avatar').map(field => <div key={field}><dt>{locale === 'en' ? acquisitionFields.find(f => f.id === field)!.en : acquisitionFields.find(f => f.id === field)!.zh}</dt><dd>{sampleValue(field, samplePlatforms.findIndex(p => p.id === profile))}</dd></div>)}</dl></div></section>}
      {view === 'history' && <section className="al-panel al-history"><header className="al-panel-header"><span><ClockIcon /><h2>{tx('本次会话的预览记录', 'This session’s preview history')}</h2></span><small>{history.length} / 20</small></header>{history.length ? <div>{history.map(record => <article key={record.id}><span className="al-history-index">{String(record.id).padStart(2, '0')}</span><div><h3>{record.draft.keyword}</h3><p>{record.time} · {record.draft.platforms.length} {tx('个平台', 'platforms')} · {record.draft.quantity} {tx('条 / 次', 'leads per collection')}</p></div><span className="al-mode-badge">{tx('方案演示', 'Plan preview')}</span><button type="button" className="al-table-action" onClick={() => restore(record)}>{tx('查看方案', 'View plan')}<ArrowRightIcon /></button></article>)}</div> : <div className="al-empty"><ClockIcon /><h3>{tx('还没有预览记录', 'No previews yet')}</h3><p>{tx('预览方案后，关键词与筛选条件会临时记录在这里。', 'After previewing a plan, its keyword and criteria will appear here for this session.')}</p></div>}</section>}
      <div hidden={view !== 'social'}><WorkspaceSocialPanel /></div>
      <div hidden={view !== 'marketing'}><WorkspaceMarketingPanel customers={customers} /></div>
      <div hidden={view !== 'website'}><WorkspaceWebsitePanel /></div>
      <div hidden={view !== 'leads'}><WorkspaceDataPanel kind="leads" records={leads} onUpdate={updateLead} onConvert={convertToCustomer} /></div>
      <div hidden={view !== 'customers'}><WorkspaceDataPanel kind="customers" records={customers} onUpdate={updateCustomer} /></div>
    </main>
  </div>;
}
