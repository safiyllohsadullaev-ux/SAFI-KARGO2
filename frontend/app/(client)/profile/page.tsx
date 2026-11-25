"use client";

import Link from "next/link";
import { Bell, BookOpen, Calculator, MapPin, Scale, ScrollText, Settings, ShieldBan, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

const links = [
  { href: "/profile/branch", key: "yourBranch", icon: MapPin },
  { href: "/profile/terms", key: "terms", icon: ScrollText },
  { href: "/profile/tariffs", key: "tariffs", icon: Scale },
  { href: "/profile/stats", key: "stats", icon: Sparkles },
  { href: "/profile/prohibited", key: "prohibited", icon: ShieldBan },
  { href: "/profile/lessons", key: "lessons", icon: BookOpen },
  { href: "/profile/calculator", key: "calculator", icon: Calculator },
  { href: "/profile/address-check", key: "addressCheck", icon: Sparkles },
  { href: "/profile/notifications", key: "notifications", icon: Bell },
  { href: "/profile/settings", key: "settings", icon: Settings },
];

export default function ProfilePage() {
  const { user } = useAuth();
  const { t } = useI18n();
  if (!user) return null;
  return (
    <div className="mx-auto max-w-3xl">
      <section className="card mb-4 p-5">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-brand text-2xl font-extrabold text-white">{user.first_name.slice(0, 1)}</div>
          <div>
            <p className="text-2xl font-extrabold">{user.public_client_id}</p>
            <p className="font-bold">{user.first_name} {user.last_name}</p>
            <p className="text-sm text-mute">{user.phone}</p>
          </div>
        </div>
      </section>
      <div className="grid gap-2">
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="card flex items-center gap-3 px-4 py-4 font-bold">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-red-50 text-brand"><Icon size={18} /></span>
              <span className="flex-1">{t(item.key)}</span>
              <span className="text-mute">›</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
