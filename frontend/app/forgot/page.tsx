"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Logo } from "@/components/Logo";
import { api, ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function ForgotPage() {
  const { t } = useI18n();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [devCode, setDevCode] = useState("");
  const [smsOff, setSmsOff] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const requestCode = async () => {
    setError("");
    try {
      const data = await api<{ delivery: string; dev_code?: string }>("/api/auth/otp", {
        method: "POST",
        body: JSON.stringify({ phone, purpose: "reset" }),
      });
      if (data.delivery === "dev") {
        setSmsOff(true);
        setDevCode(data.dev_code || "");
      } else if (!data.dev_code) {
        setSmsOff(data.delivery !== "sent");
      }
    } catch (err) {
      setError(t(err instanceof ApiError ? err.code : "network"));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await api("/api/auth/reset", { method: "POST", body: JSON.stringify({ phone, otp, new_password: password }) });
      setDone(true);
    } catch (err) {
      setError(t(err instanceof ApiError ? err.code : "network"));
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4">
      <Logo />
      <h1 className="mt-6 text-3xl font-extrabold">{t("reset")}</h1>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input className="field" placeholder="+992" value={phone} onChange={(event) => setPhone(event.target.value)} required />
        <button className="btn btn-ghost w-full" type="button" onClick={requestCode}>{t("sendCode")}</button>
        {smsOff ? <div className="rounded-2xl bg-amber-50 p-3 text-sm">{t("smsOff")}{devCode ? <div className="font-extrabold">{devCode}</div> : null}</div> : null}
        <input className="field" placeholder={t("code")} value={otp} onChange={(event) => setOtp(event.target.value)} required />
        <input className="field" type="password" placeholder={t("newPassword")} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
        {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}
        {done ? <p className="text-sm font-bold text-green-600">{t("saved")}</p> : null}
        <button className="btn btn-primary w-full" type="submit">{t("save")}</button>
      </form>
      <Link href="/login" className="mt-4 text-sm font-bold text-brand">{t("login")}</Link>
    </div>
  );
}
