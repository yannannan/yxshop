// Shared by the browser and server. The short ID losslessly encodes the site's
// permanent UUID, so existing sites need neither new keys nor a database migration.
export const siteScriptOrigin = 'https://www.yxstar.shop';
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function siteScriptId(id: string) {
  if (!uuidPattern.test(id)) return '';
  const bytes = id.replaceAll('-', '').replace(/../g, byte => String.fromCharCode(parseInt(byte,16)));
  return btoa(bytes).replaceAll('+','-').replaceAll('/','_').replace(/=+$/, '');
}
export function siteIdFromScriptId(value: string) {
  if (!/^[a-zA-Z0-9_-]{22}$/.test(value)) return '';
  try {
    const hex = Array.from(atob(value.replaceAll('-','+').replaceAll('_','/') + '=='), byte => byte.charCodeAt(0).toString(16).padStart(2,'0')).join('');
    if (hex.length !== 32) return '';
    const id = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    return siteScriptId(id) === value ? id : '';
  } catch { return ''; }
}
export function siteScriptUrl(id: string) {
  const key = siteScriptId(id);
  return key ? `${siteScriptOrigin}/s/${key}` : '';
}
export function siteScriptSnippet(id: string) {
  const url = siteScriptUrl(id);
  return url ? `<script async src="${url}"></script>` : '';
}
