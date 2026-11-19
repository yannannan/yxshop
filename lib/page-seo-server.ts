import { getI18n } from './i18n-server';
import { buildPageMetadata, buildToolMetadata, type SeoOptions, type SeoPage } from './page-seo';
import type { ToolService } from './tool-services';

export async function getPageMetadata(page: SeoPage, options: SeoOptions = {}) {
  const { locale } = await getI18n();
  return buildPageMetadata(page, { ...options, locale });
}

export async function getToolMetadata(tool: ToolService) {
  const { locale, t } = await getI18n();
  return buildToolMetadata({ ...tool, name: t(tool.name), description: t(tool.description), detail: t(tool.detail), seoTitle: t(tool.seoTitle), seoDescription: t(tool.seoDescription) }, { locale });
}
