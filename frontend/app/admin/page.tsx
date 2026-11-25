"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { STATUS_COLOR, STATUSES } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { ErrorState } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function Dashboard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const load = () => api<any>("/api/admin/dashboard").then(setData).catch((err) => setError(t(err instanceof ApiError ? err.code : "network")));
  useEffect(() => { load(); }, []);
  if (error) return <ErrorState text={error} onRetry={load} retry={t("retry")} />;
  if (!data) return <div className="skeleton h-64" />;
  const maxReg = Math.max(1, ...data.registrations.map((item: { count: number }) => item.count));
  const maxOrder = Math.max(1, ...STATUSES.map((status) => data.counts[status] || 0));
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-extrabold">{t("dashboard")}</h1>
        <p className="text-sm text-mute">{t(user?.role || "staff")}</p>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label={t("clients")} value={data.clients} />
        <Tile label={t("newClients")} value={data.new_clients} />
        <Tile label={t("openChats")} value={data.open_chats} />
        <Tile label={t("orders")} value={STATUSES.reduce((sum, status) => sum + (data.counts[status] || 0), 0)} />
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {STATUSES.map((status) => (
          <article key={status} className="card p-4">
            <p className="text-sm text-mute">{t(`status_${status}`)}</p>
            <p className="text-3xl font-extrabold" style={{ color: STATUS_COLOR[status] }}>{data.counts[status] || 0}</p>
          </article>
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Chart title={t("chartOrders")} rows={STATUSES.map((status) => ({ label: t(`status_${status}`), value: data.counts[status] || 0, color: STATUS_COLOR[status] }))} max={maxOrder} empty={t("emptyChart")} />
        <Chart title={t("chartRegs")} rows={data.registrations.map((item: { date: string; count: number }) => ({ label: item.date.slice(5), value: item.count, color: "#E53935" }))} max={maxReg} empty={t("emptyChart")} />
      </section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return <article className="card p-4"><p className="text-sm text-mute">{label}</p><p className="text-3xl font-extrabold">{value}</p></article>;
}

function Chart({ title, rows, max, empty }: { title: string; rows: { label: string; value: number; color: string }[]; max: number; empty: string }) {
  const has = rows.some((row) => row.value > 0);
  return (
    <article className="card p-4">
      <h2 className="mb-4 font-extrabold">{title}</h2>
      {has ? (
        <div className="flex h-44 items-end gap-2">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-1 flex-col items-center gap-2">
              <div className="w-full rounded-t-xl" style={{ height: `${Math.max(6, (row.value / max) * 100)}%`, background: row.color }} />
              <span className="text-[10px] font-bold text-mute">{row.label}</span>
            </div>
          ))}
        </div>
      ) : <p className="text-sm text-mute">{empty}</p>}
    </article>
  );
}
