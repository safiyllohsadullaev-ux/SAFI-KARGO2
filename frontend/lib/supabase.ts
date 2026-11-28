import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: {
        flowType: "implicit",
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: false,
        storageKey: "safi-email",
      },
    });
  }
  return client;
}

export function authErrorKey(error: { code?: string; message?: string } | null | undefined) {
  const code = (error?.code || "").toLowerCase();
  const message = (error?.message || "").toLowerCase();
  if (code === "user_already_exists" || message.includes("already registered") || message.includes("already been registered")) return "email_taken";
  if (code === "otp_expired" || message.includes("expired")) return "otp_expired";
  if (code === "otp_disabled" || message.includes("invalid otp") || message.includes("token has expired or is invalid")) return "otp_invalid";
  if (code.includes("rate") || message.includes("rate limit") || message.includes("only request this after") || message.includes("security purposes")) return "email_wait";
  if (message.includes("invalid format") || message.includes("valid email") || message.includes("unable to validate email")) return "email_invalid";
  if (message.includes("not allowed") || message.includes("signups not allowed")) return "email_closed";
  if (message.includes("password")) return "password_weak";
  return "email_failed";
}
