"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { api, ApiError, fileUrl } from "@/lib/api";
import { subscribe } from "@/lib/auth";
import { formatWhen } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { ErrorState } from "@/components/ui";

type Message = { id: number; sender_id: number; content: string; file_id: number | null; file_name: string | null; created_at: string; read_at: string | null };
type Conversation = { id: number; status: string; unread: number; last_message: Message | null };

export default function MessagesPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [items, setItems] = useState<Message[]>([]);
  const [online, setOnline] = useState(false);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = async () => {
    const list = await api<{ online: boolean; items: Conversation[] }>("/api/chat/conversations");
    const row = list.items[0];
    setOnline(list.online);
    setConversation(row);
    if (!row) return;
    const thread = await api<{ items: Message[] }>(`/api/chat/conversations/${row.id}/messages`);
    setItems(thread.items);
  };

  useEffect(() => {
    load().catch((err) => setError(t(err instanceof ApiError ? err.code : "network")));
  }, []);

  useEffect(() => {
    return subscribe(() => { load().catch(() => undefined); });
  }, []);
  useEffect(() => { box.current?.scrollTo(0, box.current.scrollHeight); }, [items]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!conversation) return;
    const body = new FormData();
    body.set("content", text);
    if (file) body.set("upload", file);
    try {
      await api(`/api/chat/conversations/${conversation.id}/messages`, { method: "POST", body });
      setText("");
      setFile(null);
      setOpen(true);
      await load();
    } catch (err) {
      setError(t(err instanceof ApiError ? err.code : "network"));
    }
  };

  if (error) return <ErrorState text={error} onRetry={() => { setError(""); load().catch((err) => setError(t(err instanceof ApiError ? err.code : "network"))); }} retry={t("retry")} />;

  const list = (
    <button className="card flex w-full items-center gap-3 p-4 text-left" type="button" onClick={() => setOpen(true)}>
      <span className="grid h-12 w-12 place-items-center rounded-full bg-brand text-xs font-extrabold text-white">SK</span>
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold">{t("supportName")}</span>
        <span className="block truncate text-sm text-mute">{online ? t("online") : t("supportOfflineShort")}</span>
      </span>
    </button>
  );

  const thread = (
    <section className="card flex h-[70vh] flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button className="text-sm font-bold lg:hidden" type="button" onClick={() => setOpen(false)}>{t("back")}</button>
        <div>
          <p className="font-extrabold">{t("supportName")}</p>
          <p className="text-xs text-mute">{online ? t("online") : t("offline")}</p>
        </div>
      </header>
      <div ref={box} className="flex-1 space-y-3 overflow-auto p-4">
        {items.length === 0 ? <p className="text-center text-sm text-mute">{t("noMessages")}</p> : null}
        {items.map((item) => {
          const mine = item.sender_id === user?.id;
          return (
            <article key={item.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "ml-auto bg-brand text-white" : "bg-mist"}`}>
              <p className="whitespace-pre-wrap">{item.content}</p>
              {item.file_id ? <FileLink id={item.file_id} name={item.file_name || t("file")} light={mine} /> : null}
              <p className={`mt-1 text-[10px] ${mine ? "text-white/80" : "text-mute"}`}>{formatWhen(item.created_at)} · {item.read_at ? t("seen") : t("sent")}</p>
            </article>
          );
        })}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
        <label className="btn btn-ghost px-3" title={t("attach")}>
          +
          <input className="hidden" type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} />
        </label>
        <input className="field" value={text} onChange={(event) => setText(event.target.value)} placeholder={t("typeMessage")} />
        <button className="btn btn-primary" type="submit">{t("send")}</button>
      </form>
      {file ? <p className="px-3 pb-3 text-xs text-mute">{file.name}</p> : null}
    </section>
  );

  return (
    <div>
      <h1 className="mb-4 text-3xl font-extrabold">{t("messages")}</h1>
      <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-4">
        <div className={open ? "hidden lg:block" : "block"}>{list}</div>
        <div className={open ? "block" : "hidden lg:block"}>{thread}</div>
      </div>
    </div>
  );
}

function FileLink({ id, name, light }: { id: number; name: string; light: boolean }) {
  const [href, setHref] = useState("");
  useEffect(() => { fileUrl(id).then(setHref).catch(() => undefined); }, [id]);
  if (!href) return null;
  const image = /\.(png|jpe?g|webp)$/i.test(name);
  return image ? <img src={href} alt="" className="mt-2 max-h-40 rounded-xl" /> : <a className={`mt-2 block underline ${light ? "text-white" : "text-brand"}`} href={href} download={name}>{name}</a>;
}
