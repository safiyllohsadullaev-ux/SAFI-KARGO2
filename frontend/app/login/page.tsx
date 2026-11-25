"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Logo } from "@/components/Logo";
import { api, ApiError } from "@/lib/api";
import { useAuth, Account } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export default function LoginPage() {
  const { t } = useI18n();
  const { setSession } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api<{ access_token: string; user: Account }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ phone, password }),
      });
      setSession(data.access_token, data.user);
      router.replace(data.user.role === "client" ? "/home" : "/admin");
    } catch (err) {
      setError(t(err instanceof ApiError ? err.code : "network"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-brand p-10 text-white lg:flex">
        <Logo light />
        <div>
          <h1 className="text-5xl font-extrabold tracking-tight">SAFI KARGO</h1>
          <p className="mt-4 max-w-md text-lg text-white/85">{t("tagline")}</p>
        </div>
        <p className="text-sm text-white/70">{t("loginLead")}</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10">
        <form onSubmit={submit} className="w-full max-w-md">
          <div className="mb-6 lg:hidden"><Logo /></div>
          <h2 className="text-3xl font-extrabold">{t("login")}</h2>
          <p className="mt-2 text-sm text-mute">{t("loginLead")}</p>
          <label className="mt-6 block text-sm font-bold">{t("phone")}</label>
          <input className="field mt-2" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+992" autoComplete="tel" required />
          <label className="mt-4 block text-sm font-bold">{t("password")}</label>
          <input className="field mt-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          {error ? <p className="mt-3 text-sm font-semibold text-brand">{error}</p> : null}
          <button className="btn btn-primary mt-5 w-full" disabled={busy} type="submit">{t("login")}</button>
          <div className="mt-4 flex justify-between text-sm font-semibold">
            <Link href="/forgot" className="text-mute">{t("forgot")}</Link>
            <Link href="/register" className="text-brand">{t("register")}</Link>
          </div>
        </form>
      </section>
    </div>
  );
}
