"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { ErrorState } from "@/components/ui";
import { Logo } from "@/components/Logo";

type Ready = { id: number; order_number: string; token: string; pickup_point: string; delivery_substatus: string | null };

export default function QrPage() {
  const { t } = useI18n();
  const [data, setData] = useState<{ identity: string; ready: Ready[] } | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  const load = () => {
    setError("");
    api<{ identity: string; ready: Ready[] }>("/api/client/qr")
      .then(setData)
      .catch((err) => setError(t(err instanceof ApiError ? err.code : "network")));
  };
  useEffect(load, []);
  if (error) return <ErrorState text={error} onRetry={load} retry={t("retry")} />;
  if (!data) return <div className="skeleton h-96" />;
  const current = data.ready.find((item) => item.id === open) || data.ready[0];

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-3xl font-extrabold">{t("qrTitle")}</h1>
      <section className="card p-5 text-center">
        <div className="mb-4 flex justify-center"><Logo /></div>
        {data.ready.length === 0 || !current || open === null && data.ready.length > 0 && false ? (
          <>
            <div className="mx-auto grid h-64 w-full max-w-xs place-items-center rounded-3xl bg-[repeating-linear-gradient(90deg,#f4f4f5,#f4f4f5_10px,#fff_10px,#fff_18px)]">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-white text-3xl text-mute">+</span>
            </div>
            <h2 className="mt-5 text-2xl font-extrabold">{t("qrEmpty")}</h2>
            <p className="mt-2 text-sm text-mute">{t("qrEmptyHint")}</p>
          </>
        ) : (
          <>
            {data.ready.length > 1 ? (
              <div className="mb-4 flex flex-wrap justify-center gap-2">
                {data.ready.map((item) => (
                  <button key={item.id} className={`rounded-full px-3 py-1 text-sm font-bold ${current.id === item.id ? "bg-brand text-white" : "bg-mist"}`} type="button" onClick={() => setOpen(item.id)}>{item.order_number}</button>
                ))}
              </div>
            ) : null}
            {open === current.id || data.ready.length === 1 ? (
              <div className="mx-auto w-fit rounded-3xl bg-white p-4 shadow-card">
                <QRCodeSVG value={current.token} size={220} />
              </div>
            ) : (
              <button className="btn btn-primary" type="button" onClick={() => setOpen(current.id)}>{t("showQr")}</button>
            )}
            <p className="mt-4 text-lg font-extrabold">{current.order_number}</p>
            <p className="text-sm text-mute">{current.delivery_substatus === "handed_to_courier" ? t("handed") : current.delivery_substatus === "delivering" ? t("delivering") : t("ready")}</p>
            {current.pickup_point ? <p className="mt-1 text-sm">{current.pickup_point}</p> : null}
            <p className="mt-3 text-xs text-mute">{t("secureQr")}</p>
          </>
        )}
      </section>
      <section className="card p-5 text-center">
        <h2 className="font-extrabold">{t("identityQr")}</h2>
        <p className="mb-3 text-sm text-mute">{t("identityHint")}</p>
        <div className="mx-auto w-fit rounded-3xl bg-white p-4">
          <QRCodeSVG value={data.identity} size={160} />
        </div>
        <p className="mt-3 font-extrabold">{data.identity}</p>
      </section>
    </div>
  );
}
