'use client';
import { useState } from 'react';
import { ArrowLeftIcon, ChartBarIcon, ChevronDownIcon, GlobeAltIcon, SparklesIcon, Squares2X2Icon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import { useI18n } from './language-provider';
import { workspaceGroups, workspacePages, type WorkspaceView } from '../lib/site-workspace';

const icons = { sites: GlobeAltIcon, overview: Squares2X2Icon, analysis: ChartBarIcon, operations: WrenchScrewdriverIcon, acquisition: SparklesIcon };
/* eslint-disable @next/next/no-html-link-for-pages -- 工作台返回入口使用原生链接。 */
export function SiteWorkspaceSidebar({ view, onNavigate }: { view: WorkspaceView; onNavigate: (view: WorkspaceView) => void }) {
  const { t } = useI18n();
  const [expanded,setExpanded] = useState<Record<string,boolean>>({});
  return <aside className="seo-sidebar seo-workspace-sidebar">
    <div className="seo-sidebar-heading"><span>{t('站长运营工作台')}</span><h2>{t('站长分析工具')}</h2></div>
    <nav aria-label={t('站长分析导航')}>{workspaceGroups.map(group => {
      const Icon = icons[group.id as keyof typeof icons], active = group.view === view || Boolean(group.children?.includes(view));
      if (group.view) return <button type="button" key={group.id} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={() => onNavigate(group.view!)}><Icon aria-hidden="true" /><span>{t(group.label)}</span></button>;
      const open = expanded[group.id] ?? active, panelId = `seo-menu-${group.id}`;
      return <div className={`seo-menu-group${active ? ' current' : ''}`} key={group.id}>
        <button type="button" className="seo-menu-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setExpanded(old => ({ ...old, [group.id]: !open }))}><Icon aria-hidden="true" /><span>{t(group.label)}</span><ChevronDownIcon className={open ? 'expanded' : ''} aria-hidden="true" /></button>
        <div className="seo-submenu" id={panelId} hidden={!open}>{group.children?.map(child => <button type="button" key={child} className={view === child ? 'active' : ''} aria-current={view === child ? 'page' : undefined} onClick={() => onNavigate(child)}><span className="seo-menu-dot" aria-hidden="true" /><span>{t(workspacePages[child].label)}</span></button>)}</div>
      </div>;
    })}</nav>
    <a className="seo-return" href="/tools"><ArrowLeftIcon aria-hidden="true" />{t('返回工具服务')}</a>
  </aside>;
}
