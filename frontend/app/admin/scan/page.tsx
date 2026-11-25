"use client";

import { FormEvent, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui";

export default function ScanPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [token, setToken] = useState("");
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState("");

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const data = await api<{ order: any }>("/api/admin/qr/verify", { method: "POST", body: JSON.stringify({ token }) });
      setOrder(data.order);
    } catch (err) {
      setOrder(null);
      setError(t(err instanceof ApiError ? err.code : "network"));
    }
  };

  const confirm = async () => {
    try {
      await api("/api/admin/qr/confirm", { method: "POST", body: JSON.stringify({ token }) });
      toast(t("saved"));
      setOrder(null);
      setToken("");
    } catch (err) {
      setError(t(err instanceof ApiError ? err.code : "network"));
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-3xl font-extrabold">{t("scan")}</h1>
      <p className="mt-2 text-sm text-mute">{t("secureQr")}</p>
      <form onSubmit={verify} className="mt-4 space-y-3">
        <textarea className="field min-h-28" value={token} onChange={(event) => setToken(event.target.value)} placeholder={t("pasteToken")} />
        <button className="btn btn-dark w-full" type="submit">{t("checkToken")}</button>
      </form>
      {error ? <p className="mt-3 font-bold text-brand">{error}</p> : null}
      {order ? (
        <section className="card mt-4 space-y-2 p-4">
          <p className="text-xl font-extrabold">{order.order_number}</p>
          <p>{order.client_name}</p>
          <p>{order.public_client_id}</p>
          <p>{t(`status_${order.current_status}`)}</p>
          <button className="btn btn-primary" type="button" onClick={confirm}>{t("confirmGive")}</button>
        </section>
      ) : null}
    </div>
  );
}
