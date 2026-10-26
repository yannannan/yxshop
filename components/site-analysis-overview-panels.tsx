import { useState } from 'react';
import { ChartPieIcon, DocumentChartBarIcon, GlobeAltIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useI18n } from './language-provider';
import { engineDefinitions, engineSearchUrl, type SiteReport, type SiteStatistics } from '../lib/site-analysis';
import { SearchEngineIdentity } from './search-engine-identity';
import { prioritizeSiteKeywords } from '../lib/site-analysis-keywords';

const trafficChannels = [['direct','直接访问'], ['search','搜索引擎'], ['email','邮件访问'], ['referral','外链访问'], ['social','社交媒体'], ['other','其他']];

export function SiteAnalysisOverviewPanels({ report, onKeyword, onManage, statistics, statisticsError, statisticsLoading = false }: { report: SiteReport; onKeyword: (word: string) => void; onManage?: () => void; statistics?: SiteStatistics | null; statisticsError?: string; statisticsLoading?: boolean }) {
  const { t, locale } = useI18n(), [setupOpen, setSetupOpen] = useState(false);
  const keywords = prioritizeSiteKeywords(report.keywords, report);
  const connected = Boolean(statistics?.connected);
  const statisticsLabel = statisticsError ? t('访问统计读取失败') : statisticsLoading ? t('正在读取访问统计…') : connected ? statistics?.active ? statistics.verified ? t('已接入访问统计') : t('待验证，显示历史统计') : t('站点已删除，保留历史统计') : t('尚未接入数据');
  const percent = (value: number) => `${value.toLocaleString(locale,{ maximumFractionDigits: 1 })}%`;
  const country = (code: string) => { try { return code ? new Intl.DisplayNames([locale],{ type: 'region' }).of(code) || code : t('未识别国家'); } catch { return code; } };
  return <>
    <section className="seo-overview-block" id="seo-overview-panels" aria-labelledby="seo-overview-title"><div className="seo-overview-heading"><h2 id="seo-overview-title">{t('数据概览')}</h2><p>{t('关键词、引擎收录与访问分布')}</p></div><div className="seo-overview-panels">
      <section className="seo-card seo-overview-panel"><div className="seo-panel-title"><h3>{t('关键词总量')}</h3><MagnifyingGlassIcon aria-hidden="true" /></div><strong className="seo-panel-total">{report.keywords.length}</strong><p className="seo-panel-note">{t('去重后的候选词，按站点业务相关度排序，非搜索量')}</p>
        <div className="seo-keyword-scroll" role="region" tabIndex={0} aria-label={t('本轮关键词列表')}>{keywords.length ? keywords.map(word => <button key={word.word} type="button" title={word.word} onClick={() => onKeyword(word.word)}>{word.word}</button>) : <p className="seo-empty">{t('暂无足够内容提取关键词')}</p>}</div>
      </section>
      <section className="seo-card seo-overview-panel"><div className="seo-panel-title"><h3>{t('各大引擎收录量')}</h3><DocumentChartBarIcon aria-hidden="true" /></div><p className="seo-panel-note">{t('各引擎收录统计')}</p><div className="seo-engine-scroll seo-report-scroll" role="region" tabIndex={0} aria-label={t('各大引擎收录量列表')}><dl className="seo-engine-counts">{engineDefinitions.map(engine => <div key={engine.id}><dt><SearchEngineIdentity engine={engine} /></dt><dd><strong>—</strong><small>{t('尚未接入收录统计')}</small><a href={engineSearchUrl(engine.id, `site:${report.host}`, report.options.language)} target="_blank" rel="noreferrer">{t('人工核对')}</a></dd></div>)}</dl></div><p className="seo-panel-note">{t(`本轮读取 ${report.coverage.fetched} 页，不等于搜索引擎收录量。`)}</p></section>
      <section className="seo-card seo-overview-panel"><div className="seo-panel-title"><h3>{t('流量来源占比')}</h3><ChartPieIcon aria-hidden="true" /></div><span className="seo-data-state">{statisticsLabel}</span>{connected && statistics && <p className="seo-panel-note">{t(`近30天：${statistics.sessions}次访问，${statistics.pageviews}次页面浏览`)}</p>}{statisticsError && <p className="seo-panel-note" role="alert">{t(statisticsError)}</p>}<dl className="seo-channel-list">{trafficChannels.map(([id,label]) => <div key={id}><dt>{t(label)}</dt><dd>{connected && statistics?.sessions ? percent(statistics.channels.find(row => row.channel === id)?.share || 0) : '—'}</dd></div>)}</dl><button className="seo-text-button" type="button" aria-expanded={setupOpen} aria-controls="seo-statistics-setup" onClick={() => setSetupOpen(true)}>{t('查看统计接入说明')}</button></section>
      <section className="seo-card seo-overview-panel"><div className="seo-panel-title"><h3>{t('地理分布情况')}</h3><GlobeAltIcon aria-hidden="true" /></div><span className="seo-data-state">{statisticsLabel}</span><div className="seo-country-scroll seo-report-scroll" role="region" tabIndex={0} aria-label={t('国家访问占比列表')}><table className="seo-country-table"><thead><tr><th scope="col">{t('国家')}</th><th scope="col">{t('访问占比')}</th></tr></thead><tbody>{connected && statistics?.countries.length ? statistics.countries.map(row => <tr key={row.code || 'unknown'} className="seo-country-data"><td>{country(row.code)}</td><td>{percent(row.share)}</td></tr>) : <tr><td colSpan={2}><div className="seo-country-empty"><GlobeAltIcon aria-hidden="true" /><p>{t(statisticsLoading ? '正在读取访问统计…' : connected ? '等待首个访问事件' : '接入访问统计后，按国家展示访问占比。')}</p></div></td></tr>}</tbody></table></div>{connected && <p className="seo-panel-note">{t('当前未接入IP地区库，国家暂列为未识别。')}</p>}<button className="seo-text-button" type="button" aria-expanded={setupOpen} aria-controls="seo-statistics-setup" onClick={() => setSetupOpen(true)}>{t('查看统计接入说明')}</button></section>
    </div></section>
    <details id="seo-statistics-setup" className="seo-card seo-statistics-setup" open={setupOpen} onToggle={event => setSetupOpen(event.currentTarget.open)}><summary>{t('访问统计接入说明')}</summary><p className="seo-inline-note">{t('请到站点管理添加域名，将唯一脚本安装到网站后点击验证。验证成功后开始累计访问统计。')}</p>{onManage && <button type="button" className="seo-text-button" onClick={onManage}>{t('前往站点管理')}</button>}<ol>
      <li><strong>{t('添加站点')}</strong><p>{t('每个站点对应一个唯一脚本，验证和访问统计共用。')}</p></li>
      <li><strong>{t('安装统计脚本')}</strong><p>{t('验证时由服务器读取首页确认脚本，不通过伪造访问上报取得验证。')}</p></li>
      <li><strong>{t('开始累计报表')}</strong><p>{t('脚本记录页面路径与来源，按近30天访问会话统计占比；当前未接入IP地区库，国家显示未识别。')}</p></li>
    </ol><p className="seo-inline-note">{t('页面收录量还需要独立的搜索引擎数据来源，安装访问统计脚本不会得到收录数量。')}</p></details>
  </>;
}
