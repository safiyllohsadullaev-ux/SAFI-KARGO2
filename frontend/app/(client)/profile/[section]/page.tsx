"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatWhen } from "@/lib/format";
import { NOTIF_KEY, pick, useI18n } from "@/lib/i18n";
import { Empty, ErrorState, useToast } from "@/components/ui";

export default function ProfileSection() {
  const params = useParams<{ section: string }>();
  const { t, lang, setLang } = useI18n();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [weight, setWeight] = useState("1");
  const [tariffId, setTariffId] = useState("");
  const [quote, setQuote] = useState<any>(null);
  const [address, setAddress] = useState("");
  const [check, setCheck] = useState<any>(null);
  const [first, setFirst] = useState(user?.first_name || "");
  const [last, setLast] = useState(user?.last_name || "");

  const load = () => {
    setError("");
    const section = params.section;
    const path =
      section === "branch" ? "/api/auth/me" :
      section === "terms" ? "/api/client/terms" :
      section === "tariffs" || section === "calculator" ? "/api/client/tariffs" :
      section === "stats" ? "/api/client/stats" :
      section === "prohibited" ? "/api/client/prohibited" :
      section === "lessons" ? "/api/client/lessons" :
      section === "notifications" ? "/api/client/notifications" :
      section === "address-check" ? "/api/client/home" :
      "";
    if (!path) { setData({}); return; }
    api(path).then(setData).catch((err) => setError(t(err instanceof ApiError ? err.code : "network")));
  };
  useEffect(load, [params.section]);

  const saveName = async (event: FormEvent) => {
    event.preventDefault();
    await api("/api/auth/me", { method: "PATCH", body: JSON.stringify({ first_name: first, last_name: last }) });
    await refresh();
    toast(t("saveName"));
  };

  const changeLang = async (next: "tj" | "ru" | "en") => {
    setLang(next);
    await api("/api/auth/me", { method: "PATCH", body: JSON.stringify({ language: next }) });
    toast(t("langSaved"));
  };

  if (error) return <ErrorState text={error} onRetry={load} retry={t("retry")} />;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/profile" className="text-sm font-bold text-mute">{t("back")}</Link>
      <h1 className="mt-2 text-3xl font-extrabold">{t(titleKey(params.section))}</h1>
      <div className="mt-4">
        {params.section === "branch" && data ? (
          data.branch ? (
            <section className="card space-y-2 p-5">
              <p className="text-xl font-extrabold">{data.branch.name}</p>
              {data.branch.address ? <p>{data.branch.address}</p> : null}
              {data.branch.phone ? <p>{data.branch.phone}</p> : null}
              {data.branch.hours ? <p>{t("hours")}: {data.branch.hours}</p> : null}
              {data.branch.map_url ? <a className="btn btn-primary" href={data.branch.map_url} target="_blank" rel="noreferrer">{t("openMap")}</a> : null}
            </section>
          ) : <Empty title={t("noBranch")} />
        ) : null}

        {params.section === "terms" && data ? (
          pick(data.terms, lang) ? <article className="card whitespace-pre-wrap p-5">{pick(data.terms, lang)}</article> : <Empty title={t("termsEmpty")} />
        ) : null}

        {params.section === "tariffs" && data ? (
          data.items?.length ? (
            <div className="grid gap-3">{data.items.map((item: any) => (
              <article key={item.id} className="card p-4">
                <h2 className="font-extrabold">{item.category}</h2>
                <p className="text-2xl font-extrabold text-brand">{item.price_per_kg} {item.currency} <span className="text-sm text-mute">{t("perKg")}</span></p>
                {item.min_weight ? <p className="text-sm text-mute">{t("minWeight")}: {item.min_weight} {t("kg")}</p> : null}
                {item.conditions ? <p className="mt-2 text-sm">{item.conditions}</p> : null}
              </article>
            ))}</div>
          ) : <Empty title={t("noTariffs")} />
        ) : null}

        {params.section === "stats" && data?.total !== undefined ? (
          <div className="grid grid-cols-2 gap-3">
            <Stat label={t("total")} value={data.total} />
            <Stat label={t("onWay")} value={data.in_transit} />
            <Stat label={t("inWarehouse")} value={data.in_warehouse} />
            <Stat label={t("got")} value={data.received} />
            <Stat label={t("totalWeight")} value={`${data.received_weight} ${t("kg")}`} />
          </div>
        ) : null}

        {params.section === "prohibited" && data ? (
          data.items?.length ? data.items.map((item: any) => (
            <article key={item.id} className="card mb-3 p-4"><h2 className="font-extrabold">{pick(item.title, lang)}</h2><p className="text-sm text-mute">{pick(item.note, lang)}</p></article>
          )) : <Empty title={t("prohibitedEmpty")} />
        ) : null}

        {params.section === "lessons" && data ? (
          data.items?.length ? data.items.map((item: any) => (
            <article key={item.id} className="card mb-3 p-4"><h2 className="font-extrabold">{pick(item.title, lang)}</h2><p className="mt-2 whitespace-pre-wrap text-sm">{pick(item.body, lang)}</p></article>
          )) : <Empty title={t("lessonsEmpty")} />
        ) : null}

        {params.section === "calculator" && data ? (
          data.items?.length ? (
            <form className="card space-y-3 p-5" onSubmit={async (event) => {
              event.preventDefault();
              const result = await api("/api/client/calculator", { method: "POST", body: JSON.stringify({ weight: Number(weight), tariff_id: Number(tariffId || data.items[0].id) }) });
              setQuote(result);
            }}>
              <select className="field" value={tariffId || data.items[0].id} onChange={(event) => setTariffId(event.target.value)}>
                {data.items.map((item: any) => <option key={item.id} value={item.id}>{item.category}</option>)}
              </select>
              <input className="field" type="number" min="0.01" step="0.01" value={weight} onChange={(event) => setWeight(event.target.value)} />
              <button className="btn btn-primary w-full" type="submit">{t("calcRun")}</button>
              {quote ? <div className="rounded-2xl bg-red-50 p-4"><p className="text-sm">{t("estimate")}</p><p className="text-3xl font-extrabold">{quote.amount} {quote.currency}</p><p className="text-sm text-mute">{quote.billable_weight} {t("kg")}</p></div> : null}
              <p className="text-sm text-mute">{t("calcWarn")}</p>
            </form>
          ) : <Empty title={t("calcEmpty")} />
        ) : null}

        {params.section === "address-check" ? (
          <form className="card space-y-3 p-5" onSubmit={async (event) => {
            event.preventDefault();
            setCheck(await api("/api/client/address-check", { method: "POST", body: JSON.stringify({ text: address }) }));
          }}>
            <p className="text-sm text-mute">{t("checkHint")}</p>
            <textarea className="field min-h-32" value={address} onChange={(event) => setAddress(event.target.value)} />
            <button className="btn btn-primary" type="submit">{t("checkRun")}</button>
            {check ? (
              <div className="rounded-2xl bg-mist p-4 text-sm">
                {!check.configured ? <p>{t("checkNoWarehouse")}</p> : <p className="font-extrabold">{check.ok ? t("checkOk") : t("checkBad")}</p>}
                {check.missing?.length ? <p className="mt-2">{t("missing")}: {check.missing.map((item: string) => t(item === "code" ? "clientId" : item === "phone" ? "phone" : "address")).join(", ")}</p> : null}
              </div>
            ) : null}
          </form>
        ) : null}

        {params.section === "notifications" && data ? (
          <div>
            <button className="btn btn-ghost mb-3" type="button" onClick={async () => { await api("/api/client/notifications/read", { method: "POST" }); load(); }}>{t("markRead")}</button>
            {data.items?.length ? data.items.map((item: any) => (
              <article key={item.id} className="card mb-2 p-4">
                <p className="font-extrabold">{t(NOTIF_KEY[item.type] || "notifications")}</p>
                <p className="text-sm">{item.payload?.order_number || ""}</p>
                <p className="text-xs text-mute">{formatWhen(item.created_at)}</p>
              </article>
            )) : <Empty title={t("notifEmpty")} />}
          </div>
        ) : null}

        {params.section === "settings" ? (
          <form onSubmit={saveName} className="card space-y-3 p-5">
            <input className="field" value={first} onChange={(event) => setFirst(event.target.value)} />
            <input className="field" value={last} onChange={(event) => setLast(event.target.value)} />
            <div className="flex gap-2">
              {(["tj", "ru", "en"] as const).map((item) => (
                <button key={item} type="button" className={`btn ${lang === item ? "btn-primary" : "btn-ghost"}`} onClick={() => changeLang(item)}>{item.toUpperCase()}</button>
              ))}
            </div>
            <button className="btn btn-primary" type="submit">{t("save")}</button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function titleKey(section: string) {
  const map: Record<string, string> = {
    branch: "yourBranch", terms: "terms", tariffs: "tariffs", stats: "stats", prohibited: "prohibited",
    lessons: "lessons", calculator: "calculator", "address-check": "addressCheck", notifications: "notifications", settings: "settings",
  };
  return map[section] || "profile";
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <article className="card p-4"><p className="text-sm text-mute">{label}</p><p className="text-2xl font-extrabold">{value}</p></article>;
}
