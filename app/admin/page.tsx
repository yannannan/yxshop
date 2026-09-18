'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseProductAttributes } from '../../lib/catalog';

type Row = Record<string, string | number | null>;
type Data = { products: Row[]; users: Row[]; orders: Row[]; credentials: Row[]; credentialAssignments: Row[]; qrs: Row[]; categories: Row[]; notificationSettings: Row[]; emailConfig: Row | null };
type ProductForm = { id?: number; name: string; category: string; subcategory: string; price: string; costPrice: string; oldPrice: string; billingCycle: string; stock: string; description: string; detail: string; attributesText: string; tag: string; tone: string; initial: string; coverImage: string; detailImage: string };
type CredentialForm = { id?: number; productId: number; account: string; password: string; emailAuthCode: string; verificationUrl: string; costPrice: string; salePrice: string };
type CategoryForm = { id?: number; name: string; parentId: string; sort: string; status: string };
type QrForm = { id?: number; productId: number; name: string; type: 'wechat' | 'alipay'; amount: string; imageUrl: string };
type ConfirmTarget = { title: string; description: string; confirmText: string; danger?: boolean; body: Record<string, string | number> };
type OrderListTab = 'all' | 'pending' | 'paid' | 'pending_delivery' | 'delivered' | 'closed';
type ProductListTab = 'all' | 'active' | 'inactive' | 'closed';
type CredentialListTab = 'all' | 'used' | 'disabled' | 'closed';

const tabs = [
  { key: 'products', label: '商品管理', icon: '◇' },
  { key: 'categories', label: '分类管理', icon: '▤' },
  { key: 'orders', label: '订单管理', icon: '▣' },
  { key: 'users', label: '用户管理', icon: '◎' },
  { key: 'credentials', label: '账号 / 卡密', icon: '⌘' },
  { key: 'notifications', label: '订单通知', icon: '✉' },
] as const;

