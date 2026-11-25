"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui";

const empty = { country: "china", name: "", address: "", phone: "", recipient_name: "", instructions: "", is_primary: true, is_active: true };

export default function WarehousesPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState<any>(empty);
  const load = () => api<{ items: any[] }>("/api/admin/warehouses").then((data) => setItems(data.items));
  useEffect(() => { load(); }, []);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (form.id) await api(`/api/admin/warehouses/${form.id}`, { method: "PATCH", body: JSON.stringify(form) });
    else await api("/api/admin/warehouses", { method: "POST", body: JSON.stringify(form) });
    toast(t("saved"));
    setForm(empty);
    load();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h1 className="text-3xl font-extrabold">{t("warehouses")}</h1>
        <div className="mt-4 space-y-3">{items.map((item) => (
          <button key={item.id} className="card block w-full p-4 text-left" type="button" onClick={() => setForm(item)}>
            <b>{item.name || t("warehouseName")}</b>
            <p className="text-sm text-mute">{item.country === "china" ? t("china") : t("tajikistan")} · {item.configured ? item.address : t("addressMissing")}</p>
          </button>
        ))}</div>
      </div>
      <form onSubmit={save} className="card space-y-2 p-4">
        <select className="field" value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })}>
          <option value="china">{t("china")}</option>
          <option value="tajikistan">{t("tajikistan")}</option>
        </select>
        <input className="field" placeholder={t("warehouseName")} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <textarea className="field" placeholder={t("address")} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
        <input className="field" placeholder={t("phone")} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <input className="field" placeholder={t("recipient")} value={form.recipient_name} onChange={(event) => setForm({ ...form, recipient_name: event.target.value })} />
        <textarea className="field" placeholder={t("instructions")} value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} />
        <label className="flex gap-2 text-sm font-bold"><input type="checkbox" checked={form.is_primary} onChange={(event) => setForm({ ...form, is_primary: event.target.checked })} />{t("primary")}</label>
        <button className="btn btn-primary" type="submit">{t("save")}</button>
      </form>
    </div>
  );
}
