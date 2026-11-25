"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Box, Home, LayoutDashboard, MessageCircle, QrCode, UserRound } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Lang, useI18n } from "@/lib/i18n";
import { useToast } from "./ui";

const clientNav = [
  { href: "/home", key: "home", icon: Home },
  { href: "/orders", key: "orders", icon: Box },
  { href: "/qr", key: "qr", icon: QrCode },
  { href: "/messages", key: "messages", icon: MessageCircle },
  { href: "/profile", key: "profile", icon: UserRound },
];

export function Shell({ children, mode }: { children: React.ReactNode; mode: "client" | "admin" }) {
  const pathname = usePathname();
  const { t, lang, setLang } = useI18n();
  const { user, badges, logout } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [notes, setNotes] = useState(0);

  useEffect(() => {
    if (mode !== "client") return;
    api<{ items: { is_read: boolean }[] }>("/api/client/notifications")
      .then((data) => setNotes(data.items.filter((item) => !item.is_read).length))
      .catch(() => undefined);
  }, [mode, badges.messages]);

  const adminNav = [
    { href: "/admin", key: "dashboard", icon: LayoutDashboard, roles: ["super_admin", "warehouse_china", "warehouse_tajikistan", "support"] },
    { href: "/admin/orders", key: "orders", icon: Box, roles: ["super_admin", "warehouse_china", "warehouse_tajikistan", "support"] },
    { href: "/admin/clients", key: "clients", icon: UserRound, roles: ["super_admin", "warehouse_china", "warehouse_tajikistan", "support"] },
    { href: "/admin/shipments", key: "shipments", icon: Box, roles: ["super_admin", "warehouse_china", "warehouse_tajikistan"] },
    { href: "/admin/scan", key: "scan", icon: QrCode, roles: ["super_admin", "warehouse_tajikistan"] },
    { href: "/admin/support", key: "supportDesk", icon: MessageCircle, roles: ["super_admin", "support"] },
    { href: "/admin/warehouses", key: "warehouses", icon: Home, roles: ["super_admin"] },
    { href: "/admin/branches", key: "branch", icon: Home, roles: ["super_admin"] },
    { href: "/admin/tariffs", key: "tariffs", icon: Box, roles: ["super_admin"] },
    { href: "/admin/staff", key: "staff", icon: UserRound, roles: ["super_admin"] },
    { href: "/admin/cms", key: "cms", icon: LayoutDashboard, roles: ["super_admin"] },
    { href: "/admin/audit", key: "audit", icon: Bell, roles: ["super_admin"] },
  ].filter((item) => user && item.roles.includes(user.role));

  const items = mode === "client" ? clientNav : adminNav;

  const changeLang = async (next: Lang) => {
    setLang(next);
    if (user) {
      try {
        await api("/api/auth/me", { method: "PATCH", body: JSON.stringify({ language: next }) });
        toast(t("langSaved"));
      } catch {
        toast(t("error"), "err");
      }
    }
  };

  return (
    <div className="min-h-screen bg-cream lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-white px-4 py-5 lg:flex">
        <Logo />
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {items.map((item) => {
            const active = pathname === item.href || (item.href !== "/home" && item.href !== "/admin" && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold ${active ? "bg-red-50 text-brand" : "text-ink/80 hover:bg-mist"}`}>
                <Icon size={18} />
                <span className="flex-1">{t(item.key)}</span>
                {item.key === "orders" && badges.orders > 0 ? <em className="rounded-full bg-brand px-2 text-xs not-italic text-white">{badges.orders}</em> : null}
                {item.key === "messages" && badges.messages > 0 ? <em className="rounded-full bg-brand px-2 text-xs not-italic text-white">{badges.messages}</em> : null}
              </Link>
            );
          })}
        </nav>
        <button className="btn btn-ghost mt-3" type="button" onClick={() => logout().then(() => router.replace("/login"))}>{t("logout")}</button>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-line/80 bg-cream/90 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 lg:hidden">{mode === "client" ? <Logo small /> : <Logo compact />}</div>
          <div className="hidden text-sm font-bold text-mute lg:block">{t("tagline")}</div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full bg-white p-1 text-xs font-extrabold shadow-card">
              {(["tj", "ru", "en"] as Lang[]).map((item) => (
                <button key={item} type="button" onClick={() => changeLang(item)} className={`rounded-full px-2.5 py-1 uppercase ${lang === item ? "bg-brand text-white" : "text-mute"}`}>{item}</button>
              ))}
            </div>
            {mode === "client" ? (
              <Link href="/profile/notifications" className="relative grid h-10 w-10 place-items-center rounded-full bg-white shadow-card" aria-label={t("notifications")}>
                <Bell size={18} />
                {notes > 0 ? <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-brand" /> : null}
              </Link>
            ) : null}
            <div className="grid h-10 w-10 place-items-center rounded-full bg-ink text-sm font-extrabold text-white">
              {(user?.first_name || "S").slice(0, 1)}
            </div>
          </div>
          </div>
          {mode === "client" ? <p className="px-4 pb-3 text-[13px] font-medium leading-snug text-mute lg:hidden">{t("tagline")}</p> : null}
          {mode === "admin" ? (
            <div className="no-scrollbar flex gap-2 overflow-auto px-4 pb-3 lg:hidden">
              {items.map((item) => (
                <Link key={item.href} href={item.href} className={`shrink-0 rounded-full px-3 py-2 text-xs font-extrabold ${pathname === item.href ? "bg-brand text-white" : "bg-white"}`}>{t(item.key)}</Link>
              ))}
            </div>
          ) : null}
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-4 lg:pb-10">{children}</main>
      </div>
      {mode === "client" ? (
        <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-full bg-white px-1 py-1 shadow-nav lg:hidden" style={{ marginBottom: "var(--safe-bottom)" }}>
          {clientNav.map((item) => {
            const active = pathname === item.href || (item.href !== "/home" && pathname.startsWith(item.href));
            const Icon = item.icon;
            const count = item.key === "orders" ? badges.orders : item.key === "messages" ? badges.messages : 0;
            return (
              <Link key={item.href} href={item.href} className="relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold">
                {active ? <motion.span layoutId="tab" className="absolute inset-1 rounded-full bg-red-50" /> : null}
                <Icon size={18} className={`relative ${active ? "text-brand" : "text-mute"}`} />
                <span className={`relative ${active ? "text-brand" : "text-mute"}`}>{t(item.key)}</span>
                {count > 0 ? <em className="absolute right-2 top-1 rounded-full bg-brand px-1 text-[9px] not-italic text-white">{count}</em> : null}
              </Link>
            );
          })}
        </nav>
      ) : (
        <button className="btn btn-primary fixed bottom-4 right-4 lg:hidden" type="button" onClick={() => logout().then(() => router.replace("/login"))}>{t("logout")}</button>
      )}
    </div>
  );
}
