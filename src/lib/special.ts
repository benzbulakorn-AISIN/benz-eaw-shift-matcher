// 💍 วันครบรอบ + 📶 แคชข้อมูลไว้ใช้ตอนออฟไลน์
import { useEffect, useState } from "react";
import { sb } from "./supabase";

// ---------- วันครบรอบ ----------
let annCache: string | null | undefined;
export async function loadAnniversary(force = false): Promise<string | null> {
  if (annCache !== undefined && !force) return annCache;
  const { data } = await sb.from("app_settings").select("anniversary_date").eq("id", 1).maybeSingle();
  annCache = (data?.anniversary_date as string | null) ?? null;
  return annCache;
}

export function useAnniversary(version = 0): string | null {
  const [ann, setAnn] = useState<string | null>(annCache ?? null);
  useEffect(() => { loadAnniversary(version > 0).then(setAnn).catch(() => undefined); }, [version]);
  return ann;
}

/** คืนจำนวนปีที่ครบ ถ้า date ตรงวันครบรอบ (ปีแรกขึ้นไป) ไม่ใช่คืน null */
export function anniversaryYears(date: string, ann: string | null): number | null {
  if (!ann || date.slice(5) !== ann.slice(5)) return null;
  const y = Number(date.slice(0, 4)) - Number(ann.slice(0, 4));
  return y >= 1 ? y : null;
}

/** จำนวนวันจาก today ถึงวันครบรอบครั้งถัดไป (0 = วันนี้) */
export function daysToAnniversary(today: string, ann: string | null): { days: number; years: number } | null {
  if (!ann) return null;
  const [ty] = today.split("-").map(Number);
  for (const y of [ty, ty + 1]) {
    const d = `${y}-${ann.slice(5)}`;
    const diff = Math.round((Date.parse(d) - Date.parse(today)) / 86_400_000);
    const years = y - Number(ann.slice(0, 4));
    if (diff >= 0 && years >= 1 && Number.isFinite(diff)) return { days: diff, years };
  }
  return null;
}

// ---------- ออฟไลน์ ----------
export function useOnline(): boolean {
  const [on, setOn] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);
  return on;
}

type Cached<T> = { at: number; data: T };
export function saveCache<T>(key: string, data: T) {
  try { localStorage.setItem(`bem_cache_${key}`, JSON.stringify({ at: Date.now(), data } satisfies Cached<T>)); } catch { /* เต็ม/ปิดไว้ */ }
}
export function readCache<T>(key: string): Cached<T> | null {
  try {
    const v = JSON.parse(localStorage.getItem(`bem_cache_${key}`) ?? "null");
    return v && Number.isFinite(v.at) ? v : null;
  } catch { return null; }
}
export const cacheTime = (at: number) =>
  new Date(at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
