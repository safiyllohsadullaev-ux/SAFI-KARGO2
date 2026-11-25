"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui";

const roles = ["super_admin", "warehouse_china", "warehouse_tajikistan", "support"];

export default function StaffPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", password: "", role: "warehouse_china" });
  const load = () => api<{ items: any[] }>("/api/admin/staff").then((data) => setItems(data.items));
  useEffect(() => { load(); }, []);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    await api("/api/admin/staff", { method: "POST", body: JSON.stringify(form) });
    toast(t("saved"));
    setForm({ first_name: "", last_name: "", phone: "", password: "", role: "warehouse_china" });
    load();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h1 className="text-3xl font-extrabold">{t("staff")}</h1>
        <p className="mt-2 text-sm text-mute">{t("staffHint")}</p>
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <article key={item.id} className="card flex items-center justify-between p-4">
              <div><b>{item.first_name} {item.last_name}</b><p className="text-sm text-mute">{item.phone} · {t(item.role)}</p></div>
              <button className="btn btn-ghost" type="button" onClick={async () => { await api(`/api/admin/staff/${item.id}`, { method: "PATCH", body: JSON.stringify({ is_blocked: !item.is_blocked }) }); load(); }}>{item.is_blocked ? t("unblock") : t("block")}</button>
            </article>
          ))}
        </div>
      </div>
      <form className="card h-fit space-y-2 p-4" onSubmit={create}>
        <input className="field" placeholder={t("firstName")} value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} required />
        <input className="field" placeholder={t("lastName")} value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} required />
        <input className="field" placeholder={t("phone")} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required />
        <input className="field" type="password" placeholder={t("password")} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
        <select className="field" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
          {roles.map((role) => <option key={role} value={role}>{t(role)}</option>)}
        </select>
        <button className="btn btn-primary" type="submit">{t("create")}</button>
      </form>
    </div>
  );
}
