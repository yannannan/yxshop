import { env } from '@/db/mysql-runtime';
import { defaultHomepageDisplay, readHomepageDisplay } from './homepage-display';

export async function getHomepageDisplay() {
  try {
    const row = await env.DB.prepare('SELECT config_json FROM homepage_display_settings WHERE id=1').first<{ config_json: string }>();
    return readHomepageDisplay(row?.config_json);
  } catch (error) {
    if ((error as { code?: string }).code !== 'ER_NO_SUCH_TABLE') console.error('首页展示配置读取失败', error);
    return defaultHomepageDisplay();
  }
}
