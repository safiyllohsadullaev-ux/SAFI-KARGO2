"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Logo } from "@/components/Logo";
import { api, ApiError } from "@/lib/api";
import { Account, useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { authErrorKey, getSupabase } from "@/lib/supabase";

type Branch = { id: number; name: string };
type Draft = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  password: string;
  password_confirm: string;
  branch_id: string;
};

const RESEND_PAUSE = 60;
const DRAFT_KEY = "safi-pending-register";
const emptyForm: Draft = { first_name: "", last_name: "", phone: "", email: "", password: "", password_confirm: "", branch_id: "" };

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    if (!parsed?.email || !parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveDraft(draft: Draft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

function linkParams() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return { query, hash };
}

function arrivedFromEmail() {
  const { query, hash } = linkParams();
  return Boolean(query.get("code") || query.get("error") || hash.get("access_token") || hash.get("error") || query.get("type") || hash.get("type"));
}

async function sessionFromLink(): Promise<Session | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { query, hash } = linkParams();
  if (query.get("error") || hash.get("error")) {
    const failure = new Error("link") as Error & { code?: string };
    failure.code = hash.get("error_code") || query.get("error_code") || "otp_expired";
    throw failure;
  }
  const code = query.get("code");
  if (code) {
    const exchanged = await supabase.auth.exchangeCodeForSession(code);
    if (exchanged.data.session) return exchanged.data.session;
    if (exchanged.error) {
      const current = await supabase.auth.getSession();
      if (current.data.session) return current.data.session;
      throw exchanged.error;
    }
  }
  const current = await supabase.auth.getSession();
  if (current.error) throw current.error;
  if (current.data.session) return current.data.session;
  return await new Promise((resolve) => {
    const timer = setTimeout(() => {
      subscription.unsubscribe();
      resolve(null);
    }, 4000);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        clearTimeout(timer);
        subscription.unsubscribe();
        resolve(session);
      }
    });
  });
}

