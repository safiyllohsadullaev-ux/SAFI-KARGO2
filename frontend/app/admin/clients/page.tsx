"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function ClientsPage() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const load = () => api<{ items: any[] }>(`/api/admin/clients?q=${encodeURIComponent(q)}`).then((data) => setItems(data.items));
  useEffect(() => { load(); }, []);
  return (
    <div>
      <h1 className="text-3xl font-extrabold">{t("clients")}</h1>
      <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); load(); }}>
        <input className="field" value={q} onChange={(event) => setQ(event.target.value)} placeholder={t("findClient")} />
        <button className="btn btn-dark" type="submit">{t("search")}</button>
      </form>
      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <Link key={item.id} href={`/admin/clients/${item.id}`} className="card flex items-center justify-between p-4">
            <span><b>{item.public_client_id}</b><span className="mt-1 block text-sm text-mute">{item.first_name} {item.last_name} · {item.phone}</span></span>
            <span className="text-sm font-bold">{item.is_blocked ? t("blocked") : t("working")}</span>
          </Link>
        ))}
        {items.length === 0 ? <p className="text-sm text-mute">{t("noData")}</p> : null}
      </div>
    </div>
  );
}
