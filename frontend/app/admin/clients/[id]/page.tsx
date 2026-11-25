"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui";

export default function ClientDetail() {
  const params = useParams<{ id: string }>();
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const load = () => api(`/api/admin/clients/${params.id}`).then(setData);
  useEffect(() => { load(); api<{ items: any[] }>("/api/admin/branches").then((rows) => setBranches(rows.items)); }, [params.id]);
  if (!data) return <div className="skeleton h-40" />;
  const client = data.user;
  const save = async (patch: Record<string, unknown>) => {
    await api(`/api/admin/clients/${client.id}`, { method: "PATCH", body: JSON.stringify(patch) });
    toast(t("saved"));
    load();
  };
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold">{client.public_client_id}</h1>
      <section className="card space-y-2 p-5">
        <p className="font-extrabold">{client.first_name} {client.last_name}</p>
        <p>{client.phone}</p>
        <p>{data.branch?.name || t("noBranch")}</p>
        {user?.role === "super_admin" ? (
          <div className="flex flex-wrap gap-2 pt-2">
            <select className="field max-w-xs" value={client.branch_id || ""} onChange={(event) => save({ branch_id: event.target.value ? Number(event.target.value) : 0 })}>
              <option value="">{t("noBranch")}</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            <button className="btn btn-dark" type="button" onClick={() => save({ is_blocked: !client.is_blocked })}>{client.is_blocked ? t("unblock") : t("block")}</button>
          </div>
        ) : null}
      </section>
      <h2 className="text-xl font-extrabold">{t("clientOrders")}</h2>
      {data.orders.map((order: any) => (
        <article key={order.id} className="card p-4"><b>{order.order_number}</b><p className="text-sm text-mute">{t(`status_${order.current_status}`)} · {order.tracking_number || "—"}</p></article>
      ))}
    </div>
  );
}
