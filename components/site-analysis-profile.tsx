import { ArrowTopRightOnSquareIcon, ChevronDownIcon, DocumentTextIcon, GlobeAltIcon, InformationCircleIcon, ServerStackIcon } from '@heroicons/react/24/outline';
import { useI18n } from './language-provider';
import type { SiteReport } from '../lib/site-analysis';

const safeHref = (value: string) => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return undefined; } };

function MetadataField({ label, field, value, limit }: { label: string; field: string; value: string; limit: number }) {
  const { t } = useI18n(), length = Array.from(value).length;
  return <div className="seo-profile-field seo-metadata-field"><dt><span>{t(label)}</span><small lang="en">{field}</small></dt><dd><p className={!value ? 'seo-profile-missing' : undefined}>{value || t('页面未设置或尚未读取')}</p><small className={length > limit ? 'seo-length-over' : 'seo-length-note'}>{t(`建议不超过 ${limit} 字，当前 ${length} 字`)}</small></dd></div>;
}

export function SiteAnalysisProfile({ report, date }: { report: SiteReport; date: (value: string) => string }) {
  const { t } = useI18n(), p = report.profile, home = report.pages[0];
  const text = (value: string | null | undefined) => value || t('尚未获取');
  const title = p.title || home?.title || '', description = p.description || home?.description || '', keywords = home?.declared.join('、') || '';
  return <section className="seo-card seo-profile" id="seo-domain-profile" aria-labelledby="seo-site-profile-title">
    <div className="seo-section-title"><div className="seo-profile-identity"><span className="seo-heading-icon"><GlobeAltIcon aria-hidden="true" /></span><div><h2 id="seo-site-profile-title">{t('站点基本信息')}</h2><p>{p.name || title || p.host}</p></div></div><a className="seo-profile-link" href={safeHref(p.finalUrl || `https://${p.host}`)} target="_blank" rel="noreferrer">{p.host}<ArrowTopRightOnSquareIcon aria-hidden="true" /></a></div>
    <div className="seo-profile-columns">
      <section className="seo-profile-section" aria-labelledby="seo-page-metadata-title"><h3 id="seo-page-metadata-title"><DocumentTextIcon aria-hidden="true" />{t('页面信息')}</h3>
        <dl className="seo-metadata-list">
          <MetadataField label="网站标题" field="Title" value={title} limit={39} />
          <MetadataField label="网站关键词" field="Keywords" value={keywords} limit={100} />
          <MetadataField label="网站描述" field="Description" value={description} limit={68} />
        </dl>
        <p className="seo-profile-guidance">{t('以上为建议字符数，超出仅提示，不会截断或修改网站原文。')}</p>
      </section>
      <section className="seo-profile-section" aria-labelledby="seo-site-overview-title"><h3 id="seo-site-overview-title"><ServerStackIcon aria-hidden="true" />{t('站点概况')}</h3>
        <dl className="seo-profile-facts">
          <div className="seo-profile-field"><dt>{t('所属行业')}</dt><dd>{p.industry ? t(p.industry) : t('尚未识别')}{p.industry && <small className="seo-profile-inferred">{t('自动推测')}</small>}</dd></div>
          <div className="seo-profile-field"><dt>{t('当前解析IP')}</dt><dd className="seo-profile-addresses">{p.addresses.join(' / ') || t('尚未获取')}</dd></div>
          <div className="seo-profile-field"><dt>{t('域名注册时间')}</dt><dd>{p.registeredAt ? date(p.registeredAt) : t('尚未获取')}</dd></div>
          <div className="seo-profile-field"><dt>{t('公开注册主体')}</dt><dd>{p.registrant || t(p.registrationState === 'complete' ? '未公开或数据源未提供' : '尚未获取')}</dd></div>
          <div className="seo-profile-field"><dt>{t('访问状态')}</dt><dd>{p.httpStatus ?? '—'} · {p.https === null ? '—' : p.https ? 'HTTPS' : 'HTTP'}</dd></div>
          <div className="seo-profile-field"><dt>{t('网站语言')}</dt><dd>{text(p.language)}</dd></div>
        </dl>
      </section>
    </div>
    <details className="seo-domain-archive" open><summary><span className="seo-archive-title"><ServerStackIcon aria-hidden="true" />{t('完整域名档案')}</span><ChevronDownIcon className="seo-archive-chevron" aria-hidden="true" /></summary><dl className="seo-profile-extra">
      <div className="seo-profile-field"><dt>{t('注册商')}</dt><dd>{text(p.registrar)}</dd></div>
      <div className="seo-profile-field"><dt>{t('到期时间')}</dt><dd>{p.expiresAt ? date(p.expiresAt) : t('尚未获取')}</dd></div>
      <div className="seo-profile-field"><dt>{t('域名状态')}</dt><dd>{p.domainStatus.join(' / ') || t('尚未获取')}</dd></div>
      <div className="seo-profile-field"><dt>DNS</dt><dd>{p.nameservers.join(' / ') || t('尚未获取')}</dd></div>
      <div className="seo-profile-field"><dt>CNAME</dt><dd>{p.cname.join(' / ') || t('尚未获取')}</dd></div>
      <div className="seo-profile-field"><dt>{t('采集时间')}</dt><dd>{date(report.collectedAt)}</dd></div>
      <div className="seo-profile-field"><dt>{t('注册信息来源')}</dt><dd>{p.registrationSource ? <a href={safeHref(p.registrationSource)} target="_blank" rel="noreferrer">{p.registrationSource}</a> : t('尚未获取')}</dd></div>
    </dl><p className="seo-profile-caveat"><InformationCircleIcon aria-hidden="true" /><span>{t('解析IP可能是CDN节点；注册时间不等于网站上线时间；注册主体以公开信息为准。')}</span></p></details>
  </section>;
}
