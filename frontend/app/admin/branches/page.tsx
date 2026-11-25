"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui";

const empty = { name: "", address: "", phone: "", hours: "", map_url: "", is_active: true };

export default function BranchesPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState<any>(empty);
  const load = () => api<{ items: any[] }>("/api/admin/branches").then((data) => setItems(data.items));
  useEffect(() => { load(); }, []);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (form.id) await api(`/api/admin/branches/${form.id}`, { method: "PATCH", body: JSON.stringify(form) });
    else await api("/api/admin/branches", { method: "POST", body: JSON.stringify(form) });
    toast(t("saved"));
    setForm(empty);
    load();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h1 className="text-3xl font-extrabold">{t("branch")}</h1>
        <div className="mt-4 space-y-3">{items.map((item) => <button key={item.id} className="card block w-full p-4 text-left" type="button" onClick={() => setForm(item)}><b>{item.name}</b><p className="text-sm text-mute">{item.address}</p></button>)}</div>
      </div>
      <form className="card space-y-2 p-4" onSubmit={save}>
        <input className="field" placeholder={t("branchName")} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        <input className="field" placeholder={t("branchAddress")} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
        <input className="field" placeholder={t("phone")} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        <input className="field" placeholder={t("hours")} value={form.hours} onChange={(event) => setForm({ ...form, hours: event.target.value })} />
        <input className="field" placeholder={t("map")} value={form.map_url} onChange={(event) => setForm({ ...form, map_url: event.target.value })} />
        <button className="btn btn-primary" type="submit">{t("save")}</button>
      </form>
    </div>
  );
}
