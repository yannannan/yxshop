import { useState } from 'react';
import { ChartPieIcon, DocumentChartBarIcon, GlobeAltIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useI18n } from './language-provider';
import { engineDefinitions, engineSearchUrl, type SiteReport } from '../lib/site-analysis';
import { SearchEngineIdentity } from './search-engine-identity';

const trafficChannels = ['直接访问', '搜索引擎', '邮件访问', '外链访问', '社交媒体', '其他'];

export function SiteAnalysisOverviewPanels({ report, onKeyword }: { report: SiteReport; onKeyword: (word: string) => void }) {
  const { t } = useI18n(), [setupOpen, setSetupOpen] = useState(false);
  return <>
    <section className="seo-overview-block" id="seo-overview-panels" aria-labelledby="seo-overview-title"><div className="seo-overview-heading"><h2 id="seo-overview-title">{t('数据概览')}</h2><p>{t('关键词、引擎收录与访问分布')}</p></div><div className="seo-overview-panels">
      <section className="seo-card seo-overview-panel"><div className="seo-panel-title"><h3>{t('关键词总量')}</h3><MagnifyingGlassIcon aria-hidden="true" /></div><strong className="seo-panel-total">{report.keywords.length}</strong><p className="seo-panel-note">{t('本轮去重后的候选词，非搜索量')}</p>
        <div className="seo-keyword-scroll" role="region" tabIndex={0} aria-label={t('本轮关键词列表')}>{report.keywords.length ? report.keywords.map(word => <button key={word.word} type="button" onClick={() => onKeyword(word.word)}>{word.word}</button>) : <p className="seo-empty">{t('暂无足够内容提取关键词')}</p>}</div>
      </section>
      <section className="seo-card seo-overview-panel"><div className="seo-panel-title"><h3>{t('各大引擎收录量')}</h3><DocumentChartBarIcon aria-hidden="true" /></div><p className="seo-panel-note">{t('各引擎收录统计')}</p><div className="seo-engine-scroll seo-report-scroll" role="region" tabIndex={0} aria-label={t('各大引擎收录量列表')}><dl className="seo-engine-counts">{engineDefinitions.map(engine => <div key={engine.id}><dt><SearchEngineIdentity engine={engine} /></dt><dd><strong>—</strong><small>{t('尚未接入收录统计')}</small><a href={engineSearchUrl(engine.id, `site:${report.host}`, report.options.language)} target="_blank" rel="noreferrer">{t('人工核对')}</a></dd></div>)}</dl></div><p className="seo-panel-note">{t(`本轮读取 ${report.coverage.fetched} 页，不等于搜索引擎收录量。`)}</p></section>
      <section className="seo-card seo-overview-panel"><div className="seo-panel-title"><h3>{t('流量来源占比')}</h3><ChartPieIcon aria-hidden="true" /></div><span className="seo-data-state">{t('尚未接入数据')}</span><dl className="seo-channel-list">{trafficChannels.map(channel => <div key={channel}><dt>{t(channel)}</dt><dd>—</dd></div>)}</dl><button className="seo-text-button" type="button" aria-expanded={setupOpen} aria-controls="seo-statistics-setup" onClick={() => setSetupOpen(true)}>{t('查看统计接入说明')}</button></section>
      <section className="seo-card seo-overview-panel"><div className="seo-panel-title"><h3>{t('地理分布情况')}</h3><GlobeAltIcon aria-hidden="true" /></div><span className="seo-data-state">{t('尚未接入数据')}</span><div className="seo-country-scroll seo-report-scroll" role="region" tabIndex={0} aria-label={t('国家访问占比列表')}><table className="seo-country-table"><thead><tr><th scope="col">{t('国家')}</th><th scope="col">{t('访问占比')}</th></tr></thead><tbody><tr><td colSpan={2}><div className="seo-country-empty"><GlobeAltIcon aria-hidden="true" /><p>{t('接入访问统计后，按国家展示访问占比。')}</p></div></td></tr></tbody></table></div><button className="seo-text-button" type="button" aria-expanded={setupOpen} aria-controls="seo-statistics-setup" onClick={() => setSetupOpen(true)}>{t('查看统计接入说明')}</button></section>
    </div></section>
    <details id="seo-statistics-setup" className="seo-card seo-statistics-setup" open={setupOpen} onToggle={event => setSetupOpen(event.currentTarget.open)}><summary>{t('访问统计接入说明')}</summary><p className="seo-inline-note">{t('访问统计功能筹备中。开放后请先验证网站归属，再安装统计脚本，开始累计数据。')}</p><ol>
      <li><strong>{t('验证网站归属')}</strong><p>{t('接入时可通过DNS TXT记录或站点验证文件确认归属；验证本身不会收集访问数据。')}</p></li>
      <li><strong>{t('安装统计脚本')}</strong><p>{t('验证后将专属统计脚本加入网站公共页面，访客访问时才会产生页面浏览和来源记录。')}</p></li>
      <li><strong>{t('开始累计报表')}</strong><p>{t('接入后按访问记录统计来源占比；地理分布需匹配IP地区数据，无法识别的地区会单独标注。')}</p></li>
    </ol><p className="seo-inline-note">{t('页面收录量还需要独立的搜索引擎数据来源，安装访问统计脚本不会得到收录数量。')}</p></details>
  </>;
}
