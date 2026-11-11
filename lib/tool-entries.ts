import { handprintToolEntry, mapTool } from './tool-services';
export type ToolRow = Record<string, unknown>;
export type ToolEntrySetting = { tool_slug: string; sort_order: number; enabled: number };
export type AdminToolEntry = ToolRow & { id: number; tool_slug: string; name: string; entry_sort: number; module_key: string; owner_status: string };

export function toolEntryRows(rows: ToolRow[], settings: ToolEntrySetting[], handprintCost?: number): AdminToolEntry[] {
  const configured = new Map(settings.map(row => [row.tool_slug, row]));
  const entries = rows.filter(row => row.tool_slug !== 'handprint-maker').flatMap((row, index) => {
    const entry = { ...row, status: String(row.status), id: Number(row.id), tool_slug: String(row.tool_slug), name: String(row.name),
      entry_sort: index * 10, module_key: '', owner_status: String(row.status) };
    if (row.tool_slug !== 'document-signature') return [entry];
    const handprint = handprintToolEntry(mapTool(row), handprintCost ?? Number(row.tool_points_cost || 0));
    return [entry, { ...entry, tool_slug: handprint.slug, name: handprint.name, description: handprint.description,
      detail: handprint.detail, cover_image: handprint.logo, tool_url: '/tools/handprint-maker.html',
      tool_points_cost: handprint.pointsCost, entry_sort: index * 10 + 1, module_key: 'handprint' }];
  });
  return entries.map(entry => {
    const setting = configured.get(entry.tool_slug);
    return { ...entry, entry_sort: setting ? Number(setting.sort_order) : entry.entry_sort,
      entry_enabled: setting ? Boolean(Number(setting.enabled)) : true,
      status: entry.module_key && setting && !Number(setting.enabled) ? 'inactive' : entry.status };
  }).sort((a, b) => a.entry_sort - b.entry_sort || a.tool_slug.localeCompare(b.tool_slug));
}

export function publicToolOrder<T extends { slug: string }>(tools: T[], settings: ToolEntrySetting[]): T[] {
  const configured = new Map(settings.map(row => [row.tool_slug, row]));
  return tools.map((tool, index) => ({ tool, order: Number(configured.get(tool.slug)?.sort_order ?? index * 10) }))
    .filter(({ tool }) => Number(configured.get(tool.slug)?.enabled ?? 1) !== 0)
    .sort((a, b) => a.order - b.order || a.tool.slug.localeCompare(b.tool.slug)).map(row => row.tool);
}
