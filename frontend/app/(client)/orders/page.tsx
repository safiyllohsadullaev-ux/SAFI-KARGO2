"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Bike, Boxes, CheckCircle2, Search, Store, Truck, Warehouse } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { STATUS_COLOR, Status } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { ErrorState } from "@/components/ui";

const icons = {
  china_warehouse: Warehouse,
  in_transit: Truck,
  tj_warehouse: Store,
  sorting: Boxes,
  delivery: Bike,
  received: CheckCircle2,
};

const order: Status[] = ["china_warehouse", "in_transit", "tj_warehouse", "sorting", "delivery", "received"];

export default function OrdersPage() {
  const { t } = useI18n();
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [socials, setSocials] = useState<{ key: string; url: string }[]>([]);
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Record<string, string> | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setError("");
    api<{ counts: Record<string, number> }>("/api/client/orders")
      .then((data) => setCounts(data.counts))
      .catch((err) => setError(t(err instanceof ApiError ? err.code : "network")));
    api<{ socials: { key: string; url: string }[] }>("/api/client/home").then((data) => setSocials(data.socials)).catch(() => undefined);
  };
  useEffect(load, []);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    setMissing(false);
    setFound(null);
    try {
      const data = await api<Record<string, string>>(`/api/client/track?code=${encodeURIComponent(code.trim())}`);
      setFound(data);
    } catch (err) {
      if (err instanceof ApiError && err.code === "order_not_found") setMissing(true);
      else setError(t(err instanceof ApiError ? err.code : "network"));
    }
  };

  if (error) return <ErrorState text={error} onRetry={load} retry={t("retry")} />;
  if (!counts) return <div className="skeleton h-80" />;

  return (
    <div>
      <h1 className="text-3xl font-extrabold">{t("orders")}</h1>
      <p className="mt-1 text-mute">{t("ordersHint")}</p>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {order.map((status) => {
          const Icon = icons[status];
          return (
            <Link key={status} href={`/orders/${status}`} className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5">
              <span className="h-14 w-1.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
              <span className="grid h-12 w-12 place-items-center rounded-2xl" style={{ background: `${STATUS_COLOR[status]}18`, color: STATUS_COLOR[status] }}><Icon size={22} /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold">{t(`status_${status}`)}</span>
                <span className="block text-sm text-mute">{t(`desc_${status}`)}</span>
              </span>
              <span className="grid h-9 min-w-9 place-items-center rounded-full px-2 text-sm font-extrabold text-white" style={{ background: STATUS_COLOR[status] }}>{counts[status] || 0}</span>
            </Link>
          );
        })}
      </div>

      <form onSubmit={search} className="card mt-4 bg-gradient-to-r from-red-50 to-white p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand text-white"><Search /></span>
          <div>
            <h2 className="font-extrabold">{t("trackTitle")}</h2>
            <p className="text-sm text-mute">{t("trackHint")}</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <input className="field" value={code} onChange={(event) => setCode(event.target.value)} placeholder={t("trackHint")} required />
          <button className="btn btn-primary" type="submit">{t("trackAction")}</button>
        </div>
        {missing ? (
          <div className="mt-3 text-sm">
            <p className="font-bold">{t("trackMissing")}</p>
            <Link href="/messages" className="mt-2 inline-block font-extrabold text-brand">{t("askSupport")}</Link>
          </div>
        ) : null}
        {found ? (
          <Link href={`/orders/view/${found.id}`} className="mt-3 block rounded-2xl bg-white p-3">
            <b>{found.order_number}</b>
            <span className="mt-1 block text-sm text-mute">{t(`status_${found.current_status}`)}</span>
          </Link>
        ) : null}
      </form>

      {socials.length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {socials.map((item) => (
            <a key={item.key} href={item.url} target="_blank" rel="noreferrer" className="card px-4 py-4 font-extrabold capitalize">{item.key}</a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
