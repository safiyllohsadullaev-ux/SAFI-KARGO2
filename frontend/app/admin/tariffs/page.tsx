"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui";

const empty = { category: "", price_per_kg: "", currency: "USD", min_weight: "0", conditions: "", effective_from: "", is_active: true };

export default function TariffsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState<any>(empty);
  const load = () => api<{ items: any[] }>("/api/admin/tariffs").then((data) => setItems(data.items));
  useEffect(() => { load(); }, []);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const payload = { ...form, price_per_kg: Number(form.price_per_kg), min_weight: Number(form.min_weight || 0) };
    if (form.id) await api(`/api/admin/tariffs/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    else await api("/api/admin/tariffs", { method: "POST", body: JSON.stringify(payload) });
    toast(t("saved"));
    setForm(empty);
    load();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h1 className="text-3xl font-extrabold">{t("tariffs")}</h1>
        <div className="mt-4 space-y-3">{items.map((item) => (
          <button key={item.id} className="card block w-full p-4 text-left" type="button" onClick={() => setForm(item)}>
            <b>{item.category}</b>
            <p className="text-sm">{item.price_per_kg} {item.currency} / {t("kg")}</p>
          </button>
        ))}</div>
      </div>
      <form className="card space-y-2 p-4" onSubmit={save}>
        <input className="field" placeholder={t("category")} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} required />
        <input className="field" placeholder={t("price")} value={form.price_per_kg} onChange={(event) => setForm({ ...form, price_per_kg: event.target.value })} required />
        <input className="field" placeholder={t("currency")} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} />
        <input className="field" placeholder={t("minWeight")} value={form.min_weight} onChange={(event) => setForm({ ...form, min_weight: event.target.value })} />
        <textarea className="field" placeholder={t("conditions")} value={form.conditions} onChange={(event) => setForm({ ...form, conditions: event.target.value })} />
        <input className="field" type="datetime-local" value={form.effective_from ? String(form.effective_from).slice(0, 16) : ""} onChange={(event) => setForm({ ...form, effective_from: event.target.value })} />
        <label className="flex gap-2 text-sm font-bold"><input type="checkbox" checked={!!form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />{t("active")}</label>
        <button className="btn btn-primary" type="submit">{t("save")}</button>
      </form>
    </div>
  );
}
