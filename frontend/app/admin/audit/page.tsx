"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatWhen } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export default function AuditPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api<{ items: any[] }>("/api/admin/audit").then((data) => setItems(data.items)); }, []);
  return (
    <div>
      <h1 className="text-3xl font-extrabold">{t("audit")}</h1>
      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <article key={item.id} className="card p-3 text-sm">
            <b>{item.action}</b> · {item.entity_type} #{item.entity_id}
            <p className="text-mute">{formatWhen(item.created_at)} · {item.actor_name} · {item.actor_role ? t(item.actor_role) : ""}</p>
            {item.reason ? <p>{item.reason}</p> : null}
          </article>
        ))}
        {items.length === 0 ? <p className="text-sm text-mute">{t("noData")}</p> : null}
      </div>
    </div>
  );
}
