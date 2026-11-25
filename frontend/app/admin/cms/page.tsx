"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui";

export default function CmsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => { api("/api/admin/cms").then(setData); }, []);
  if (!data) return <div className="skeleton h-40" />;
  const save = async () => {
    await api("/api/admin/cms", { method: "PUT", body: JSON.stringify({ banner: data.banner, eta: data.eta, terms: data.terms, info_notice: data.info_notice, marketplaces: data.marketplaces, socials: data.socials }) });
    toast(t("saved"));
  };
  const setLangField = (group: string, lang: string, value: string, field = "") => {
    const current = data[group] || {};
    if (field) setData({ ...data, [group]: { ...current, [field]: { ...(current[field] || {}), [lang]: value } } });
    else setData({ ...data, [group]: { ...current, [lang]: value } });
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-3xl font-extrabold">{t("cms")}</h1><button className="btn btn-primary" type="button" onClick={save}>{t("save")}</button></div>
      {(["tj", "ru", "en"] as const).map((lang) => (
        <section key={lang} className="card space-y-2 p-4">
          <p className="font-extrabold uppercase">{lang}</p>
          <input className="field" value={data.banner?.title?.[lang] || ""} onChange={(event) => setLangField("banner", lang, event.target.value, "title")} placeholder={t("banner")} />
          <input className="field" value={data.banner?.subtitle?.[lang] || ""} onChange={(event) => setLangField("banner", lang, event.target.value, "subtitle")} placeholder={t("subtitle")} />
          <input className="field" value={data.eta?.[lang] || ""} onChange={(event) => setLangField("eta", lang, event.target.value)} placeholder={t("arrival")} />
          <textarea className="field" value={data.terms?.[lang] || ""} onChange={(event) => setLangField("terms", lang, event.target.value)} placeholder={t("terms")} />
          <input className="field" value={data.info_notice?.[lang] || ""} onChange={(event) => setLangField("info_notice", lang, event.target.value)} placeholder={t("notice")} />
        </section>
      ))}
      <section className="card space-y-2 p-4">
        <h2 className="font-extrabold">{t("markets")}</h2>
        {data.marketplaces.map((item: any) => (
          <div key={item.id} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <input className="field" value={item.name} onChange={(event) => setData({ ...data, marketplaces: data.marketplaces.map((row: any) => row.id === item.id ? { ...row, name: event.target.value } : row) })} />
            <input className="field" value={item.url} onChange={(event) => setData({ ...data, marketplaces: data.marketplaces.map((row: any) => row.id === item.id ? { ...row, url: event.target.value } : row) })} />
            <label className="text-sm font-bold"><input type="checkbox" checked={item.is_active} onChange={(event) => setData({ ...data, marketplaces: data.marketplaces.map((row: any) => row.id === item.id ? { ...row, is_active: event.target.checked } : row) })} /> {t("active")}</label>
          </div>
        ))}
      </section>
      <section className="card space-y-2 p-4">
        <h2 className="font-extrabold">{t("socials")}</h2>
        {data.socials.map((item: any) => (
          <div key={item.id} className="grid gap-2 sm:grid-cols-[120px_1fr_auto]">
            <b className="self-center capitalize">{item.key}</b>
            <input className="field" value={item.url} onChange={(event) => setData({ ...data, socials: data.socials.map((row: any) => row.id === item.id ? { ...row, url: event.target.value } : row) })} placeholder="https://" />
            <label className="text-sm font-bold"><input type="checkbox" checked={item.is_active} onChange={(event) => setData({ ...data, socials: data.socials.map((row: any) => row.id === item.id ? { ...row, is_active: event.target.checked } : row) })} /> {t("active")}</label>
          </div>
        ))}
      </section>
      <section className="card space-y-2 p-4">
        <h2 className="font-extrabold">{t("prohibited")}</h2>
        {data.prohibited.map((item: any) => (
          <div key={item.id} className="flex items-center justify-between gap-2"><span>{item.title?.tj || item.title?.ru || item.title?.en}</span><button className="text-sm font-bold text-brand" type="button" onClick={async () => { await api(`/api/admin/prohibited/${item.id}`, { method: "DELETE" }); setData(await api("/api/admin/cms")); }}>{t("delete")}</button></div>
        ))}
        <input className="field" placeholder={t("title")} value={title} onChange={(event) => setTitle(event.target.value)} />
        <input className="field" placeholder={t("note")} value={note} onChange={(event) => setNote(event.target.value)} />
        <button className="btn btn-ghost" type="button" onClick={async () => { await api("/api/admin/prohibited", { method: "POST", body: JSON.stringify({ title: { tj: title, ru: title, en: title }, note: { tj: note, ru: note, en: note } }) }); setTitle(""); setNote(""); setData(await api("/api/admin/cms")); }}>{t("add")}</button>
      </section>
      <button className="btn btn-dark" type="button" onClick={async () => {
        const token = localStorage.getItem("safi_token");
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}/api/admin/backup`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "safi-kargo-backup.db";
        link.click();
      }}>{t("backup")}</button>
    </div>
  );
}
