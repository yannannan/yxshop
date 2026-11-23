import { getI18n } from '@/lib/i18n-server';
import { getPageMetadata } from '@/lib/page-seo-server';
import { LanguageProvider } from '@/components/language-provider';
import { ToolActivity } from '@/components/tool-activity';
import { MobileAccess } from '@/components/mobile-access';
import { GlassEffects } from '@/components/glass-effects';
import './globals.css';
import './extra.css';
import './refined.css';
import './flow.css';
import './technical-services.css';
import './technician/technician.css';
import './tools.css';
import './storefront-banners.css';
import './storefront-navigation.css';
import './stamp-maker.css';
import './homepage-display.css';
import './points.css';
import './video-extractor.css';
import './account.css';
import './language.css';
import './site-analysis.css';
import './image-processor.css';
import './document-signature.css';
import './tool-admin.css';
import './disk-cleaner.css';
import './consultation-chat.css';
import './mobile-access.css';
import './ai-leads.css';
import './ai-leads-landing.css';
// Shared glass surfaces load after each feature's structural stylesheet.
import './glass-theme.css';
export async function generateMetadata() { return getPageMetadata('home'); }
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { locale } = await getI18n();
  return <html lang={locale}><head><script async src="https://www.yxstar.shop/s/RDYfVdtkRd-iXLHGxvrdEA" data-exclude-path="/admin" /></head><body data-ui-theme="glass"><LanguageProvider locale={locale}><GlassEffects /><ToolActivity />{children}<MobileAccess /></LanguageProvider></body></html>;
}
