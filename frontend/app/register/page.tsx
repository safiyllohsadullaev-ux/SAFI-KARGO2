"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { api, ApiError } from "@/lib/api";
import { Account, useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

type Branch = { id: number; name: string };

export default function RegisterPage() {
  const { t } = useI18n();
  const { setSession } = useAuth();
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", password: "", password_confirm: "", branch_id: "", otp: "" });
  const [devCode, setDevCode] = useState("");
  const [smsOff, setSmsOff] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ items: Branch[] }>("/api/public/branches").then((data) => setBranches(data.items)).catch(() => undefined);
  }, []);

  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const requestCode = async () => {
    setError("");
    try {
      const data = await api<{ delivery: string; dev_code?: string }>("/api/auth/otp", {
        method: "POST",
        body: JSON.stringify({ phone: form.phone, purpose: "register" }),
      });
      if (data.delivery === "dev") {
        setSmsOff(true);
        setDevCode(data.dev_code || "");
        if (data.dev_code) set("otp", data.dev_code);
      }
    } catch (err) {
      setError(t(err instanceof ApiError ? err.code : "network"));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(form.otp.trim())) {
      setError(t("otpNeedDigits"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api<{ access_token: string; user: Account }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          branch_id: form.branch_id ? Number(form.branch_id) : null,
        }),
      });
      setSession(data.access_token, data.user);
      router.replace("/home");
    } catch (err) {
      setError(t(err instanceof ApiError ? err.code : "network"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-8">
      <Logo />
      <h1 className="mt-6 text-3xl font-extrabold">{t("register")}</h1>
      <p className="mt-2 text-sm text-mute">{t("registerLead")}</p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input className="field" placeholder={t("firstName")} value={form.first_name} onChange={(event) => set("first_name", event.target.value)} required />
        <input className="field" placeholder={t("lastName")} value={form.last_name} onChange={(event) => set("last_name", event.target.value)} required />
        <input className="field" placeholder="+992" value={form.phone} onChange={(event) => set("phone", event.target.value)} required />
        <input className="field" type="password" placeholder={`${t("password")} · ${t("passwordRule")}`} value={form.password} onChange={(event) => set("password", event.target.value)} minLength={8} required />
        <input className="field" type="password" placeholder={t("passwordAgain")} value={form.password_confirm} onChange={(event) => set("password_confirm", event.target.value)} required />
        <select className="field" value={form.branch_id} onChange={(event) => set("branch_id", event.target.value)}>
          <option value="">{branches.length ? t("branchOptional") : t("noBranches")}</option>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
        <p className="text-sm text-mute">{t("otpHint")}</p>
        <button className="btn btn-ghost w-full" type="button" onClick={requestCode}>{t("sendCode")}</button>
        {smsOff ? <div className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">{t("smsOff")}<div className="mt-1 text-2xl font-extrabold tracking-widest">{devCode}</div></div> : null}
        <input className="field" inputMode="numeric" autoComplete="one-time-code" placeholder={t("code")} value={form.otp} onChange={(event) => set("otp", event.target.value.replace(/\D/g, "").slice(0, 6))} required />
        {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}
        <button className="btn btn-primary w-full" disabled={busy} type="submit">{t("register")}</button>
      </form>
      <Link href="/login" className="mt-4 text-sm font-bold text-brand">{t("haveAccount")}</Link>
    </div>
  );
}
