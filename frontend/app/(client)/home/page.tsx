"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Clock3, Copy, MapPin, Tag } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { pick, useI18n } from "@/lib/i18n";
import { ErrorState, Modal, Spinner } from "@/components/ui";
import { useToast } from "@/components/ui";

type HomeData = {
  user: { public_client_id: string; first_name: string; last_name: string; phone: string };
  branch: { name: string; address: string; phone: string } | null;
  tariffs: { id: number; category: string; price_per_kg: number; currency: string }[];
  eta: Record<string, string>;
  banner: { enabled?: boolean; title?: Record<string, string>; subtitle?: Record<string, string> };
  info_notice: Record<string, string>;
  warehouse: { configured: boolean; address: string; phone: string; recipient_name: string; instructions: string; client_code: string; name: string } | null;
  marketplaces: { key: string; name: string; url: string }[];
  socials: { key: string; url: string }[];
};

const marks: Record<string, { src: string; wide?: boolean }> = {
  pinduoduo: { src: "/brands/pinduoduo.png?v=2" },
  taobao: { src: "/brands/taobao.png" },
  "1688": { src: "/brands/1688.png" },
  poizon: { src: "/brands/poizon.png", wide: true },
};

export default function HomePage() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState("");
  const [how, setHow] = useState(false);

  const load = () => {
    setError("");
    api<HomeData>("/api/client/home").then(setData).catch((err) => setError(t(err instanceof ApiError ? err.code : "network")));
  };
  useEffect(load, [lang]);

  if (error) return <ErrorState text={error} onRetry={load} retry={t("retry")} />;
  if (!data) return <div className="mx-auto w-full max-w-[480px] space-y-3 lg:max-w-none"><Spinner /><Spinner /></div>;

  const notice = pick(data.info_notice, lang);
  const eta = pick(data.eta, lang);
  const warehouse = data.warehouse;
  const clientId = data.user.public_client_id;
  const cheapest = data.tariffs.length
    ? [...data.tariffs].sort((a, b) => a.price_per_kg - b.price_per_kg)[0]
    : null;
  const rate = cheapest
    ? `${t("fromRate")} ${trimNumber(cheapest.price_per_kg)} ${cheapest.currency} ${t("perKg")}`
    : t("noTariffs");
  const consignee = warehouse?.recipient_name || clientId;
  const warehousePhone = warehouse?.phone || t("notSet");
  const warehouseAddress = warehouse?.configured
    ? warehouse.address.includes(clientId)
      ? warehouse.address
      : `${warehouse.address} #${clientId}`
    : t("addressMissing");

  const copyText = [
    `${t("consignee")}: ${consignee}`,
    warehouse?.phone ? `${t("contactNumber")}: ${warehouse.phone}` : "",
    warehouse?.configured ? `${t("warehouseAddress")}: ${warehouseAddress}` : "",
  ].filter(Boolean).join("\n");

  const copyId = async () => {
    await navigator.clipboard.writeText(clientId);
    toast(t("copied"));
  };

  const copy = async () => {
    await navigator.clipboard.writeText(copyText);
    toast(warehouse?.configured ? t("copied") : t("addressMissing"));
  };

  return (
    <div className="mx-auto w-full max-w-[480px] lg:max-w-none">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.82fr)] lg:gap-6">
        <div className="space-y-4">
          <section className="hero-card relative isolate min-h-[188px] overflow-hidden rounded-[28px] text-white sm:min-h-[220px]">
            <img src="/hero-truck.jpg" alt="" className="hero-photo absolute inset-0 -z-10 h-full w-full object-cover object-[78%_center]" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#B71C1C] from-10% via-[#D32F2F]/75 via-48% to-[#7F1D1D]/5" />
            <div className="hero-aurora pointer-events-none absolute inset-0 -z-10" />
            <div className="hero-sheen pointer-events-none absolute inset-0 z-10" />
            <div className="hero-sheen hero-sheen-warm pointer-events-none absolute inset-0 z-10" />
            <div className="hero-copy relative z-20 flex min-h-[188px] flex-col justify-between p-4 sm:min-h-[220px] sm:p-6">
              <div className="flex justify-end">
                <div className="hero-flags flex items-center gap-1.5 rounded-full bg-black/20 px-2 py-1 backdrop-blur-sm">
                  <ChinaFlag />
                  <span className="text-[10px] text-white/70">|</span>
                  <TajikFlag />
                </div>
              </div>
              <div className="pr-16">
                <div className="flex items-center gap-2">
                  <h1 className="text-[1.65rem] font-extrabold leading-none tracking-tight sm:text-4xl">{clientId}</h1>
                  <button type="button" onClick={copyId} aria-label={t("copy")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/20 backdrop-blur-sm">
                    <Copy size={15} />
                  </button>
                </div>
                <p className="mt-2 text-sm font-semibold text-white/95">{maskPhone(data.user.phone)}</p>
                {notice ? <p className="mt-0.5 text-xs font-medium text-white/80">{notice}</p> : null}
              </div>
            </div>
            <div className="hero-mark pointer-events-none absolute bottom-3 right-4 z-20 text-right leading-none drop-shadow-md">
              <div className="text-[11px] font-extrabold tracking-[0.2em]">SAFI</div>
              <div className="mt-1 text-[10px] font-bold tracking-[0.24em] text-white/85">KARGO</div>
            </div>
          </section>

          <section className="grid grid-cols-3 gap-2 sm:gap-3">
            <QuickCard
              icon={<span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-rose-100 to-fuchsia-100 text-rose-500 sm:h-12 sm:w-12"><MapPin size={18} /></span>}
              title={data.branch?.name || t("yourBranch")}
              hint={data.branch ? (data.branch.address || data.branch.phone) : t("noBranch")}
            />
            <QuickCard
              icon={<span className="grid h-10 w-10 place-items-center rounded-2xl bg-sky-100 text-sky-600 sm:h-12 sm:w-12"><Tag size={18} /></span>}
              title={t("tariffs")}
              hint={rate}
            />
            <QuickCard
              icon={<span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-violet-100 to-rose-100 text-violet-600 sm:h-12 sm:w-12"><Clock3 size={18} /></span>}
              title={t("deliveryCard")}
              hint={eta || t("noEta")}
            />
          </section>

          <section>
            <h2 className="mb-3 text-[17px] font-extrabold sm:text-xl">{t("markets")}</h2>
            <div className="grid grid-cols-4 items-start gap-2 sm:gap-4">
              {data.marketplaces.map((item) => {
                const mark = marks[item.key];
                return (
                  <a key={item.key} href={item.url} target="_blank" rel="noreferrer" className="group flex min-w-0 flex-col items-center gap-2">
                    {mark ? (
                      <img
                        src={mark.src}
                        alt={item.name}
                        className={mark.wide
                          ? "h-11 w-auto max-w-full object-contain transition group-hover:scale-105 sm:h-14"
                          : "h-12 w-12 object-contain transition group-hover:scale-105 sm:h-16 sm:w-16"}
                      />
                    ) : (
                      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand text-sm font-extrabold text-white sm:h-16 sm:w-16">{item.name.slice(0, 1)}</span>
                    )}
                    <span className="w-full truncate text-center text-[11px] font-semibold text-ink/80 sm:text-sm">{item.name}</span>
                  </a>
                );
              })}
            </div>
          </section>
        </div>

        <section className="rounded-[28px] bg-white p-4 shadow-card sm:p-6 lg:sticky lg:top-20">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-extrabold leading-tight sm:text-2xl">{t("chinaAddress")}</h2>
            <HouseArt />
          </div>
          <div className="mt-2">
            <Field label={t("consignee")} value={consignee} />
            <Field label={t("contactNumber")} value={warehousePhone} />
            <Field label={t("warehouseAddress")} value={warehouseAddress} />
          </div>
          <button className="btn btn-primary mt-4 h-12 w-full rounded-2xl text-[15px]" type="button" onClick={copy}>{t("copyAddress")}</button>
          <button className="mt-3 w-full text-center text-sm font-bold text-brand" type="button" onClick={() => setHow(true)}>{t("howTo")}</button>
        </section>
      </div>

      {data.socials.length ? (
        <section className="mt-4 grid gap-3 sm:grid-cols-3">
          {data.socials.map((item) => (
            <a key={item.key} href={item.url} target="_blank" rel="noreferrer" className="card px-4 py-4 font-extrabold capitalize">{item.key}</a>
          ))}
        </section>
      ) : null}

      <Modal open={how} title={t("howTitle")} onClose={() => setHow(false)}>
        <ol className="space-y-3 text-sm">
          {[t("how1"), t("how2"), t("how3"), t("how4")].map((step, index) => (
            <li key={step} className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-red-50 font-extrabold text-brand">{index + 1}</span>{step}</li>
          ))}
          {warehouse?.instructions ? <li className="rounded-2xl bg-mist p-3">{warehouse.instructions}</li> : null}
        </ol>
      </Modal>
    </div>
  );
}

function QuickCard({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <article className="flex min-w-0 flex-col items-center rounded-[22px] bg-white px-1.5 py-3 text-center shadow-card sm:flex-row sm:items-center sm:gap-3 sm:px-3 sm:py-4 sm:text-left">
      {icon}
      <div className="mt-2 min-w-0 sm:mt-0">
        <p className="line-clamp-2 text-[12px] font-extrabold leading-tight sm:text-[15px]">{title}</p>
        {hint ? <p className="mt-1 line-clamp-3 text-[10px] leading-tight text-mute sm:text-xs">{hint}</p> : null}
      </div>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-line py-2.5 last:border-0">
      <p className="text-[13px] text-mute">{label}</p>
      <p className="mt-0.5 break-words text-[15px] font-bold leading-snug">{value}</p>
    </div>
  );
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return phone;
  const country = digits.startsWith("992") ? "992" : digits.slice(0, Math.max(1, digits.length - 7));
  const last = digits.slice(-4);
  return `+${country} ** *** ${last.slice(0, 2)} ${last.slice(2)}`;
}

function trimNumber(value: number) {
  return Number(value.toFixed(2)).toString();
}

function ChinaFlag() {
  return (
    <svg viewBox="0 0 30 20" className="h-3.5 w-6 overflow-hidden rounded-[3px] shadow-sm" aria-hidden>
      <rect width="30" height="20" fill="#DE2910" />
      <polygon fill="#FFDE00" points="6,2.2 7.1,5.2 10.3,5.2 7.7,7.1 8.7,10.2 6,8.3 3.3,10.2 4.3,7.1 1.7,5.2 4.9,5.2" />
      <polygon fill="#FFDE00" points="11.2,1.6 11.6,2.7 12.7,2.7 11.8,3.4 12.1,4.5 11.2,3.8 10.3,4.5 10.6,3.4 9.7,2.7 10.8,2.7" />
      <polygon fill="#FFDE00" points="13.4,3.6 13.8,4.7 14.9,4.7 14,5.4 14.3,6.5 13.4,5.8 12.5,6.5 12.8,5.4 11.9,4.7 13,4.7" />
      <polygon fill="#FFDE00" points="13.2,6.6 13.6,7.7 14.7,7.7 13.8,8.4 14.1,9.5 13.2,8.8 12.3,9.5 12.6,8.4 11.7,7.7 12.8,7.7" />
      <polygon fill="#FFDE00" points="11,8.4 11.4,9.5 12.5,9.5 11.6,10.2 11.9,11.3 11,10.6 10.1,11.3 10.4,10.2 9.5,9.5 10.6,9.5" />
    </svg>
  );
}

function TajikFlag() {
  return (
    <svg viewBox="0 0 30 15" className="h-3.5 w-7 overflow-hidden rounded-[3px] shadow-sm" aria-hidden>
      <rect width="30" height="5" fill="#CC0000" />
      <rect y="5" width="30" height="5" fill="#FFFFFF" />
      <rect y="10" width="30" height="5" fill="#006600" />
      <g fill="#C8A200">
        <path d="M15 6.1l.7 1.2h1.3l-1 0.8.4 1.2L15 8.6l-1.1.7.4-1.2-1-.8h1.3z" />
        <path d="M13.2 8.2h3.6l-.5 1.1h-2.6z" />
        <circle cx="12.2" cy="6.15" r="0.35" />
        <circle cx="13.3" cy="5.7" r="0.35" />
        <circle cx="14.4" cy="5.45" r="0.35" />
        <circle cx="15.6" cy="5.45" r="0.35" />
        <circle cx="16.7" cy="5.7" r="0.35" />
        <circle cx="17.8" cy="6.15" r="0.35" />
        <circle cx="15" cy="5.2" r="0.35" />
      </g>
    </svg>
  );
}

function HouseArt() {
  return (
    <svg viewBox="0 0 120 78" className="h-14 w-[4.5rem] shrink-0 sm:h-[4.5rem] sm:w-24" aria-hidden>
      <ellipse cx="28" cy="22" rx="14" ry="8" fill="#E8EEF5" />
      <ellipse cx="40" cy="20" rx="12" ry="8" fill="#F4F7FB" />
      <ellipse cx="96" cy="26" rx="12" ry="7" fill="#E8EEF5" />
      <rect x="18" y="58" width="84" height="8" rx="4" fill="#E7F6EA" />
      <path d="M22 58c6-14 10-18 14-8 3 8 6 10 10 2 4-8 8-6 12 2 3 6 8 8 12-2 4-10 8-8 14 6v8H22z" fill="#7BC67E" />
      <path d="M78 58c4-12 8-14 12-4 3 8 7 6 10-2v14H78z" fill="#5EAF62" />
      <path d="M46 40 L70 24 L94 40 V66 H46 Z" fill="#FFFFFF" stroke="#F3D2D0" />
      <path d="M42 41 L70 20 L98 41 L92 41 L70 26 L48 41 Z" fill="#E53935" />
      <rect x="64" y="48" width="12" height="18" rx="1.5" fill="#F6C7C3" />
      <rect x="50" y="46" width="9" height="8" rx="1" fill="#B9D7F5" />
      <rect x="81" y="46" width="9" height="8" rx="1" fill="#B9D7F5" />
      <circle cx="24" cy="50" r="7" fill="#2F9E44" />
      <rect x="22.5" y="50" width="3" height="10" rx="1" fill="#8D6A45" />
    </svg>
  );
}
