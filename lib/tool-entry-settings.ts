import { env } from '@/db/mysql-runtime';
import type { ToolEntrySetting } from './tool-entries';
export async function readToolEntrySettings() {
  try { return { ready: true, settings: (await env.DB.prepare('SELECT tool_slug,sort_order,enabled FROM tool_entry_settings ORDER BY sort_order,tool_slug').all<ToolEntrySetting>()).results }; }
  catch (error) { if ((error as { code?: string })?.code === 'ER_NO_SUCH_TABLE') return { ready: false, settings: [] as ToolEntrySetting[] }; throw error; }
}
