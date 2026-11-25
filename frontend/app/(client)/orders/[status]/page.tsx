"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { STATUS_COLOR, STATUSES, Status } from "@/lib/format";
import { formatWhen } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { Empty, ErrorState } from "@/components/ui";

type Order = {
  id: number;
  order_number: string;
  tracking_number: string | null;
  title: string;
  weight: number | null;
  package_count: number;
  current_status: string;
  shipment_number: string | null;
  eta_text: string;
  china_arrived_at: string | null;
  departed_at: string | null;
  tj_arrived_at: string | null;
  sorting_started_at: string | null;
  delivery_started_at: string | null;
  received_at: string | null;
  note: string;
};

const whenKey: Record<string, keyof Order> = {
  china_warehouse: "china_arrived_at",
  in_transit: "departed_at",
  tj_warehouse: "tj_arrived_at",
  sorting: "sorting_started_at",
  delivery: "delivery_started_at",
  received: "received_at",
};

export default function StatusPage() {
  const params = useParams<{ status: string }>();
  const status = params.status as Status;
  const { t } = useI18n();
  const [items, setItems] = useState<Order[] | null>(null);
  const [error, setError] = useState("");
  const valid = STATUSES.includes(status);

  const load = () => {
    if (!valid) return;
    setError("");
    api<{ items: Order[] }>(`/api/client/orders?status=${status}`)
      .then((data) => setItems(data.items))
      .catch((err) => setError(t(err instanceof ApiError ? err.code : "network")));
  };
  useEffect(load, [status]);

  if (!valid) return <Empty title={t("noData")} />;
  if (error) return <ErrorState text={error} onRetry={load} retry={t("retry")} />;
  if (!items) return <div className="skeleton h-64" />;

  return (
    <div>
      <Link href="/orders" className="text-sm font-bold text-mute">{t("back")}</Link>
      <h1 className="mt-2 text-3xl font-extrabold" style={{ color: STATUS_COLOR[status] }}>{t(`status_${status}`)}</h1>
      <p className="text-mute">{t(`desc_${status}`)}</p>
      {items.length === 0 ? <div className="mt-4"><Empty title={t(`empty_${status}`)} /></div> : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {items.map((order) => (
            <Link key={order.id} href={`/orders/view/${order.id}`} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-extrabold">{order.order_number}</p>
                  <p className="text-sm text-mute">{order.title || order.tracking_number || "—"}</p>
                </div>
                <span className="rounded-full px-3 py-1 text-xs font-extrabold text-white" style={{ background: STATUS_COLOR[status] }}>{t(`status_${status}`)}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <span>{t("tracking")}: <b>{order.tracking_number || "—"}</b></span>
                <span>{t("weight")}: <b>{order.weight ?? "—"} {t("kg")}</b></span>
                <span>{t("places")}: <b>{order.package_count}</b></span>
                <span>{t("date")}: <b>{formatWhen(order[whenKey[status]] as string | null)}</b></span>
                {order.shipment_number ? <span>{t("flight")}: <b>{order.shipment_number}</b></span> : null}
                {order.eta_text ? <span>{t("eta")}: <b>{order.eta_text}</b></span> : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
