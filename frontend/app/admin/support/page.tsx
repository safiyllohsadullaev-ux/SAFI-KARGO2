"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { subscribe } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export default function SupportPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [online, setOnline] = useState(false);
  const [current, setCurrent] = useState<number | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");

  const load = async () => {
    const data = await api<{ online: boolean; items: any[] }>("/api/chat/conversations");
    setItems(data.items);
    setOnline(data.online);
  };
  const open = async (id: number) => {
    setCurrent(id);
    const data = await api<{ items: any[] }>(`/api/chat/conversations/${id}/messages`);
    setMessages(data.items);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    return subscribe(() => { load(); if (current) open(current); });
  }, [current]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!current) return;
    const body = new FormData();
    body.set("content", text);
    await api(`/api/chat/conversations/${current}/messages`, { method: "POST", body });
    setText("");
    open(current);
    load();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <div>
        <h1 className="text-3xl font-extrabold">{t("supportDesk")}</h1>
        <p className="text-sm text-mute">{online ? t("online") : t("offline")}</p>
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <button key={item.id} className="card block w-full p-3 text-left" type="button" onClick={() => open(item.id)}>
              <b>{item.client?.public_client_id}</b>
              <span className="block text-sm text-mute">{item.client?.first_name} {item.client?.last_name}</span>
              {item.unread ? <span className="text-xs font-bold text-brand">{item.unread} {t("unread")}</span> : null}
            </button>
          ))}
        </div>
      </div>
      <section className="card flex min-h-[60vh] flex-col">
        <div className="flex-1 space-y-2 overflow-auto p-4">
          {messages.map((item) => (
            <p key={item.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${item.sender_id === user?.id ? "ml-auto bg-brand text-white" : "bg-mist"}`}>{item.content}</p>
          ))}
        </div>
        {current ? (
          <form className="flex gap-2 border-t border-line p-3" onSubmit={send}>
            <input className="field" value={text} onChange={(event) => setText(event.target.value)} placeholder={t("typeMessage")} />
            <button className="btn btn-primary" type="submit">{t("send")}</button>
            <button className="btn btn-ghost" type="button" onClick={async () => { await api(`/api/chat/conversations/${current}/close`, { method: "POST" }); load(); }}>{t("closeChat")}</button>
            <button className="btn btn-ghost" type="button" onClick={async () => { await api(`/api/chat/conversations/${current}/assign?assignee_id=${user?.id}`, { method: "POST" }); }}>{t("assignMe")}</button>
          </form>
        ) : <p className="p-4 text-sm text-mute">{t("noMessages")}</p>}
      </section>
    </div>
  );
}