const emptyData: Data = { products: [], users: [], orders: [], credentials: [], credentialAssignments: [], qrs: [], categories: [], notificationSettings: [], emailConfig: null };
const text = (value: unknown) => String(value ?? '');
const emptyProduct = (): ProductForm => ({ name: '', category: '', subcategory: '', price: '', costPrice: '0', oldPrice: '', billingCycle: 'once', stock: '0', description: '', detail: '', attributesText: '', tag: '在售', tone: 'dark', initial: '', coverImage: '', detailImage: '' });
const attributeText = (value: unknown) => parseProductAttributes(value).map((item) => `${item.name}：${item.value}`).join('\n');
const emptyCategory = (): CategoryForm => ({ name: '', parentId: '', sort: '0', status: 'active' });
const paymentTypeLabel = (type: string) => type === 'alipay' ? '支付宝' : type === 'wechat' ? '微信支付' : type;
const billingCycleLabel = (cycle: string) => ({ once: '一次性', day: '按天', week: '按周', month: '按月', year: '按年', times: '按次' }[cycle] || '一次性');
const formatTime = (value: string) => value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)).replace(/\//g, '-') : '—';
const orderListTabs: { key: OrderListTab; label: string }[] = [{ key: 'all', label: '全部订单' }, { key: 'pending', label: '待支付' }, { key: 'paid', label: '已支付' }, { key: 'pending_delivery', label: '待发货' }, { key: 'delivered', label: '已发货' }, { key: 'closed', label: '已作废' }];
const productListTabs: { key: ProductListTab; label: string }[] = [{ key: 'all', label: '全部商品' }, { key: 'active', label: '已上架' }, { key: 'inactive', label: '已下架' }, { key: 'closed', label: '已作废' }];
const credentialListTabs: { key: CredentialListTab; label: string }[] = [{ key: 'all', label: '全部账号' }, { key: 'used', label: '正在使用' }, { key: 'disabled', label: '已停用' }, { key: 'closed', label: '已作废' }];
const orderStatTabs = orderListTabs.filter((tab) => tab.key !== 'closed');
const orderStatDescription: Record<OrderListTab, string> = { all: '全部订单总览', pending: '等待用户支付', paid: '管理员已确认收款', pending_delivery: '客户已确认，等待发货', delivered: '已完成交付', closed: '已作废订单' };

export default function AdminPage() {
  const [active, setActive] = useState<(typeof tabs)[number]['key']>('products');
  const [data, setData] = useState<Data>(emptyData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');
  const [productForm, setProductForm] = useState<ProductForm | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<number[]>([]);
  const [delivery, setDelivery] = useState<{ id: string; productId: number; credentialId: number; content: string } | null>(null);
  const [credentialForm, setCredentialForm] = useState<CredentialForm | null>(null);
  const [credentialAssignmentsView, setCredentialAssignmentsView] = useState<{ credential: Row; assignments: Row[] } | null>(null);
  const [qrForm, setQrForm] = useState<QrForm | null>(null);
  const [qrImageError, setQrImageError] = useState('');
  const [productQr, setProductQr] = useState<Row | null>(null);
  const [productQrDetails, setProductQrDetails] = useState<Row[]>([]);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [orderStatusForm, setOrderStatusForm] = useState<{ id: string; status: string } | null>(null);
  const [orderFilters, setOrderFilters] = useState({ keyword: '', startDate: '', endDate: '' });
  const [productFilters, setProductFilters] = useState({ keyword: '', category: '' });
  const [productListTab, setProductListTab] = useState<ProductListTab>('all');
  const [productPage, setProductPage] = useState(1);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [credentialListTab, setCredentialListTab] = useState<CredentialListTab>('all');
  const [selectedCredentialIds, setSelectedCredentialIds] = useState<number[]>([]);
  const [orderListTab, setOrderListTab] = useState<OrderListTab>('all');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [productImageError, setProductImageError] = useState('');
  const [uploadingProductImage, setUploadingProductImage] = useState<'coverImage' | 'detailImage' | null>(null);
  const [rechargeJsonView, setRechargeJsonView] = useState<{ id: string; json: string } | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await fetch(`/api/admin/summary?refresh=${Date.now()}`, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
      if (!response.ok) throw new Error('读取失败');
      setData(await response.json() as Data);
    } catch {
      setNotice('数据读取失败，请刷新后重试');
    } finally {
      if (background) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const refreshWhenBack = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    window.addEventListener('focus', refreshWhenBack);
    document.addEventListener('visibilitychange', refreshWhenBack);
    return () => {
      window.removeEventListener('focus', refreshWhenBack);
      document.removeEventListener('visibilitychange', refreshWhenBack);
    };
  }, [load]);

  useEffect(() => {
    const smtp = document.querySelector<HTMLInputElement>('input[name="smtpPassword"]');
    const imap = document.querySelector<HTMLInputElement>('input[name="imapPassword"]');
    if (smtp) { smtp.type = 'text'; smtp.value = text(data.emailConfig?.smtp_password); }
    if (imap) { imap.type = 'text'; imap.value = text(data.emailConfig?.imap_password); }
    const saveButton = document.querySelector<HTMLButtonElement>('.email-config-form .admin-form-actions button[type="submit"], .email-config-form .admin-form-actions button:not([type])');
    if (saveButton) saveButton.textContent = '保存邮箱配置';
    const form = document.querySelector<HTMLElement>('.email-config-form');
    const sections = form?.querySelectorAll<HTMLElement>('.mail-config-section');
    const actions = form?.querySelector<HTMLElement>('.admin-form-actions');
    if (sections?.[1] && actions) sections[1].append(actions);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, data.emailConfig, data.notificationSettings]);

  async function action(body: Record<string, string | number>) {
    setNotice('');
    const response = await fetch('/api/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json() as { message?: string };
    if (!response.ok) {
      setNotice(result.message || '操作未完成');
      return false;
    }
    await load();
    if (result.message) setNotice(result.message);
    return true;
  }

  const parents = useMemo(() => data.categories.filter((item) => !item.parent_id), [data.categories]);
  const childrenFor = useCallback((category: string) => {
    const parent = parents.find((item) => text(item.name) === category);
    return parent ? data.categories.filter((item) => Number(item.parent_id) === Number(parent.id)) : [];
  }, [data.categories, parents]);
  const filteredProducts = useMemo(() => {
    const keyword = productFilters.keyword.trim().toLowerCase();
    return data.products.filter((product) => {
      const searchable = `${text(product.name)} ${text(product.category)} ${text(product.subcategory)} ${text(product.id)}`.toLowerCase();
      return (!keyword || searchable.includes(keyword)) &&
        (!productFilters.category || text(product.category) === productFilters.category) &&
        (productListTab === 'all' ? text(product.status) !== 'closed' : text(product.status) === productListTab);
    });
  }, [data.products, productFilters, productListTab]);
  const productPageCount = Math.max(1, Math.ceil(filteredProducts.length / 10));
  const currentProductPage = Math.min(productPage, productPageCount);
  const paginatedProducts = filteredProducts.slice((currentProductPage - 1) * 10, currentProductPage * 10);
  const visibleProductIds = paginatedProducts.map((product) => Number(product.id));
  const selectedVisibleProductIds = visibleProductIds.filter((productId) => selectedProductIds.includes(productId));
  const allVisibleProductsSelected = visibleProductIds.length > 0 && visibleProductIds.every((productId) => selectedProductIds.includes(productId));
  const availableCards = data.credentials.filter((item) => item.status === 'available').length;
  const filteredCredentials = useMemo(() => data.credentials.filter((credential) => credentialListTab === 'all' ? text(credential.status) !== 'closed' : text(credential.status) === credentialListTab), [data.credentials, credentialListTab]);
  const closedCredentialIds = filteredCredentials.filter((credential) => text(credential.status) === 'closed').map((credential) => Number(credential.id));
  const selectedClosedCredentialIds = closedCredentialIds.filter((credentialId) => selectedCredentialIds.includes(credentialId));
  const allClosedCredentialsSelected = closedCredentialIds.length > 0 && closedCredentialIds.every((credentialId) => selectedCredentialIds.includes(credentialId));
  const pendingOrders = data.orders.filter((item) => ['pending', 'paid', 'pending_delivery'].includes(text(item.status))).length;
  const filteredOrders = useMemo(() => {
    const keyword = orderFilters.keyword.trim().toLowerCase();
    return data.orders.filter((order) => {
      const orderDate = text(order.created_at).slice(0, 10);
      const searchable = `${text(order.id)} ${text(order.product_name)} ${text(order.phone)} ${text(order.email)}`.toLowerCase();
      return (!keyword || searchable.includes(keyword)) &&
        (orderListTab === 'all' ? text(order.status) !== 'closed' : text(order.status) === orderListTab) &&
        (!orderFilters.startDate || orderDate >= orderFilters.startDate) &&
        (!orderFilters.endDate || orderDate <= orderFilters.endDate);
    });
  }, [data.orders, orderFilters, orderListTab]);
  const selectableOrders = filteredOrders.filter((order) => orderListTab === 'closed' ? text(order.status) === 'closed' : text(order.status) !== 'closed');
  const selectedVisibleOrderIds = selectableOrders.map((order) => text(order.id)).filter((orderId) => selectedOrderIds.includes(orderId));
  const allSelectableOrdersSelected = selectableOrders.length > 0 && selectableOrders.every((order) => selectedOrderIds.includes(text(order.id)));
  const currentProductQrs = productQrDetails;
  const availableDeliveryCredentials = delivery ? data.credentials.filter((credential) => Number(credential.product_id) === delivery.productId && (text(credential.status) === 'available' || Number(credential.id) === delivery.credentialId)) : [];
  const selectedDeliveryCredential = delivery ? data.credentials.find((credential) => Number(credential.id) === delivery.credentialId) : undefined;

  function startProduct(product?: Row) {
    setProductImageError('');
    if (!product) {
      const firstCategory = parents.find((item) => item.status === 'active');
      const category = firstCategory ? text(firstCategory.name) : '';
      const firstSubcategory = childrenFor(category).find((item) => item.status === 'active');
      setProductForm({ ...emptyProduct(), category, subcategory: firstSubcategory ? text(firstSubcategory.name) : '' });
      return;
    }
    setProductForm({
      id: Number(product.id), name: text(product.name), category: text(product.category), subcategory: text(product.subcategory), price: text(product.price), costPrice: text(product.cost_price || 0), oldPrice: text(product.old_price), billingCycle: text(product.billing_cycle) || 'once', stock: text(product.stock), description: text(product.description), detail: text(product.detail), attributesText: attributeText(product.attributes_json), tag: text(product.tag) || '在售', tone: text(product.tone) || 'dark', initial: text(product.initial), coverImage: text(product.cover_image), detailImage: text(product.detail_image),
    });
  }

  function startCategory(category?: Row) {
    setCategoryForm(category ? { id: Number(category.id), name: text(category.name), parentId: category.parent_id ? text(category.parent_id) : '', sort: text(category.sort), status: text(category.status) } : emptyCategory());
  }

  function startQr(qr: Row) {
    setQrImageError('');
    setQrForm({ id: qr.id ? Number(qr.id) : undefined, productId: Number(qr.product_id), name: text(qr.name), type: qr.type === 'alipay' ? 'alipay' : 'wechat', amount: text(qr.amount), imageUrl: text(qr.image_url) });
  }

  function startProductQr(product: Row) {
    setProductQr(product);
    setProductQrDetails([]);
    const productId = Number(product.id);
    const amount = Number(product.price);
    fetch(`/api/admin?resource=payment-qrs&productId=${encodeURIComponent(productId)}&amount=${encodeURIComponent(amount)}`, { cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() : [])
      .then((result: unknown) => setProductQrDetails(Array.isArray(result) ? result as Row[] : []))
      .catch(() => setProductQrDetails([]));
  }

  function startCredential(credential?: Row) {
    if (credential) {
      setCredentialForm({ id: Number(credential.id), productId: Number(credential.product_id), account: text(credential.account || credential.content), password: text(credential.password), emailAuthCode: text(credential.email_auth_code), verificationUrl: text(credential.verification_url), costPrice: text(credential.cost_price || 0), salePrice: text(credential.sale_price || credential.product_price || 0) });
      return;
    }
    const product = data.products.find((item) => text(item.status) !== 'closed') || data.products[0];
    setCredentialForm({ productId: Number(product?.id || 0), account: '', password: '', emailAuthCode: '', verificationUrl: '', costPrice: '0', salePrice: text(product?.price || 0) });
  }

  function confirmStatus(title: string, description: string, body: Record<string, string | number>) {
    setConfirmTarget({ title, description, confirmText: '确认修改', body });
  }

  function toggleProductSelection(productId: number) {
    setSelectedProductIds((items) => items.includes(productId) ? items.filter((id) => id !== productId) : [...items, productId]);
  }

  function toggleAllProductSelection() {
    setSelectedProductIds(allVisibleProductsSelected ? selectedProductIds.filter((id) => !visibleProductIds.includes(id)) : Array.from(new Set([...selectedProductIds, ...visibleProductIds])));
  }

  function requestBatchProductDelete() {
    if (productListTab !== 'closed' || !selectedVisibleProductIds.length) return;
    setConfirmTarget({ title: '批量删除商品', description: `确定永久删除已勾选的 ${selectedVisibleProductIds.length} 件商品吗？其中任一商品存在历史订单时，本次删除会整体取消。`, confirmText: '确认批量删除', danger: true, body: { action: 'product-batch-delete', productIds: selectedVisibleProductIds.join(',') } });
  }

  function toggleCredentialSelection(credentialId: number) {
    setSelectedCredentialIds((items) => items.includes(credentialId) ? items.filter((id) => id !== credentialId) : [...items, credentialId]);
  }

  function toggleAllCredentialSelection() {
    setSelectedCredentialIds(allClosedCredentialsSelected ? selectedCredentialIds.filter((id) => !closedCredentialIds.includes(id)) : Array.from(new Set([...selectedCredentialIds, ...closedCredentialIds])));
  }

  function requestBatchCredentialDelete() {
    if (credentialListTab !== 'closed' || !selectedClosedCredentialIds.length) return;
    setConfirmTarget({ title: '批量删除已作废账号', description: `确定永久删除已勾选的 ${selectedClosedCredentialIds.length} 个账号吗？关联历史也会一并删除，且无法恢复。`, confirmText: '确认永久删除', danger: true, body: { action: 'credential-batch-delete', credentialIds: selectedClosedCredentialIds.join(',') } });
  }

  function toggleOrderSelection(orderId: string) {
    setSelectedOrderIds((items) => items.includes(orderId) ? items.filter((id) => id !== orderId) : [...items, orderId]);
  }

  function toggleAllOrderSelection() {
    setSelectedOrderIds(allSelectableOrdersSelected ? [] : selectableOrders.map((order) => text(order.id)));
  }

  function requestBatchVoid() {
    if (!selectedVisibleOrderIds.length) return;
    setConfirmTarget({ title: '批量作废订单', description: `确定作废已勾选的 ${selectedVisibleOrderIds.length} 笔订单吗？作废后前台将不再展示这些订单。`, confirmText: '确认批量作废', danger: true, body: { action: 'order-batch-status', orderIds: selectedVisibleOrderIds.join(','), status: 'closed' } });
  }

  function requestBatchDelete() {
    if (!selectedVisibleOrderIds.length) return;
    setConfirmTarget({ title: '批量删除已作废订单', description: `确定永久删除已勾选的 ${selectedVisibleOrderIds.length} 笔已作废订单吗？此操作无法恢复。`, confirmText: '确认永久删除', danger: true, body: { action: 'order-batch-delete', orderIds: selectedVisibleOrderIds.join(',') } });
  }

  function selectQrImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setQrImageError('请上传图片格式的二维码'); return; }
    if (file.size > 1024 * 1024) { setQrImageError('二维码图片不能超过 1MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setQrForm((form) => form ? { ...form, imageUrl: String(reader.result || '') } : form);
      setQrImageError('');
    };
    reader.readAsDataURL(file);
  }

  async function uploadProductImage(field: 'coverImage' | 'detailImage', file?: File) {
    if (!file) return;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) { setProductImageError('仅支持 JPG、PNG、WebP 图片'); return; }
    if (file.size > 500 * 1024 * 1024) { setProductImageError('图片不能超过 500MB'); return; }
    setProductImageError('');
    setUploadingProductImage(field);
    try {
      const payload = new FormData();
      payload.set('file', file);
      const response = await fetch('/api/product-images', { method: 'POST', body: payload });
      const result = await response.json() as { url?: string; message?: string };
      if (!response.ok || !result.url) { setProductImageError(result.message || '图片上传失败'); return; }
      setProductForm((form) => form ? { ...form, [field]: result.url! } : form);
    } catch {
      setProductImageError('图片上传失败，请重试');
    } finally {
      setUploadingProductImage(null);
    }
  }

  return <main className="admin-shell">
    <aside className="admin-sidebar">
      <Link className="brand admin-brand" href="/"><span className="brand-mark"><Image src="/yxstar_logo.png" alt="宇星商城 Logo" fill sizes="34px" /></span><span>宇星商城</span></Link>
      <small>商城管理</small>
      <nav>{tabs.map((tab) => <button key={tab.key} className={active === tab.key ? 'active' : ''} onClick={() => { setActive(tab.key); void load(true); }}><span>{tab.icon}</span>{tab.label}{tab.key === 'orders' && pendingOrders > 0 && <em>{pendingOrders}</em>}</button>)}</nav>
      <div className="admin-user"><span>管</span><div><b>管理员</b><small>admin@qx.shop</small></div></div>
    </aside>
    <section className="admin-main">
      <header><div><span className="section-kicker">STORE CONSOLE</span><h1>{tabs.find((item) => item.key === active)?.label}</h1></div><div><Link href="/" target="_blank" rel="noopener noreferrer">查看商城</Link><button disabled={refreshing} onClick={() => void load(true)}>{refreshing ? '正在刷新…' : '↻ 刷新数据'}</button></div></header>
      {active === 'orders' ? <div className="order-stat-grid">{orderStatTabs.map((tab) => <button type="button" key={tab.key} className={`order-stat-card ${tab.key}${orderListTab === tab.key ? ' active' : ''}`} onClick={() => setOrderListTab(tab.key)}><span>{tab.label}</span><b>{tab.key === 'all' ? data.orders.filter((order) => text(order.status) !== 'closed').length : data.orders.filter((order) => text(order.status) === tab.key).length}</b><small>{orderStatDescription[tab.key]}</small><i>→</i></button>)}</div> : <div className="stat-grid"><article><span>商品总数</span><b>{data.products.filter((item) => item.status !== 'closed').length}</b><small>在售 {data.products.filter((item) => item.status === 'active').length} 件</small></article><article><span>分类数量</span><b>{data.categories.length}</b><small>支持一级、二级分类</small></article><article><span>待处理订单</span><b>{pendingOrders}</b><small>请及时核对支付</small></article><article><span>可用卡密</span><b>{availableCards}</b><small>库存不足请补充</small></article></div>}
      <div className="admin-panel">
        {notice && <div className="admin-message">{notice}</div>}
        {loading ? <div className="admin-loading">正在读取数据…</div> : <>
          {active === 'products' && <>
            <div className="panel-title"><div><h2>商品列表</h2><p>可维护商品分类、价格、库存及前台详情内容</p></div><div className="panel-title-actions"><button className="refresh-list-button" disabled={refreshing} onClick={() => void load(true)}>{refreshing ? '正在刷新…' : '↻ 刷新列表'}</button><button onClick={() => startProduct()}>＋ 新增商品</button></div></div>
            <div className="order-tabs product-tabs">{productListTabs.map((tab) => <button key={tab.key} className={`${productListTab === tab.key ? 'active ' : ''}${tab.key === 'closed' ? 'void-tab' : ''}`} onClick={() => { setProductListTab(tab.key); setProductPage(1); setSelectedProductIds([]); }}>{tab.label} <span>{tab.key === 'all' ? data.products.filter((product) => text(product.status) !== 'closed').length : data.products.filter((product) => text(product.status) === tab.key).length}</span></button>)}</div>
            <div className="product-filter"><b>筛选条件</b><input value={productFilters.keyword} onChange={(event) => { setProductFilters({ ...productFilters, keyword: event.target.value }); setProductPage(1); }} placeholder="商品名称、分类或商品 ID" /><select value={productFilters.category} onChange={(event) => { setProductFilters({ ...productFilters, category: event.target.value }); setProductPage(1); }}><option value="">全部分类</option>{parents.map((item) => <option key={text(item.id)} value={text(item.name)}>{text(item.name)}</option>)}</select><small>{productListTab === 'closed' ? `已选 ${selectedVisibleProductIds.length} / ` : ''}共 {filteredProducts.length} 件</small><button type="button" onClick={() => { setProductFilters({ keyword: '', category: '' }); setProductPage(1); }}>重置</button>{productListTab === 'closed' && <button type="button" className="product-batch-delete" disabled={!selectedVisibleProductIds.length} onClick={requestBatchProductDelete}>批量删除</button>}</div>
            <div className="table-wrap"><table><thead><tr>{productListTab === 'closed' && <th className="order-select-cell"><input type="checkbox" aria-label="全选当前页已作废商品" checked={allVisibleProductsSelected} disabled={!paginatedProducts.length} onChange={toggleAllProductSelection} /></th>}<th>排序</th><th>商品</th><th>分类</th><th>售价 / 周期</th><th>成本</th><th>库存</th><th>支付配置状态</th><th>上架状态</th><th>操作</th></tr></thead><tbody>{paginatedProducts.map((product, productPageIndex) => { const productId = Number(product.id); const isClosed = text(product.status) === 'closed'; const paymentConfigured = data.qrs.some((qr) => Number(qr.product_id) === productId && Number(qr.amount) === Number(product.price) && text(qr.status) === 'active' && Boolean(text(qr.image_url))); const productPosition = (currentProductPage - 1) * 10 + productPageIndex; const previousProduct = filteredProducts[productPosition - 1]; const nextProduct = filteredProducts[productPosition + 1]; return <tr key={text(product.id)}>{productListTab === 'closed' && <td className="order-select-cell"><input type="checkbox" aria-label={`选择商品 ${text(product.name)}`} checked={selectedProductIds.includes(productId)} onChange={() => toggleProductSelection(productId)} /></td>}<td className="product-sort-cell">{isClosed ? <span>—</span> : <><button type="button" aria-label={`上移 ${text(product.name)}`} title="上移" disabled={!previousProduct} onClick={() => previousProduct && void action({ action: 'product-sort', id: productId, targetId: Number(previousProduct.id) })}>↑</button><button type="button" aria-label={`下移 ${text(product.name)}`} title="下移" disabled={!nextProduct} onClick={() => nextProduct && void action({ action: 'product-sort', id: productId, targetId: Number(nextProduct.id) })}>↓</button></>}<small>#{text(product.sort_order)}</small></td><td><div className="admin-product-cell">{text(product.cover_image) ? <Image unoptimized src={text(product.cover_image)} alt="" width={44} height={44} /> : <span>{text(product.initial) || '图'}</span>}<div><b>{text(product.name)}</b><small>商品 ID：{text(product.id)}</small></div></div></td><td>{text(product.category)}<small>{text(product.subcategory)}</small></td><td className="money">¥{text(product.price)}<small>{billingCycleLabel(text(product.billing_cycle))}</small></td><td className="cost-money">¥{text(product.cost_price || 0)}</td><td>{text(product.stock)}</td><td><span className={`payment-config-status ${paymentConfigured ? 'configured' : 'unconfigured'}`}>{paymentConfigured ? '已配置' : '未配置'}</span></td><td><Status value={text(product.status)} activeLabel="已上架" /></td><td>{!isClosed && <><button className="text-action" onClick={() => startProduct(product)}>编辑</button><button className="text-action" onClick={() => startProductQr(product)}>支付二维码</button><button className="text-action" onClick={() => confirmStatus('变更商品状态', `确定${product.status === 'active' ? '下架' : '上架'}“${text(product.name)}”吗？`, { action: 'product-status', id: productId, status: product.status === 'active' ? 'inactive' : 'active' })}>{product.status === 'active' ? '下架' : '上架'}</button></>}<button className="text-action" onClick={() => setConfirmTarget({ title: '克隆商品', description: `确定克隆“${text(product.name)}”吗？新商品将默认下架，支付二维码不会复制。`, confirmText: '确认克隆', body: { action: 'product-clone', id: productId } })}>克隆</button>{isClosed ? <button className="text-action danger-action" onClick={() => setConfirmTarget({ title: '永久删除商品', description: `确定永久删除已作废商品“${text(product.name)}”吗？商品已有历史订单时系统会拒绝删除。`, confirmText: '确认永久删除', danger: true, body: { action: 'product-delete', id: productId } })}>删除</button> : <button className="text-action danger-action" onClick={() => setConfirmTarget({ title: '作废商品', description: `确定作废“${text(product.name)}”吗？作废后商城前台将不再展示。`, confirmText: '确认作废', danger: true, body: { action: 'product-status', id: productId, status: 'closed' } })}>作废</button>}</td></tr>; })}</tbody></table>{data.products.length === 0 ? <Empty text="暂无商品，请先添加" /> : filteredProducts.length === 0 && <Empty text="没有符合筛选条件的商品" />}{filteredProducts.length > 0 && <div className="admin-pagination"><button type="button" disabled={currentProductPage <= 1} onClick={() => setProductPage((page) => Math.max(1, page - 1))}>上一页</button><span>第 {currentProductPage} / {productPageCount} 页</span><button type="button" disabled={currentProductPage >= productPageCount} onClick={() => setProductPage((page) => Math.min(productPageCount, page + 1))}>下一页</button></div>}</div>
          </>}

          {active === 'categories' && <>
            <div className="panel-title"><div><h2>商品分类</h2><p>先创建一级分类，再在其下创建二级分类</p></div><div className="panel-title-actions"><button className="refresh-list-button" disabled={refreshing} onClick={() => void load(true)}>{refreshing ? '正在刷新…' : '↻ 刷新列表'}</button><button onClick={() => startCategory()}>＋ 新增分类</button></div></div>
            <div className="category-tree">{parents.map((parent) => {
              const parentId = Number(parent.id);
              const children = data.categories.filter((item) => Number(item.parent_id) === parentId);
              const collapsed = collapsedCategories.includes(parentId);
              return <section className="category-branch" key={text(parent.id)}>
                <div className="category-parent-row"><button className="tree-toggle" aria-label={collapsed ? '展开二级分类' : '收起二级分类'} onClick={() => setCollapsedCategories((items) => collapsed ? items.filter((id) => id !== parentId) : [...items, parentId])}>{collapsed ? '›' : '⌄'}</button><div className="tree-name"><b>{text(parent.name)}</b><small>一级分类 · {children.length} 个二级分类 · 排序 {text(parent.sort)}</small></div><Status value={text(parent.status)} /><div className="tree-actions"><button className="text-action" onClick={() => setCategoryForm({ ...emptyCategory(), parentId: text(parent.id) })}>＋ 子分类</button><button className="text-action" onClick={() => startCategory(parent)}>编辑</button><button className="text-action" onClick={() => confirmStatus('变更分类状态', `确定${parent.status === 'active' ? '停用' : '启用'}“${text(parent.name)}”吗？`, { action: 'category-status', id: parentId, status: parent.status === 'active' ? 'inactive' : 'active' })}>{parent.status === 'active' ? '停用' : '启用'}</button><button className="text-action danger-action" onClick={() => setConfirmTarget({ title: '删除一级分类', description: `确定删除“${text(parent.name)}”吗？若仍有关联商品或子分类，系统将拒绝删除。`, confirmText: '确认删除', danger: true, body: { action: 'category-delete', id: parentId } })}>删除</button></div></div>
                {!collapsed && <div className="category-children">{children.map((child) => <article className="category-child-row" key={text(child.id)}><span className="tree-line">└</span><div className="tree-name"><b>{text(child.name)}</b><small>二级分类 · 排序 {text(child.sort)}</small></div><Status value={text(child.status)} /><div className="tree-actions"><button className="text-action" onClick={() => startCategory(child)}>编辑</button><button className="text-action" onClick={() => confirmStatus('变更分类状态', `确定${child.status === 'active' ? '停用' : '启用'}“${text(child.name)}”吗？`, { action: 'category-status', id: Number(child.id), status: child.status === 'active' ? 'inactive' : 'active' })}>{child.status === 'active' ? '停用' : '启用'}</button><button className="text-action danger-action" onClick={() => setConfirmTarget({ title: '删除二级分类', description: `确定删除“${text(child.name)}”吗？若仍有关联商品，系统将拒绝删除。`, confirmText: '确认删除', danger: true, body: { action: 'category-delete', id: Number(child.id) } })}>删除</button></div></article>)}{children.length === 0 && <p className="tree-empty">暂无二级分类，可点击“＋ 子分类”添加。</p>}</div>}
              </section>;
            })}{data.categories.length === 0 && <Empty text="暂无分类，请先添加" />}</div>
          </>}

          {active === 'orders' && <>
            <div className="panel-title"><div><h2>订单列表</h2><p>客户下单为待支付；管理员确认收款后改为已支付；客户点击完成支付后进入待发货</p></div><div className="panel-title-actions"><button className="refresh-list-button" disabled={refreshing} onClick={() => void load(true)}>{refreshing ? '正在刷新…' : '↻ 刷新列表'}</button><button className="danger-button batch-void-button" type="button" disabled={!selectedVisibleOrderIds.length} onClick={orderListTab === 'closed' ? requestBatchDelete : requestBatchVoid}>{orderListTab === 'closed' ? '批量删除' : '批量作废'}{selectedVisibleOrderIds.length ? `（${selectedVisibleOrderIds.length}）` : ''}</button></div></div>
            <div className="order-tabs">{orderListTabs.map((tab) => <button key={tab.key} className={`${orderListTab === tab.key ? 'active ' : ''}${tab.key === 'closed' ? 'void-tab' : ''}`} onClick={() => { setOrderListTab(tab.key); setSelectedOrderIds([]); }}>{tab.label} <span>{tab.key === 'all' ? data.orders.filter((order) => text(order.status) !== 'closed').length : data.orders.filter((order) => text(order.status) === tab.key).length}</span></button>)}</div>
            <div className="order-filter"><b>筛选条件</b><input value={orderFilters.keyword} onChange={(event) => setOrderFilters({ ...orderFilters, keyword: event.target.value })} placeholder="订单号、商品、手机号或邮箱" /><label>下单时间 <input type="date" value={orderFilters.startDate} onChange={(event) => setOrderFilters({ ...orderFilters, startDate: event.target.value })} /></label><span>至</span><input type="date" value={orderFilters.endDate} onChange={(event) => setOrderFilters({ ...orderFilters, endDate: event.target.value })} /><small>共 {filteredOrders.length} 条</small><button type="button" onClick={() => { setOrderFilters({ keyword: '', startDate: '', endDate: '' }); setOrderListTab('all'); }}>重置</button></div>
            <div className="table-wrap"><table><thead><tr><th className="order-select-cell"><input type="checkbox" aria-label="全选当前订单" checked={allSelectableOrdersSelected} disabled={!selectableOrders.length} onChange={toggleAllOrderSelection} /></th><th>订单号</th><th>商品</th><th>产品类型</th><th>客户手机号</th><th>客户邮箱</th><th>下单时间</th><th>发货时间</th><th>金额</th><th>状态</th><th>充值JSON</th><th>操作</th></tr></thead><tbody>{filteredOrders.map((order) => { const orderId = text(order.id); const isClosed = text(order.status) === 'closed'; const isPending = text(order.status) === 'pending'; const rechargeJson = text(order.recharge_json); return <tr key={orderId}><td className="order-select-cell"><input type="checkbox" aria-label={`选择订单 ${orderId}`} checked={selectedOrderIds.includes(orderId)} onChange={() => toggleOrderSelection(orderId)} /></td><td><b>{orderId}</b></td><td>{text(order.product_name)}</td><td>{text(order.category) || '—'}</td><td>{text(order.phone)}</td><td>{text(order.email)}</td><td>{formatTime(text(order.created_at))}</td><td>{formatTime(text(order.delivered_at))}</td><td className="money">¥{text(order.amount)}</td><td><Status value={text(order.status)} /></td><td>{rechargeJson ? <button className="text-action" onClick={() => setRechargeJsonView({ id: orderId, json: rechargeJson })}>查看JSON</button> : <span className="muted-cell">—</span>}</td><td><button className="text-action" onClick={() => setOrderStatusForm({ id: orderId, status: text(order.status) })}>修改状态</button><button className="text-action" disabled={isPending} title={isPending ? '待支付订单不能发货' : undefined} onClick={() => setDelivery({ id: orderId, productId: Number(order.product_id), credentialId: Number(order.credential_id || 0), content: text(order.delivery_content) })}>发货</button>{isClosed ? <button className="text-action danger-action" onClick={() => setConfirmTarget({ title: '删除已作废订单', description: `确定永久删除订单 ${orderId} 吗？此操作无法恢复。`, confirmText: '确认永久删除', danger: true, body: { action: 'order-delete', id: orderId } })}>删除</button> : <button className="text-action danger-action" onClick={() => setConfirmTarget({ title: '作废订单', description: `确定作废订单 ${orderId} 吗？作废后前台将不再展示该订单。`, confirmText: '确认作废', danger: true, body: { action: 'order-status', id: orderId, status: 'closed' } })}>作废</button>}</td></tr>; })}</tbody></table>{filteredOrders.length === 0 && <Empty text={data.orders.length ? '暂无匹配订单' : '暂无订单'} />}</div>
          </>}

          {active === 'users' && <><div className="panel-title"><div><h2>用户列表</h2><p>查看注册用户与账号状态</p></div><div className="panel-title-actions"><button className="refresh-list-button" disabled={refreshing} onClick={() => void load(true)}>{refreshing ? '正在刷新…' : '↻ 刷新列表'}</button></div></div><div className="table-wrap"><table><thead><tr><th>用户</th><th>订单邮箱</th><th>注册时间</th><th>状态</th><th>操作</th></tr></thead><tbody>{data.users.map((user) => <tr key={text(user.id)}><td><b>{text(user.phone).replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}</b><small>用户 ID：{text(user.id)}</small></td><td>{text(user.email)}</td><td>{text(user.created_at).slice(0, 10)}</td><td><Status value={text(user.status)} /></td><td><button className="text-action" onClick={() => confirmStatus('变更用户状态', `确定${user.status === 'active' ? '停用' : '启用'}该用户吗？`, { action: 'user-status', id: Number(user.id), status: user.status === 'active' ? 'disabled' : 'active' })}>{user.status === 'active' ? '停用' : '启用'}</button></td></tr>)}</tbody></table>{data.users.length === 0 && <Empty text="暂无注册用户" />}</div></>}

          {active === 'notifications' && <><div className="panel-title"><div><h2>订单通知</h2><p>配置发信、收信邮箱及通知邮箱</p></div><div className="panel-title-actions"><button className="refresh-list-button" disabled={refreshing} onClick={() => void load(true)}>{refreshing ? '正在刷新…' : '↻ 刷新列表'}</button></div></div><div className="notification-settings"><form className="email-config-form" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); await action({ action: 'email-config-save', provider: 'smtp', fromAddress: text(form.get('fromAddress')), smtpHost: text(form.get('smtpHost')), smtpPort: text(form.get('smtpPort')), smtpSecurity: text(form.get('smtpSecurity')), smtpUsername: text(form.get('smtpUsername')), smtpPassword: text(form.get('smtpPassword')), imapHost: text(form.get('imapHost')), imapPort: text(form.get('imapPort')), imapSecurity: text(form.get('imapSecurity')), imapUsername: text(form.get('imapUsername')), imapPassword: text(form.get('imapPassword')) }); }}><section className="mail-config-section"><h3>发信邮箱（SMTP）</h3><p>用于发送下单支付与发货通知。{Number(data.emailConfig?.smtp_password_configured) ? '授权码已保存。' : '尚未保存授权码。'}</p><div className="admin-form-grid"><Field label="发件人"><input name="fromAddress" defaultValue={text(data.emailConfig?.from_address)} placeholder="宇星商城 <你的QQ邮箱>" /></Field><Field label="SMTP 服务器"><input name="smtpHost" defaultValue={text(data.emailConfig?.smtp_host)} placeholder="smtp.qq.com" /></Field><Field label="SMTP 端口"><input name="smtpPort" type="number" defaultValue={text(data.emailConfig?.smtp_port) || '465'} /></Field><Field label="SMTP 加密"><select name="smtpSecurity" defaultValue={text(data.emailConfig?.smtp_security) || 'tls'}><option value="tls">SSL/TLS（465）</option><option value="starttls">STARTTLS（587）</option></select></Field><Field label="SMTP 用户名"><input name="smtpUsername" defaultValue={text(data.emailConfig?.smtp_username)} placeholder="完整发信邮箱" /></Field><Field label="SMTP 授权码"><input name="smtpPassword" type="password" placeholder={Number(data.emailConfig?.smtp_password_configured) ? '已配置，留空不修改' : '填写邮箱授权码'} /></Field></div><div className="admin-form-actions"><button>保存发信配置</button><button type="button" className="ghost-button" onClick={() => { const to = window.prompt('输入测试收件邮箱'); if (to) void action({ action: 'email-config-test', recipient: to }); }}>发送测试邮件</button></div></section><section className="mail-config-section"><h3>收信邮箱（IMAP）</h3><p>用于后续读取管理员回复的订单状态。{Number(data.emailConfig?.imap_password_configured) ? '授权码已保存。' : '尚未保存授权码。'}</p><div className="admin-form-grid"><Field label="IMAP 服务器"><input name="imapHost" defaultValue={text(data.emailConfig?.imap_host)} placeholder="imap.qq.com" /></Field><Field label="IMAP 端口"><input name="imapPort" type="number" defaultValue={text(data.emailConfig?.imap_port) || '993'} /></Field><Field label="IMAP 加密"><select name="imapSecurity" defaultValue={text(data.emailConfig?.imap_security) || 'tls'}><option value="tls">SSL/TLS（993）</option><option value="starttls">STARTTLS</option></select></Field><Field label="IMAP 用户名"><input name="imapUsername" defaultValue={text(data.emailConfig?.imap_username)} placeholder="完整收信邮箱" /></Field><Field label="IMAP 授权码"><input name="imapPassword" type="password" placeholder={Number(data.emailConfig?.imap_password_configured) ? '已配置，留空不修改' : '填写邮箱授权码'} /></Field></div></section></form>{([{ type: 'payment', title: '下单支付通知', note: '客户在已支付订单点击“我已完成支付”后发送。' }, { type: 'delivery', title: '发货通知', note: '管理员完成发货后发送。' }] as const).map((item) => { const setting = data.notificationSettings.find((row) => text(row.type) === item.type); return <form key={`${item.type}-${text(setting?.updated_at)}`} className="notification-setting" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); await action({ action: 'notification-settings-save', type: item.type, recipientEmails: text(form.get('recipientEmails')), enabled: form.get('enabled') ? 1 : 0 }); }}><div><h3>{item.title}</h3><p>{item.note}</p></div><label><span>通知邮箱</span><input name="recipientEmails" defaultValue={text(setting?.recipient_emails)} placeholder="多个邮箱用逗号隔开" /></label><label className="notification-enabled"><input name="enabled" type="checkbox" defaultChecked={Number(setting?.enabled ?? 1) === 1} /> 启用通知</label><button>保存配置</button></form>; })}<p className="notification-help">邮件包含订单基本信息，并提示可回复：待支付、已支付、待发货、已发货、已作废。</p></div></>}

          {active === 'credentials' && <>
            <div className="panel-title"><div><h2>账号 / 卡密库存</h2><p>维护账号资料、价格，并追踪关联订单和客户</p></div><div className="panel-title-actions"><button className="refresh-list-button" disabled={refreshing} onClick={() => void load(true)}>{refreshing ? '正在刷新…' : '↻ 刷新列表'}</button>{credentialListTab === 'closed' && <button className="danger-button batch-void-button" disabled={!selectedClosedCredentialIds.length} onClick={requestBatchCredentialDelete}>批量删除{selectedClosedCredentialIds.length ? `（${selectedClosedCredentialIds.length}）` : ''}</button>}<button onClick={() => startCredential()}>＋ 添加库存</button></div></div>
            <div className="order-tabs credential-tabs">{credentialListTabs.map((tab) => <button key={tab.key} className={`${credentialListTab === tab.key ? 'active ' : ''}${tab.key === 'closed' ? 'void-tab' : ''}`} onClick={() => { setCredentialListTab(tab.key); setSelectedCredentialIds([]); }}>{tab.label} <span>{tab.key === 'all' ? data.credentials.filter((credential) => text(credential.status) !== 'closed').length : data.credentials.filter((credential) => text(credential.status) === tab.key).length}</span></button>)}</div>
            <div className="table-wrap credential-table"><table><thead><tr>{credentialListTab === 'closed' && <th className="order-select-cell"><input type="checkbox" aria-label="全选已作废账号" checked={allClosedCredentialsSelected} disabled={!closedCredentialIds.length} onChange={toggleAllCredentialSelection} /></th>}<th>ID</th><th>对应商品</th><th>账号 / 卡密</th><th>密码</th><th>邮箱授权码</th><th>验证码地址</th><th>成本价</th><th>售卖价</th><th>状态</th><th>关联情况</th><th>操作</th></tr></thead><tbody>{filteredCredentials.map((credential) => {
              const assignments = data.credentialAssignments.filter((assignment) => Number(assignment.credential_id) === Number(credential.id));
              const activeAssignments = assignments.filter((assignment) => text(assignment.assignment_status) === 'active');
              const isClosed = text(credential.status) === 'closed';
              const isUsed = text(credential.status) === 'used';
              return <tr key={text(credential.id)}>{credentialListTab === 'closed' && <td className="order-select-cell"><input type="checkbox" aria-label={`选择账号 ${text(credential.account || credential.content)}`} checked={selectedCredentialIds.includes(Number(credential.id))} onChange={() => toggleCredentialSelection(Number(credential.id))} /></td>}<td>#{text(credential.id)}</td><td>{text(credential.product_name)}</td><td><code title={text(credential.account || credential.content)}>{text(credential.account || credential.content) || '—'}</code></td><td><code title={text(credential.password)}>{text(credential.password) || '—'}</code></td><td><code title={text(credential.email_auth_code)}>{text(credential.email_auth_code) || '—'}</code></td><td>{text(credential.verification_url) ? <a className="credential-url" href={text(credential.verification_url)} target="_blank" rel="noopener noreferrer">打开地址</a> : <span className="muted-cell">—</span>}</td><td className="cost-money">¥{text(credential.cost_price || 0)}</td><td className="money">¥{text(credential.sale_price || credential.product_price || 0)}</td><td><Status value={text(credential.status)} /></td><td>{assignments.length ? <button className="text-action assignment-action" onClick={() => setCredentialAssignmentsView({ credential, assignments })}>使用中 {activeAssignments.length} · 累计 {assignments.length}</button> : <span className="muted-cell">未分配</span>}</td><td>{isClosed ? <button className="text-action danger-action" onClick={() => setConfirmTarget({ title: '永久删除已作废账号', description: `确定永久删除账号“${text(credential.account || credential.content)}”吗？关联历史也会一并删除，且无法恢复。`, confirmText: '确认永久删除', danger: true, body: { action: 'credential-delete', id: Number(credential.id) } })}>删除</button> : <><button className="text-action" onClick={() => startCredential(credential)}>编辑</button>{!isUsed && <><button className="text-action" onClick={() => confirmStatus('变更卡密状态', `确定${credential.status === 'available' ? '停用' : '恢复'}该卡密吗？`, { action: 'credential-status', id: Number(credential.id), status: credential.status === 'available' ? 'disabled' : 'available' })}>{credential.status === 'available' ? '停用' : '恢复'}</button><button className="text-action danger-action" onClick={() => setConfirmTarget({ title: '作废账号', description: `确定作废账号“${text(credential.account || credential.content)}”吗？作废后仅可在已作废列表中永久删除。`, confirmText: '确认作废', danger: true, body: { action: 'credential-status', id: Number(credential.id), status: 'closed' } })}>作废</button></>}</>}</td></tr>;
            })}</tbody></table>{data.credentials.length === 0 ? <Empty text="暂无账号 / 卡密库存，请先添加" /> : filteredCredentials.length === 0 && <Empty text="当前标签暂无账号" />}</div>
          </>}

        </>}
      </div>
    </section>
    {productForm && <div className="admin-modal-mask" role="presentation"><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="product-editor-title"><div className="editor-head"><div><span className="section-kicker">PRODUCT EDITOR</span><b id="product-editor-title">{productForm.id ? '编辑商品' : '新增商品'}</b></div><button className="modal-close" aria-label="关闭商品编辑" onClick={() => setProductForm(null)}>×</button></div><div className="admin-form-grid">
      <Field label="商品名称"><input autoFocus value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} /></Field>
      <Field label="商品角标"><input value={productForm.tag} onChange={(event) => setProductForm({ ...productForm, tag: event.target.value })} placeholder="如：热卖" /></Field>
      <Field label="一级分类"><select value={productForm.category} onChange={(event) => { const category = event.target.value; const child = childrenFor(category).find((item) => item.status === 'active'); setProductForm({ ...productForm, category, subcategory: child ? text(child.name) : '' }); }}><option value="">请选择</option>{parents.filter((item) => item.status === 'active').map((item) => <option key={text(item.id)} value={text(item.name)}>{text(item.name)}</option>)}</select></Field>
      <Field label="二级分类"><select value={productForm.subcategory} onChange={(event) => setProductForm({ ...productForm, subcategory: event.target.value })}><option value="">请选择</option>{childrenFor(productForm.category).filter((item) => item.status === 'active').map((item) => <option key={text(item.id)} value={text(item.name)}>{text(item.name)}</option>)}</select></Field>
      <Field label="售价（元）"><input type="number" min="0" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} /></Field>
      <Field label="成本价（元）"><input type="number" min="0" step="0.01" value={productForm.costPrice} onChange={(event) => setProductForm({ ...productForm, costPrice: event.target.value })} /></Field>
      <Field label="计费周期"><select value={productForm.billingCycle} onChange={(event) => setProductForm({ ...productForm, billingCycle: event.target.value })}><option value="once">一次性</option><option value="day">按天</option><option value="week">按周</option><option value="month">按月</option><option value="year">按年</option><option value="times">按次</option></select></Field>
      <Field label="划线价（元）"><input type="number" min="0" value={productForm.oldPrice} onChange={(event) => setProductForm({ ...productForm, oldPrice: event.target.value })} /></Field>
      <Field label="库存"><input type="number" min="0" value={productForm.stock} onChange={(event) => setProductForm({ ...productForm, stock: event.target.value })} /></Field>
      <Field label="展示字"><input value={productForm.initial} onChange={(event) => setProductForm({ ...productForm, initial: event.target.value })} placeholder="卡片图标中的文字" /></Field>
      <Field label="卡片色调"><select value={productForm.tone} onChange={(event) => setProductForm({ ...productForm, tone: event.target.value })}><option value="dark">深色</option><option value="violet">紫色</option><option value="blue">蓝色</option><option value="orange">橙色</option></select></Field>
      <Field label="商品图片（商城列表展示）" wide><div className="product-image-upload"><input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingProductImage === 'coverImage'} onChange={(event) => void uploadProductImage('coverImage', event.target.files?.[0])} />{productForm.coverImage ? <><Image unoptimized src={productForm.coverImage} alt="商品图片预览" width={116} height={72} /><button type="button" onClick={() => setProductForm({ ...productForm, coverImage: '' })}>移除图片</button></> : <span>{uploadingProductImage === 'coverImage' ? '正在上传…' : '建议上传 3:2 横图'}</span>}</div></Field>
      <Field label="详情图片（商品详情页展示）" wide><div className="product-image-upload"><input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingProductImage === 'detailImage'} onChange={(event) => void uploadProductImage('detailImage', event.target.files?.[0])} />{productForm.detailImage ? <><Image unoptimized src={productForm.detailImage} alt="详情图片预览" width={116} height={72} /><button type="button" onClick={() => setProductForm({ ...productForm, detailImage: '' })}>移除图片</button></> : <span>{uploadingProductImage === 'detailImage' ? '正在上传…' : '未上传时将使用商品图片'}</span>}</div>{productImageError && <small className="upload-error">{productImageError}</small>}</Field>
      <Field label="简短描述"><input value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} placeholder="列表与详情页摘要" /></Field>
      <Field label="商品属性" wide><textarea value={productForm.attributesText} onChange={(event) => setProductForm({ ...productForm, attributesText: event.target.value })} placeholder={'使用方式：多人共享\n共享人数：5 人\n会话：独立\n有效期：30 天\n网络要求：无需代理'} /></Field>
      <Field label="商品详情" wide><textarea value={productForm.detail} onChange={(event) => setProductForm({ ...productForm, detail: event.target.value })} placeholder="填写商品详情、交付说明或购买须知" /></Field>
      </div><div className="admin-form-actions"><button className="ghost-button" onClick={() => setProductForm(null)}>取消</button><button onClick={async () => { const isNew = !productForm.id; if (await action({ action: 'product-save', ...productForm })) { setProductForm(null); if (isNew) setNotice('商品已新增，当前默认下架；需要展示时可直接点击“上架”。'); } }}>保存商品</button></div></section></div>}
    {categoryForm && <Modal title={categoryForm.id ? '编辑分类' : '新增分类'} onClose={() => setCategoryForm(null)}><div className="admin-form-grid"><Field label="分类名称"><input autoFocus value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} /></Field><Field label="所属一级分类"><select value={categoryForm.parentId} onChange={(event) => setCategoryForm({ ...categoryForm, parentId: event.target.value })}><option value="">无（作为一级分类）</option>{parents.filter((item) => item.id !== categoryForm.id).map((item) => <option key={text(item.id)} value={text(item.id)}>{text(item.name)}</option>)}</select></Field><Field label="排序值"><input type="number" value={categoryForm.sort} onChange={(event) => setCategoryForm({ ...categoryForm, sort: event.target.value })} /></Field><Field label="状态"><select value={categoryForm.status} onChange={(event) => setCategoryForm({ ...categoryForm, status: event.target.value })}><option value="active">启用</option><option value="inactive">停用</option></select></Field></div><div className="admin-form-actions"><button className="ghost-button" onClick={() => setCategoryForm(null)}>取消</button><button onClick={async () => { if (await action({ action: 'category-save', ...categoryForm })) setCategoryForm(null); }}>保存分类</button></div></Modal>}
    {productQr && <Modal title={`支付二维码 · ${text(productQr.name)}`} onClose={() => setProductQr(null)}><p className="product-qr-note">当前商品售价：<b>¥{Number(productQr.price).toFixed(2)}</b>。支付二维码可按需要配置，不影响商品上架状态。</p><div className="product-qr-list">{(['wechat', 'alipay'] as const).map((type) => { const qr = currentProductQrs.find((item) => item.type === type); const hasImage = Boolean(qr && text(qr.image_url)); return <article key={type}><div className="product-qr-preview">{hasImage ? <Image unoptimized src={text(qr?.image_url)} alt={`${paymentTypeLabel(type)}二维码`} width={82} height={82} /> : <span>待上传</span>}</div><div><b>{paymentTypeLabel(type)}</b><small>对应金额 ¥{Number(productQr.price).toFixed(2)}</small><Status value={text(qr?.status) || 'inactive'} /></div><div className="product-qr-actions"><button className="text-action" onClick={() => startQr(qr || { id: null, product_id: Number(productQr.id), name: '', type, amount: Number(productQr.price), image_url: null })}>{hasImage ? '修改二维码' : '上传二维码'}</button>{qr && <><button className="text-action" onClick={() => confirmStatus('变更二维码状态', `确定${qr.status === 'active' ? '停用' : '启用'}${paymentTypeLabel(type)}二维码吗？`, { action: 'qr-status', id: Number(qr.id), status: qr.status === 'active' ? 'inactive' : 'active' })}>{qr.status === 'active' ? '停用' : '启用'}</button><button className="text-action danger-action" onClick={() => setConfirmTarget({ title: '删除支付二维码', description: `确定删除${paymentTypeLabel(type)}二维码吗？删除后商品将无法通过该支付方式收款。`, confirmText: '确认删除', danger: true, body: { action: 'qr-delete', id: Number(qr.id) } })}>删除</button></>}</div></article>; })}</div></Modal>}
    {qrForm && <Modal title={`设置${paymentTypeLabel(qrForm.type)}二维码`} onClose={() => setQrForm(null)} compact><div className="admin-form-grid"><Field label="支付类型"><input value={paymentTypeLabel(qrForm.type)} readOnly /></Field><Field label="对应商品金额"><input value={`¥${Number(qrForm.amount).toFixed(2)}`} readOnly /></Field><Field label="二维码名称"><input autoFocus value={qrForm.name} onChange={(event) => setQrForm({ ...qrForm, name: event.target.value })} placeholder="留空则自动生成名称" /></Field><Field label="二维码图片" wide><div className="qr-upload"><input type="file" accept="image/*" onChange={(event) => selectQrImage(event.target.files?.[0])} />{qrForm.imageUrl ? <Image unoptimized src={qrForm.imageUrl} alt="二维码预览" width={64} height={64} /> : <span>未上传图片</span>}</div>{qrImageError && <small className="upload-error">{qrImageError}</small>}</Field></div><div className="admin-form-actions"><button className="ghost-button" onClick={() => setQrForm(null)}>取消</button><button onClick={async () => { if (await action({ action: 'qr-save', ...qrForm })) setQrForm(null); }}>保存二维码</button></div></Modal>}
    {credentialForm && <Modal title={credentialForm.id ? '编辑账号 / 卡密' : '添加账号 / 卡密'} onClose={() => setCredentialForm(null)}><div className="admin-form-grid"><Field label="对应商品"><select value={credentialForm.productId} onChange={(event) => { const productId = Number(event.target.value); const product = data.products.find((item) => Number(item.id) === productId); setCredentialForm({ ...credentialForm, productId, salePrice: text(product?.price || 0) }); }}>{data.products.map((product) => <option key={text(product.id)} value={Number(product.id)}>{text(product.name)}{text(product.status) === 'closed' ? '（已作废）' : ''}</option>)}</select></Field><Field label="账号 / 卡密"><input autoFocus value={credentialForm.account} onChange={(event) => setCredentialForm({ ...credentialForm, account: event.target.value })} placeholder="填写账号、邮箱或卡密" /></Field><Field label="密码"><input value={credentialForm.password} onChange={(event) => setCredentialForm({ ...credentialForm, password: event.target.value })} placeholder="无密码时可留空" /></Field><Field label="邮箱授权码"><input value={credentialForm.emailAuthCode} onChange={(event) => setCredentialForm({ ...credentialForm, emailAuthCode: event.target.value })} placeholder="没有邮箱授权码时可留空" /></Field><Field label="验证码获取地址" wide><input type="url" value={credentialForm.verificationUrl} onChange={(event) => setCredentialForm({ ...credentialForm, verificationUrl: event.target.value })} placeholder="例如：https://example.com/code" /></Field><Field label="成本价（元）"><input type="number" min="0" step="0.01" value={credentialForm.costPrice} onChange={(event) => setCredentialForm({ ...credentialForm, costPrice: event.target.value })} /></Field><Field label="售卖价（元）"><input type="number" min="0" step="0.01" value={credentialForm.salePrice} onChange={(event) => setCredentialForm({ ...credentialForm, salePrice: event.target.value })} /></Field></div><div className="admin-form-actions"><button className="ghost-button" onClick={() => setCredentialForm(null)}>取消</button><button onClick={async () => { if (credentialForm.account.trim() && await action({ action: 'credential-save', ...credentialForm })) setCredentialForm(null); }}>保存库存</button></div></Modal>}
    {delivery && <Modal title="订单发货" onClose={() => setDelivery(null)}><div className="delivery-editor"><label className="delivery-credential-field"><span>从账号 / 卡密库存选择</span><select autoFocus value={delivery.credentialId} onChange={(event) => setDelivery({ ...delivery, credentialId: Number(event.target.value) })}><option value={0}>手动填写交付内容</option>{availableDeliveryCredentials.map((credential) => <option key={text(credential.id)} value={Number(credential.id)}>{text(credential.account || credential.content)}{text(credential.status) === 'used' ? '（当前已分配）' : '（可用）'}</option>)}</select></label>{selectedDeliveryCredential ? <div className="credential-delivery-preview"><b>将发送以下账号资料</b><dl><div><dt>账号 / 卡密</dt><dd>{text(selectedDeliveryCredential.account || selectedDeliveryCredential.content)}</dd></div><div><dt>密码</dt><dd>{text(selectedDeliveryCredential.password) || '—'}</dd></div><div><dt>邮箱授权码</dt><dd>{text(selectedDeliveryCredential.email_auth_code) || '—'}</dd></div><div><dt>验证码获取地址</dt><dd>{text(selectedDeliveryCredential.verification_url) || '—'}</dd></div></dl></div> : <textarea value={delivery.content} onChange={(event) => setDelivery({ ...delivery, content: event.target.value })} placeholder="没有库存账号时，可手动填写账号、卡密或开通说明" />}</div><div className="admin-form-actions"><button className="ghost-button" onClick={() => setDelivery(null)}>取消</button><button onClick={async () => { if (await action({ action: 'order-delivery', id: delivery.id, credentialId: delivery.credentialId, deliveryContent: delivery.content })) setDelivery(null); }}>确认发货</button></div></Modal>}
    {credentialAssignmentsView && <Modal title={`账号关联详情 · ${text(credentialAssignmentsView.credential.account || credentialAssignmentsView.credential.content)}`} onClose={() => setCredentialAssignmentsView(null)}><div className="assignment-summary"><span>当前使用中 <b>{credentialAssignmentsView.assignments.filter((assignment) => text(assignment.assignment_status) === 'active').length}</b> 人</span><span>累计分配 <b>{credentialAssignmentsView.assignments.length}</b> 次</span></div><div className="table-wrap assignment-table"><table><thead><tr><th>订单号</th><th>购买商品</th><th>产品类型</th><th>计费周期</th><th>客户手机号</th><th>客户邮箱</th><th>分配时间</th><th>关联状态</th><th>订单状态</th></tr></thead><tbody>{credentialAssignmentsView.assignments.map((assignment) => <tr key={text(assignment.id)}><td><b>{text(assignment.order_id)}</b></td><td>{text(assignment.product_name) || '—'}</td><td>{[text(assignment.category), text(assignment.subcategory)].filter(Boolean).join(' · ') || '—'}</td><td>{billingCycleLabel(text(assignment.billing_cycle))}</td><td>{text(assignment.phone)}</td><td>{text(assignment.email)}</td><td>{formatTime(text(assignment.assigned_at))}</td><td><span className={`assignment-status ${text(assignment.assignment_status)}`}>{text(assignment.assignment_status) === 'active' ? '使用中' : '已释放'}</span></td><td><Status value={text(assignment.order_status)} /></td></tr>)}</tbody></table></div><div className="admin-form-actions"><button className="ghost-button" onClick={() => setCredentialAssignmentsView(null)}>关闭</button></div></Modal>}
    {orderStatusForm && <Modal title="修改订单状态" onClose={() => setOrderStatusForm(null)} compact><div className="status-editor"><label><span>订单状态</span><select value={orderStatusForm.status} onChange={(event) => setOrderStatusForm({ ...orderStatusForm, status: event.target.value })}><option value="pending">待支付</option><option value="paid">已支付</option><option value="pending_delivery">待发货</option><option value="delivered">已发货</option><option value="closed">已作废</option></select></label></div><div className="admin-form-actions"><button className="ghost-button" onClick={() => setOrderStatusForm(null)}>取消</button><button onClick={async () => { if (await action({ action: 'order-status', ...orderStatusForm })) setOrderStatusForm(null); }}>保存状态</button></div></Modal>}
    {rechargeJsonView && <Modal title={`充值JSON · ${rechargeJsonView.id}`} onClose={() => setRechargeJsonView(null)}><div className="recharge-json-view"><textarea readOnly value={rechargeJsonView.json} /></div><div className="admin-form-actions"><button className="ghost-button" onClick={() => setRechargeJsonView(null)}>关闭</button></div></Modal>}
    {confirmTarget && <Modal title={confirmTarget.title} onClose={() => setConfirmTarget(null)} compact><div className="confirm-content"><b>{confirmTarget.danger ? '此操作无法撤销' : '请确认本次变更'}</b><p>{confirmTarget.description}</p></div><div className="admin-form-actions"><button className="ghost-button" onClick={() => setConfirmTarget(null)}>取消</button><button className={confirmTarget.danger ? 'danger-button' : ''} onClick={async () => { if (await action(confirmTarget.body)) { const confirmAction = text(confirmTarget.body.action); if (['order-batch-status', 'order-batch-delete'].includes(confirmAction)) setSelectedOrderIds([]); if (['product-delete', 'product-batch-delete'].includes(confirmAction)) setSelectedProductIds([]); if (['credential-delete', 'credential-batch-delete'].includes(confirmAction)) setSelectedCredentialIds([]); setConfirmTarget(null); } }}>{confirmTarget.confirmText}</button></div></Modal>}
  </main>;
}

function Modal({ title, children, onClose, compact = false }: { title: string; children: React.ReactNode; onClose: () => void; compact?: boolean }) {
  return <div className="admin-modal-mask" role="presentation"><section className={`admin-modal${compact ? ' compact-modal' : ''}`} role="dialog" aria-modal="true" aria-label={title}><div className="editor-head"><div><span className="section-kicker">STORE CONSOLE</span><b>{title}</b></div><button className="modal-close" aria-label="关闭弹窗" onClick={onClose}>×</button></div>{children}</section></div>;
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? 'wide-field' : ''}><span>{label}</span>{children}</label>;
}

function Status({ value, activeLabel = '正常' }: { value: string; activeLabel?: string }) {
  const label: Record<string, string> = { active: activeLabel, inactive: '已下架', disabled: '已停用', pending: '待支付', verification: '待发货', paid: '已支付', pending_delivery: '待发货', delivered: '已发货', closed: '已作废', available: '可用', used: '已分配', deleted: '订单已删除' };
  return <span className={`status status-${value}`}>{label[value] || value}</span>;
}

function Empty({ text: message }: { text: string }) {
  return <div className="table-empty"><span>◇</span><p>{message}</p></div>;
}
