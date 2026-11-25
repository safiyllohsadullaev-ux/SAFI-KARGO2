export function formatWhen(iso?: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Dushanbe",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Dushanbe",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatTime(iso?: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Dushanbe",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export const STATUSES = [
  "china_warehouse",
  "in_transit",
  "tj_warehouse",
  "sorting",
  "delivery",
  "received",
] as const;

export type Status = (typeof STATUSES)[number];

export const STATUS_COLOR: Record<Status, string> = {
  china_warehouse: "#E53935",
  in_transit: "#3B82F6",
  tj_warehouse: "#22C55E",
  sorting: "#F59E0B",
  delivery: "#8B5CF6",
  received: "#16A34A",
};
