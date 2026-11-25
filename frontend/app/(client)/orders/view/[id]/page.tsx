"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, fileUrl } from "@/lib/api";
import { STATUS_COLOR, Status, formatWhen } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { ErrorState } from "@/components/ui";

type History = { id: number; previous_status: string | null; new_status: string; changed_at: string; note: string; reason: string; actor_name: string; actor_role: string };
type Order = {
  id: number;
  order_number: string;
  tracking_number: string | null;
  title: string;
  weight: number | null;
  package_count: number;
  current_status: Status;
  delivery_substatus: string | null;
  shipment_number: string | null;
  note: string;
  photo_id: number | null;
  eta_text: string;
  pickup_point: string;
  courier_contact: string;
  confirmation_method: string;
  received_at: string | null;
  history: History[];
};

export default function OrderView() {
  const params = useParams<{ id: string }>();
  const { t } = useI18n();
  const [order, setOrder] = useState<Order | null>(null);
  const [photo, setPhoto] = useState("");
  const [error, setError] = useState("");

  const load = () => {
    setError("");
    api<Order>(`/api/client/orders/${params.id}`)
      .then(async (data) => {
        setOrder(data);
        if (data.photo_id) setPhoto(await fileUrl(data.photo_id));
      })
      .catch((err) => setError(t(err instanceof ApiError ? err.code : "network")));
  };
  useEffect(load, [params.id]);

  if (error) return <ErrorState text={error} onRetry={load} retry={t("retry")} />;
  if (!order) return <div className="skeleton h-80" />;
  const sub = order.delivery_substatus === "handed_to_courier" ? t("handed") : order.delivery_substatus === "delivering" ? t("delivering") : order.delivery_substatus ? t("ready") : "";

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
      <section className="card p-5">
        <Link href={`/orders/${order.current_status}`} className="text-sm font-bold text-mute">{t("back")}</Link>
        <h1 className="mt-2 text-3xl font-extrabold">{order.order_number}</h1>
        <p className="mt-2 inline-flex rounded-full px-3 py-1 text-sm font-extrabold text-white" style={{ background: STATUS_COLOR[order.current_status] }}>{t(`status_${order.current_status}`)}{sub ? ` · ${sub}` : ""}</p>
        <div className="mt-4 space-y-2 text-sm">
          <p>{t("title")}: <b>{order.title || "—"}</b></p>
          <p>{t("tracking")}: <b>{order.tracking_number || "—"}</b></p>
          <p>{t("weight")}: <b>{order.weight ?? "—"} {t("kg")}</b></p>
          <p>{t("places")}: <b>{order.package_count}</b></p>
          {order.shipment_number ? <p>{t("flight")}: <b>{order.shipment_number}</b></p> : null}
          {order.eta_text ? <p>{t("eta")}: <b>{order.eta_text}</b></p> : null}
          {order.pickup_point ? <p>{t("pickupPoint")}: <b>{order.pickup_point}</b></p> : null}
          {order.courier_contact ? <p>{t("courier")}: <b>{order.courier_contact}</b></p> : null}
          {order.confirmation_method ? <p>{t("method")}: <b>{order.confirmation_method}</b></p> : null}
          {order.received_at ? <p>{t("date")}: <b>{formatWhen(order.received_at)}</b></p> : null}
          {order.note ? <p>{t("note")}: <b>{order.note}</b></p> : null}
        </div>
        {photo ? <img src={photo} alt="" className="mt-4 max-h-72 w-full rounded-2xl object-cover" /> : null}
      </section>
      <section className="card p-5">
        <h2 className="text-lg font-extrabold">{t("history")}</h2>
        <ol className="mt-4 space-y-4">
          {order.history.map((item) => (
            <li key={item.id} className="border-l-2 border-brand pl-4">
              <p className="font-extrabold">{t(`status_${item.new_status}`)}</p>
              <p className="text-sm text-mute">{formatWhen(item.changed_at)}</p>
              {item.actor_name ? <p className="text-sm">{item.actor_name}</p> : null}
              {item.note ? <p className="text-sm">{item.note}</p> : null}
              {item.reason ? <p className="text-sm text-mute">{t("reason")}: {item.reason}</p> : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
