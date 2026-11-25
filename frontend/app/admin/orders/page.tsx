"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { STATUS_COLOR, STATUSES, Status, formatWhen } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { ErrorState, Modal, useToast } from "@/components/ui";

type Order = {
  id: number;
  order_number: string;
  public_client_id: string;
  client_name: string;
  tracking_number: string | null;
  title: string;
  weight: number | null;
  package_count: number;
  current_status: Status;
  shipment_number: string | null;
  note: string;
  history?: { id: number; new_status: string; changed_at: string; actor_name: string; reason: string; note: string }[];
};

const nextOf: Partial<Record<Status, Status>> = {
  in_transit: "tj_warehouse",
  tj_warehouse: "sorting",
  sorting: "delivery",
  delivery: "received",
};

export default function AdminOrders() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Order[]>([]);
  const [status, setStatus] = useState("china_warehouse");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [detail, setDetail] = useState<Order | null>(null);
  const [reason, setReason] = useState("");
  const [form, setForm] = useState({ public_client_id: "", tracking_number: "", title: "", weight: "", package_count: "1", note: "" });
  const [ship, setShip] = useState({ shipment_number: "", transport: "", note: "" });
  const [importResult, setImportResult] = useState<any>(null);

  const load = () => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    api<{ items: Order[] }>(`/api/admin/orders?${params}`)
      .then((data) => { setItems(data.items); setSelected([]); })
      .catch((err) => setError(t(err instanceof ApiError ? err.code : "network")));
  };
  useEffect(load, [status]);

  const canCreate = user?.role === "super_admin" || user?.role === "warehouse_china";
  const canDispatch = canCreate && status === "china_warehouse";
  const canMove = user?.role === "super_admin" || user?.role === "warehouse_tajikistan";
  const next = nextOf[status as Status];

  const toggle = (id: number) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api("/api/admin/orders", { method: "POST", body: JSON.stringify({ ...form, weight: form.weight ? Number(form.weight) : null, package_count: Number(form.package_count || 1) }) });
      setCreateOpen(false);
      toast(t("saved"));
      load();
    } catch (err) {
      toast(t(err instanceof ApiError ? err.code : "network"), "err");
    }
  };

  const dispatch = async () => {
    try {
      await api("/api/admin/dispatch", { method: "POST", body: JSON.stringify({ order_ids: selected, ...ship }) });
      setDispatchOpen(false);
      toast(t("saved"));
      load();
    } catch (err) {
      toast(t(err instanceof ApiError ? err.code : "network"), "err");
    }
  };

  const move = async (to: string) => {
    try {
      await api("/api/admin/transition", { method: "POST", body: JSON.stringify({ order_ids: selected, to_status: to, delivery_substatus: to === "delivery" ? "ready_for_pickup" : null }) });
      toast(t("saved"));
      load();
    } catch (err) {
      toast(t(err instanceof ApiError ? err.code : "network"), "err");
    }
  };

  const correct = async (to: string) => {
    if (!detail) return;
    if (!reason.trim()) { toast(t("reasonNeed"), "err"); return; }
    try {
      await api(`/api/admin/orders/${detail.id}/correct`, { method: "POST", body: JSON.stringify({ to_status: to, reason }) });
      setDetail(null);
      setReason("");
      toast(t("saved"));
      load();
    } catch (err) {
      toast(t(err instanceof ApiError ? err.code : "network"), "err");
    }
  };

  const uploadPhoto = async (id: number, file: File) => {
    const body = new FormData();
    body.set("upload", file);
    await api(`/api/admin/orders/${id}/photo`, { method: "POST", body });
    toast(t("saved"));
  };

  const importFile = async (file: File) => {
    const body = new FormData();
    body.set("upload", file);
    const result = await api("/api/admin/import", { method: "POST", body });
    setImportResult(result);
    load();
  };

  if (error) return <ErrorState text={error} onRetry={load} retry={t("retry")} />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-extrabold">{t("orders")}</h1>
        <div className="flex flex-wrap gap-2">
          {canCreate ? <button className="btn btn-primary" type="button" onClick={() => setCreateOpen(true)}>{t("addOrder")}</button> : null}
          {canCreate ? <label className="btn btn-ghost">{t("import")}<input className="hidden" type="file" accept=".csv,.xlsx" onChange={(event) => event.target.files?.[0] && importFile(event.target.files[0])} /></label> : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {["", ...STATUSES].map((item) => (
          <button key={item || "all"} className={`rounded-full px-3 py-2 text-xs font-extrabold ${status === item ? "bg-ink text-white" : "bg-white"}`} type="button" onClick={() => setStatus(item)}>{item ? t(`status_${item}`) : t("all")}</button>
        ))}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); load(); }}>
        <input className="field" value={q} onChange={(event) => setQ(event.target.value)} placeholder={t("search")} />
        <button className="btn btn-dark" type="submit">{t("search")}</button>
      </form>
      {selected.length ? (
        <div className="card mt-3 flex flex-wrap items-center gap-2 p-3">
          <b>{selected.length} {t("selected")}</b>
          {canDispatch ? <button className="btn btn-primary" type="button" onClick={() => setDispatchOpen(true)}>{t("dispatch")}</button> : null}
          {canMove && next ? <button className="btn btn-dark" type="button" onClick={() => move(next)}>{t("next")}: {t(`status_${next}`)}</button> : null}
        </div>
      ) : null}
      <div className="mt-4 hidden overflow-hidden rounded-card bg-white shadow-card lg:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-mist text-xs uppercase text-mute"><tr><th className="p-3"></th><th className="p-3">{t("orders")}</th><th>{t("client")}</th><th>{t("tracking")}</th><th>{t("weight")}</th><th>{t("status")}</th><th></th></tr></thead>
          <tbody>
            {items.map((order) => (
              <tr key={order.id} className="border-t border-line">
                <td className="p-3"><input type="checkbox" checked={selected.includes(order.id)} onChange={() => toggle(order.id)} aria-label={t("select")} /></td>
                <td className="p-3 font-extrabold">{order.order_number}<div className="font-medium text-mute">{order.title}</div></td>
                <td>{order.public_client_id}<div className="text-mute">{order.client_name}</div></td>
                <td>{order.tracking_number || "—"}</td>
                <td>{order.weight ?? "—"}</td>
                <td><span className="rounded-full px-2 py-1 text-xs font-bold text-white" style={{ background: STATUS_COLOR[order.current_status] }}>{t(`status_${order.current_status}`)}</span></td>
                <td className="p-3"><button className="font-bold text-brand" type="button" onClick={() => api<Order>(`/api/admin/orders/${order.id}`).then(setDetail)}>{t("details")}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? <p className="p-6 text-sm text-mute">{t("noData")}</p> : null}
      </div>
      <div className="mt-4 grid gap-3 lg:hidden">
        {items.map((order) => (
          <article key={order.id} className="card p-4">
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={selected.includes(order.id)} onChange={() => toggle(order.id)} />{order.order_number}</label>
            <p className="mt-1 text-sm">{order.public_client_id} · {order.tracking_number || "—"}</p>
            <button className="mt-2 text-sm font-extrabold text-brand" type="button" onClick={() => api<Order>(`/api/admin/orders/${order.id}`).then(setDetail)}>{t("details")}</button>
          </article>
        ))}
      </div>
      {importResult ? <pre className="card mt-3 overflow-auto p-3 text-xs">{JSON.stringify(importResult, null, 2)}</pre> : null}

      <Modal open={createOpen} title={t("addOrder")} onClose={() => setCreateOpen(false)}>
        <form onSubmit={create} className="space-y-2">
          <input className="field" placeholder={t("clientId")} value={form.public_client_id} onChange={(event) => setForm({ ...form, public_client_id: event.target.value })} required />
          <input className="field" placeholder={t("tracking")} value={form.tracking_number} onChange={(event) => setForm({ ...form, tracking_number: event.target.value })} />
          <input className="field" placeholder={t("title")} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          <input className="field" placeholder={t("weight")} value={form.weight} onChange={(event) => setForm({ ...form, weight: event.target.value })} />
          <input className="field" placeholder={t("places")} value={form.package_count} onChange={(event) => setForm({ ...form, package_count: event.target.value })} />
          <textarea className="field" placeholder={t("note")} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
          <button className="btn btn-primary w-full" type="submit">{t("create")}</button>
        </form>
      </Modal>

      <Modal open={dispatchOpen} title={t("dispatch")} onClose={() => setDispatchOpen(false)}>
        <p className="mb-3 text-sm">{t("dispatchAsk")}</p>
        <p className="mb-3 font-extrabold">{t("confirmCount")}: {selected.length}</p>
        <input className="field mb-2" placeholder={`${t("shipmentNo")} (${t("optional")})`} value={ship.shipment_number} onChange={(event) => setShip({ ...ship, shipment_number: event.target.value })} />
        <input className="field mb-2" placeholder={t("transport")} value={ship.transport} onChange={(event) => setShip({ ...ship, transport: event.target.value })} />
        <textarea className="field mb-3" placeholder={t("note")} value={ship.note} onChange={(event) => setShip({ ...ship, note: event.target.value })} />
        <button className="btn btn-primary w-full" type="button" onClick={dispatch}>{t("confirm")}</button>
      </Modal>

      <Modal open={!!detail} title={detail?.order_number || ""} onClose={() => setDetail(null)}>
        {detail ? (
          <div className="space-y-2 text-sm">
            <p>{detail.public_client_id} · {detail.client_name}</p>
            <p>{t("tracking")}: {detail.tracking_number || "—"}</p>
            <p>{t("weight")}: {detail.weight ?? "—"} · {t("places")}: {detail.package_count}</p>
            <p>{t("flight")}: {detail.shipment_number || "—"}</p>
            {detail.note ? <p>{detail.note}</p> : null}
            {canCreate || user?.role === "warehouse_tajikistan" ? <label className="btn btn-ghost">{t("photoAdd")}<input className="hidden" type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && uploadPhoto(detail.id, event.target.files[0])} /></label> : null}
            <h3 className="pt-2 font-extrabold">{t("history")}</h3>
            {detail.history?.map((item) => <p key={item.id}>{formatWhen(item.changed_at)} · {t(`status_${item.new_status}`)} · {item.actor_name} {item.reason}</p>)}
            {user?.role === "super_admin" ? (
              <div className="pt-2">
                <input className="field mb-2" placeholder={t("reason")} value={reason} onChange={(event) => setReason(event.target.value)} />
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((item) => <button key={item} className="btn btn-ghost px-3 py-2 text-xs" type="button" onClick={() => correct(item)}>{t(`status_${item}`)}</button>)}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
