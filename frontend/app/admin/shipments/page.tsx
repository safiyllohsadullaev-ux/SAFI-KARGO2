"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export default function ShipmentsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api<{ items: any[] }>("/api/admin/shipments").then((data) => setItems(data.items)); }, []);
  return (
    <div>
      <h1 className="text-3xl font-extrabold">{t("shipments")}</h1>
      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <article key={item.id} className="card p-4">
            <div className="flex items-center justify-between"><b>{item.shipment_number}</b><span className="text-sm font-bold">{item.status}</span></div>
            <p className="mt-1 text-sm text-mute">{t("transport")}: {item.transport || "—"} · {t("orders")}: {item.order_count}</p>
            <p className="text-sm text-mute">{formatWhen(item.departure_date)} → {formatWhen(item.arrival_date)}</p>
          </article>
        ))}
        {items.length === 0 ? <p className="text-sm text-mute">{t("noData")}</p> : null}
      </div>
    </div>
  );
}
