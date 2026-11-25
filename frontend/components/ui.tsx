"use client";

import { createContext, useContext, useState } from "react";

type Toast = { id: number; text: string; tone: "ok" | "err" };
const ToastContext = createContext<(text: string, tone?: "ok" | "err") => void>(() => undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = (text: string, tone: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, text, tone }]);
    setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 3200);
  };
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed left-1/2 top-4 z-[80] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2">
        {items.map((item) => (
          <div key={item.id} className={`rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-nav ${item.tone === "err" ? "bg-ink" : "bg-brand"}`}>
            {item.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function Modal({ open, title, children, onClose }: { open: boolean; title: string; children: React.ReactNode; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 p-3 sm:items-center" onClick={onClose}>
      <div className="card max-h-[88vh] w-full max-w-lg overflow-auto p-5" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-extrabold">{title}</h3>
          <button className="btn btn-ghost px-3 py-2" onClick={onClose} type="button">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <svg width="92" height="72" viewBox="0 0 92 72" aria-hidden>
        <rect x="8" y="18" width="76" height="44" rx="14" fill="#F4F4F5" />
        <path d="M18 34h28M18 44h18" stroke="#E53935" strokeWidth="3" strokeLinecap="round" />
        <circle cx="68" cy="24" r="10" fill="#E53935" />
      </svg>
      <h3 className="mt-4 text-base font-extrabold">{title}</h3>
      {text ? <p className="mt-1 max-w-sm text-sm text-mute">{text}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ text, onRetry, retry }: { text: string; onRetry: () => void; retry: string }) {
  return (
    <div className="card p-6 text-center">
      <p className="font-semibold">{text}</p>
      <button className="btn btn-primary mt-4" onClick={onRetry} type="button">{retry}</button>
    </div>
  );
}

export function Spinner() {
  return <div className="skeleton h-28 w-full" />;
}
