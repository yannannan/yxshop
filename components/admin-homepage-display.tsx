"use client";

import { useCallback, useEffect, useState } from 'react';
import { defaultHomepageDisplay, homepageSections, orderItems, orderSections, paginate, validateHomepageDisplay, type HomepageDisplay, type HomepageItem } from '../lib/homepage-display';
import { CatalogPagination } from './catalog-pagination';

export function HomepageDisplayManagement() {
  const [config, setConfig] = useState<HomepageDisplay>(defaultHomepageDisplay);
  const [items, setItems] = useState<HomepageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [scope, setScope] = useState('products');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const load = useCallback(async () => {
    setLoading(true); setReady(false); setNotice('');
    try {
      const response = await fetch('/api/admin/homepage-display', { cache: 'no-store' });
      const result = await response.json() as { config?: unknown; items?: HomepageItem[]; message?: string };
      if (!response.ok) { setNotice(result.message || '配置读取失败'); return; }
      if (!validateHomepageDisplay(result.config) || !Array.isArray(result.items)) throw new Error('Invalid homepage data');
      setConfig(result.config); setItems(result.items); setReady(true); setPage(1);
    } catch { setNotice('配置读取失败，请稍后重试。'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const ranked = orderItems(items, config.itemOrder);
  const categories = [...new Set(items.filter(item => item.product_type !== 'tool').map(item => item.category))];
  const sections = orderSections(homepageSections(categories, config.mode), config.sectionOrder);
  const filtered = ranked.filter(item => (scope === 'tools' ? item.product_type === 'tool' : scope === 'products' ? item.product_type !== 'tool' : item.product_type !== 'tool' && item.category === scope.slice(9)) && `${item.name} ${item.category}`.toLowerCase().includes(keyword.trim().toLowerCase()));
  const result = paginate(filtered, page, 12);
  function moveSection(index: number, offset: number) {
    const next = sections.map(section => section.key);
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setConfig({ ...config, sectionOrder: [...next, ...config.sectionOrder.filter(key => !next.includes(key))] });
  }
  function moveItem(id: number, target: number) {
    const next = ranked.map(item => item.id), left = next.indexOf(id), right = next.indexOf(target);
    [next[left], next[right]] = [next[right], next[left]];
    setConfig({ ...config, itemOrder: next });
  }
  async function save() {
    setSaving(true); setNotice('');
    try {
      const response = await fetch('/api/admin/homepage-display', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
      const result = await response.json() as { message?: string };
      setNotice(response.ok ? '首页展示已保存，刷新商城首页后生效。' : result.message || '保存失败');
    } catch { setNotice('保存失败，请稍后重试。'); }
    finally { setSaving(false); }
  }
  return <><div className="panel-title"><div><h2>首页展示</h2><p>控制“全部商品”的展示方式、模块顺序及条目顺序</p></div><div className="panel-title-actions"><button disabled={loading || saving} onClick={() => void load()}>刷新配置</button><button disabled={!ready || saving} onClick={() => void save()}>{saving ? '正在保存…' : '保存首页展示'}</button></div></div>{notice && <div className="admin-message" role="status">{notice}</div>}
    {ready && <><div className="homepage-display-mode"><label>商品展示方式<select value={config.mode} disabled={saving} onChange={event => setConfig({ ...config, mode: event.target.value as HomepageDisplay['mode'] })}><option value="grouped">按类型分区展示</option><option value="flat">合并为商品列表</option></select></label><p>工具独立为三列区域，首页每页 6 个，独立工具页每页 12 个。普通商品每页 12 件，桌面四列；各模块独立分页。</p></div>
    <h3 className="homepage-admin-title">模块顺序</h3><div className="table-wrap"><table><thead><tr><th>顺序</th><th>首页模块</th><th>操作</th></tr></thead><tbody>{sections.map((section, index) => <tr key={section.key}><td>{index + 1}</td><td>{section.name}</td><td><button className="text-action" disabled={saving || !index} onClick={() => moveSection(index, -1)}>上移</button><button className="text-action" disabled={saving || index === sections.length - 1} onClick={() => moveSection(index, 1)}>下移</button></td></tr>)}</tbody></table></div>
    <h3 className="homepage-admin-title">工具 / 商品顺序</h3><div className="homepage-sort-filter"><select value={scope} onChange={event => { setScope(event.target.value); setPage(1); }}><option value="products">所有普通商品</option><option value="tools">工具服务</option>{categories.map(name => <option key={name} value={`category:${name}`}>{name}</option>)}</select><input placeholder="搜索名称或类型" value={keyword} onChange={event => { setKeyword(event.target.value); setPage(1); }} /></div><div className="table-wrap"><table><thead><tr><th>顺序</th><th>名称</th><th>类型</th><th>状态</th><th>操作</th></tr></thead><tbody>{result.items.map(item => { const index = filtered.findIndex(row => row.id === item.id); return <tr key={item.id}><td>{index + 1}</td><td>{item.name}</td><td>{item.product_type === 'tool' ? '工具服务' : item.category}</td><td>{item.status === 'active' ? '已上架' : '未上架'}</td><td><button className="text-action" disabled={saving || !index} onClick={() => moveItem(item.id, filtered[index - 1].id)}>上移</button><button className="text-action" disabled={saving || index === filtered.length - 1} onClick={() => moveItem(item.id, filtered[index + 1].id)}>下移</button></td></tr>; })}</tbody></table>{!filtered.length && <p className="tool-directory-empty">暂无匹配内容。</p>}</div><CatalogPagination page={result.page} totalPages={result.totalPages} onChange={setPage} label="排序条目分页" /><p className="tool-editor-hint">修改后点击“保存首页展示”。新商品自动追加；只展示已上架内容，未上架商品仍可预先排序。此处顺序独立于商品管理的原有排序。</p></>}
  </>;
}