export default function RegisterPage() {
  const { t } = useI18n();
  const { setSession } = useAuth();
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [form, setForm] = useState<Draft>(emptyForm);
  const [step, setStep] = useState<"form" | "check">("form");
  const [wait, setWait] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const set = (key: keyof Draft, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const openCabinet = async (accessToken: string, draft: Draft) => {
    const data = await api<{ access_token: string; user: Account }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        ...draft,
        email: draft.email.trim(),
        branch_id: draft.branch_id ? Number(draft.branch_id) : null,
        supabase_access_token: accessToken,
      }),
    });
    clearDraft();
    await getSupabase()?.auth.signOut();
    window.history.replaceState({}, "", "/register");
    setSession(data.access_token, data.user);
    router.replace("/home");
  };

  useEffect(() => {
    api<{ items: Branch[] }>("/api/public/branches").then((data) => setBranches(data.items)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const draft = readDraft();
    if (draft) {
      setForm(draft);
      setStep("check");
    }
    if (!arrivedFromEmail()) return;
    let cancelled = false;
    const finish = async () => {
      setBusy(true);
      setStep("check");
      setError("");
      try {
        const session = await sessionFromLink();
        if (cancelled) return;
        window.history.replaceState({}, "", "/register");
        const confirmed = session?.user.email_confirmed_at || session?.user.confirmed_at;
        if (!session?.access_token || !confirmed) {
          setError(t("email_not_confirmed"));
          return;
        }
        const pending = readDraft();
        if (!pending || pending.email.trim().toLowerCase() !== (session.user.email || "").toLowerCase()) {
          setError(t("linkOtherDevice"));
          return;
        }
        setForm(pending);
        await openCabinet(session.access_token, pending);
      } catch (err) {
        if (cancelled) return;
        const code = err && typeof err === "object" && "code" in err ? String((err as { code?: string }).code || "") : "";
        setError(t(err instanceof ApiError ? err.code : authErrorKey({ code, message: err instanceof Error ? err.message : "" })));
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    finish();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (form.password !== form.password_confirm) {
      setError(t("password_mismatch"));
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      setError(t("email_invalid"));
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setError(t("email_not_configured"));
      return;
    }
    setBusy(true);
    try {
      const draft = { ...form, email: form.email.trim() };
      saveDraft(draft);
      const { data, error: signError } = await supabase.auth.signUp({
        email: draft.email,
        password: draft.password,
        options: {
          emailRedirectTo: `${window.location.origin}/register`,
          data: { first_name: draft.first_name, last_name: draft.last_name, phone: draft.phone },
        },
      });
      if (signError) {
        clearDraft();
        setError(t(authErrorKey(signError)));
        return;
      }
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        clearDraft();
        setError(t("email_taken"));
        return;
      }
      const confirmed = data.user?.email_confirmed_at || data.user?.confirmed_at;
      if (confirmed && data.session?.access_token) {
        await openCabinet(data.session.access_token, draft);
        return;
      }
      setForm(draft);
      setStep("check");
      setWait(RESEND_PAUSE);
    } catch (err) {
      setError(t(err instanceof ApiError ? err.code : "email_failed"));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (wait > 0 || busy) return;
    setError("");
    const supabase = getSupabase();
    if (!supabase) {
      setError(t("email_not_configured"));
      return;
    }
    setBusy(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: form.email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/register` },
      });
      if (resendError) {
        setError(t(authErrorKey(resendError)));
        if (authErrorKey(resendError) === "email_wait") setWait(RESEND_PAUSE);
        return;
      }
      setWait(RESEND_PAUSE);
    } catch {
      setError(t("email_failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-8">
      <Logo />
      {step === "form" ? (
        <>
          <h1 className="mt-6 text-3xl font-extrabold">{t("register")}</h1>
          <p className="mt-2 text-sm text-mute">{t("registerLead")}</p>
          <form onSubmit={submit} className="mt-6 space-y-3">
            <input className="field" placeholder={t("firstName")} value={form.first_name} onChange={(event) => set("first_name", event.target.value)} required />
            <input className="field" placeholder={t("lastName")} value={form.last_name} onChange={(event) => set("last_name", event.target.value)} required />
            <input className="field" placeholder="+992" value={form.phone} onChange={(event) => set("phone", event.target.value)} required />
            <input className="field" type="email" autoComplete="email" placeholder={t("email")} value={form.email} onChange={(event) => set("email", event.target.value)} required />
            <input className="field" type="password" autoComplete="new-password" placeholder={`${t("password")} · ${t("passwordRule")}`} value={form.password} onChange={(event) => set("password", event.target.value)} minLength={8} required />
            <input className="field" type="password" autoComplete="new-password" placeholder={t("passwordAgain")} value={form.password_confirm} onChange={(event) => set("password_confirm", event.target.value)} required />
            <select className="field" value={form.branch_id} onChange={(event) => set("branch_id", event.target.value)}>
              <option value="">{branches.length ? t("branchOptional") : t("noBranches")}</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            {error ? <p className="text-sm font-semibold text-brand">{error}</p> : null}
            <button className="btn btn-primary w-full" disabled={busy} type="submit">{t("register")}</button>
          </form>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-3xl font-extrabold">{t("checkEmail")}</h1>
          <p className="mt-2 text-sm text-mute">{t("checkEmailLead")}</p>
          <p className="mt-1 text-sm font-bold">{form.email.trim()}</p>
          {busy ? <p className="mt-4 text-sm font-semibold">{t("linkWait")}</p> : null}
          {error ? <p className="mt-4 text-sm font-semibold text-brand">{error}</p> : null}
          <div className="mt-6 space-y-3">
            <button className="btn btn-ghost w-full" type="button" disabled={busy || wait > 0} onClick={resend}>
              {wait > 0 ? t("resendIn").replace("{s}", String(wait)) : t("resendCode")}
            </button>
            <button className="w-full text-sm font-bold text-mute" type="button" onClick={() => { setStep("form"); setError(""); }}>{t("changeEmail")}</button>
          </div>
        </>
      )}
      <Link href="/login" className="mt-4 text-sm font-bold text-brand">{t("haveAccount")}</Link>
    </div>
  );
}
