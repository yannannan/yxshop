import { useI18n } from './language-provider';
import type { engineDefinitions } from '../lib/site-analysis';

// Small, locally stored official favicons do not need an image optimizer request.
/* eslint-disable @next/next/no-img-element */
export function SearchEngineIdentity({ engine, showDomain = false }: { engine: typeof engineDefinitions[number]; showDomain?: boolean }) {
  const { t } = useI18n();
  return <span className="seo-engine-identity"><img src={engine.icon} alt="" width={22} height={22} decoding="async" /><span><strong>{t(engine.name)}</strong>{showDomain && <small>{engine.domain}</small>}</span></span>;
}
