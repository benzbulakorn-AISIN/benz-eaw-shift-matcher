import { createClient } from "@supabase/supabase-js";

// ค่าเหล่านี้มาจาก GitHub → Settings → Secrets and variables → Actions → Variables
// (ไม่ใช่ความลับ ข้อมูลถูกป้องกันด้วยรหัสผ่าน + RLS)
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

export const configOk = url.startsWith("https://") && key.length > 20;

export const sb = createClient(configOk ? url : "https://invalid.supabase.co", configOk ? key : "missing-key", {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "bem-auth" },
});

export const LOGIN_EMAILS = {
  bulakorn: (import.meta.env.VITE_BENZ_EMAIL as string | undefined) ?? "",
  wannika: (import.meta.env.VITE_EAW_EMAIL as string | undefined) ?? "",
};
