"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Address = {
  id: number;
  contact_name: string;
  contact_phone: string;
  province: string;
  city: string;
  district: string;
  detail_address: string;
  is_default: number;
};

type AddressForm = {
  id?: number;
  contactName: string;
  contactPhone: string;
  province: string;
  city: string;
  district: string;
  detailAddress: string;
  isDefault: boolean;
};

const emptyForm: AddressForm = {
  contactName: "",
  contactPhone: "",
  province: "",
  city: "",
  district: "",
  detailAddress: "",
  isDefault: false,
};

function fullAddress(address: Address) {
  return [address.province,address.city,address.district,address.detail_address].filter(Boolean).join("");
}

export default function AddressesPage() {
  const [items,setItems] = useState<Address[]>([]);
  const [loading,setLoading] = useState(true);
  const [unauthorized,setUnauthorized] = useState(false);
  const [message,setMessage] = useState("");
  const [editing,setEditing] = useState<AddressForm | null>(null);
  const [saving,setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/addresses?refresh="+Date.now(), { cache:"no-store" });
      const result = await response.json() as Address[] & { message?: string };
      if (response.status === 401) {
        setUnauthorized(true);
        setItems([]);
      } else if (!response.ok) {
        setMessage((result as {message?:string}).message || "地址读取失败");
        setItems([]);
      } else {
        setUnauthorized(false);
        setMessage("");
        setItems(Array.isArray(result) ? result : []);
      }
    } catch {
      setMessage("地址读取失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  },[]);

  useEffect(() => { void load(); },[load]);

  async function save() {
    if (!editing || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/addresses", {
        method: editing.id ? "PUT" : "POST",
        headers: { "content-type":"application/json" },
        body: JSON.stringify(editing),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) {
        setMessage(result.message || "地址保存失败");
        return;
      }
      setEditing(null);
      await load();
    } catch {
      setMessage("地址保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(id:number) {
    await fetch("/api/addresses", {
      method:"PATCH",
      headers:{ "content-type":"application/json" },
      body:JSON.stringify({ id }),
    });
    await load();
  }

  async function remove(id:number) {
    if (!window.confirm("确认删除这个地址吗？历史服务订单中的地址快照不会受影响。")) return;
    const response = await fetch("/api/addresses?id="+id,{ method:"DELETE" });
    const result = await response.json() as { message?:string };
    if (!response.ok) setMessage(result.message || "地址删除失败");
    else await load();
  }

  return <main className="customer-address-page">
    <header className="inner-header">
      <Link className="brand" href="/"><span className="brand-mark"><Image src="/yxstar_logo.png" alt="宇星商城 Logo" fill sizes="34px" /></span><span>宇星商城</span></Link>
      <span className="orders-header-label">我的地址</span>
      <div className="orders-header-actions"><Link href="/orders">订单中心</Link><Link href="/">返回商城</Link></div>
    </header>

    <section className="customer-address-wrap">
      <div className="customer-address-head">
        <div><span className="section-kicker">ADDRESS BOOK</span><h1>我的地址</h1><p>管理上门技术服务常用地址，下单时可直接选择。</p></div>
        {!unauthorized && <button type="button" onClick={() => setEditing({ ...emptyForm, isDefault: items.length === 0 })}>新增地址</button>}
      </div>

      {message && <div className="customer-address-message">{message}</div>}
      {loading ? <div className="orders-empty">正在读取地址…</div> :
       unauthorized ? <div className="orders-empty"><b>登录后管理地址</b><p>请先使用商城手机号登录。</p><Link href="/">返回商城登录</Link></div> :
       items.length === 0 ? <div className="orders-empty"><b>还没有常用地址</b><p>新增地址后，购买上门服务时可直接选择。</p><button type="button" onClick={() => setEditing({ ...emptyForm, isDefault:true })}>新增第一个地址</button></div> :
       <div className="customer-address-list">{items.map((address) => <article key={address.id}>
         <header><div><b>{address.contact_name}</b><span>{address.contact_phone}</span></div>{Number(address.is_default) === 1 && <em>默认地址</em>}</header>
         <p>{fullAddress(address)}</p>
         <footer>
           <button type="button" onClick={() => setEditing({
             id:address.id,contactName:address.contact_name,contactPhone:address.contact_phone,
             province:address.province,city:address.city,district:address.district,detailAddress:address.detail_address,
             isDefault:Number(address.is_default) === 1,
           })}>编辑</button>
           {Number(address.is_default) !== 1 && <button type="button" onClick={() => void setDefault(address.id)}>设为默认</button>}
           <button type="button" className="danger" onClick={() => void remove(address.id)}>删除</button>
         </footer>
       </article>)}</div>}
    </section>

    {editing && <div className="technical-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setEditing(null)}>
      <section className="customer-address-modal" role="dialog" aria-modal="true" aria-label={editing.id ? "编辑地址" : "新增地址"}>
        <button className="modal-close" aria-label="关闭" onClick={() => setEditing(null)}>×</button>
        <header><span>ADDRESS</span><h2>{editing.id ? "编辑地址" : "新增地址"}</h2><p>请填写真实可联系的上门服务地址。</p></header>
        <div className="customer-address-form">
          <label><span>联系人</span><input value={editing.contactName} onChange={(e) => setEditing({...editing,contactName:e.target.value})} /></label>
          <label><span>联系电话</span><input value={editing.contactPhone} onChange={(e) => setEditing({...editing,contactPhone:e.target.value})} /></label>
          <label><span>省</span><input value={editing.province} onChange={(e) => setEditing({...editing,province:e.target.value})} placeholder="例如：上海市" /></label>
          <label><span>市</span><input value={editing.city} onChange={(e) => setEditing({...editing,city:e.target.value})} placeholder="例如：上海市" /></label>
          <label><span>区 / 县</span><input value={editing.district} onChange={(e) => setEditing({...editing,district:e.target.value})} placeholder="例如：浦东新区" /></label>
          <label className="wide"><span>详细地址</span><textarea value={editing.detailAddress} onChange={(e) => setEditing({...editing,detailAddress:e.target.value})} placeholder="街道、小区、楼栋、门牌号等" /></label>
          <label className="customer-address-default"><input type="checkbox" checked={editing.isDefault} onChange={(e) => setEditing({...editing,isDefault:e.target.checked})} /><span>设为默认上门地址</span></label>
        </div>
        <div className="customer-address-modal-actions"><button type="button" className="secondary" onClick={() => setEditing(null)}>取消</button><button type="button" disabled={saving} onClick={() => void save()}>{saving ? "保存中…" : "保存地址"}</button></div>
      </section>
    </div>}
  </main>;
}
