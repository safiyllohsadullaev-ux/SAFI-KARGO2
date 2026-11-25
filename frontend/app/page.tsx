"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function IndexPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else router.replace(user.role === "client" ? "/home" : "/admin");
  }, [loading, user, router]);
  return <div className="p-8 text-sm text-mute">SAFI KARGO</div>;
}
