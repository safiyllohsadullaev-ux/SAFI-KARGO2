export const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function token() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("safi_token") || "";
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const current = token();
  if (current) headers.set("Authorization", `Bearer ${current}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { ...options, headers });
  } catch {
    throw new ApiError("network", 0);
  }
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = data?.detail;
    const code = typeof detail === "string" ? detail : "request_failed";
    throw new ApiError(code, response.status);
  }
  return data as T;
}

export async function fileUrl(id: number) {
  const response = await fetch(`${API}/api/files/${id}`, { headers: { Authorization: `Bearer ${token()}` } });
  if (!response.ok) throw new ApiError("not_found", response.status);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
