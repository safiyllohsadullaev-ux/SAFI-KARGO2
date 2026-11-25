"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { useAuth } from "@/lib/auth";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.role === "client") router.replace("/home");
  }, [loading, user, router]);
  if (loading || !user || user.role === "client") return <div className="skeleton m-6 h-40" />;
  return <Shell mode="admin">{children}</Shell>;
}
