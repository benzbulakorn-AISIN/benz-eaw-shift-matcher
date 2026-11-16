// 🎉 วันพิเศษ (หลายรายการ) + 📶 แคชข้อมูลไว้ใช้ตอนออฟไลน์
import { useEffect, useState } from "react";
import { sb } from "./supabase";

export type SpecialEvent = {
  id: string; title: string; icon: string; event_date: string;
  yearly: boolean; show_years: boolean; remind_days: number; note: string | null;
};
export type Occurrence = { ev: SpecialEvent; date: string; days: number; years: number | null };

// ---------- โหลด ----------
let cache: SpecialEvent[] | undefined;
export async function loadEvents(force = false): Promise<SpecialEvent[]> {
  if (cache && !force) return cache;
  const { data, error } = await sb.from("special_events").select("*").order("event_date");
  if (error) throw error;
  cache = (data ?? []) as SpecialEvent[];
  return cache;
}
export function useEvents(version = 0): SpecialEvent[] {
  const [list, setList] = useState<SpecialEvent[]>(cache ?? []);
  useEffect(() => { loadEvents(version > 0).then(setList).catch(() => undefined); }, [version]);
  return list;
}

// ---------- คำนวณวัน ----------
const pad = (n: number) => String(n).padStart(2, "0");
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const diffDays = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** วันที่ของ event ในปี y (29 ก.พ. → 28 ก.พ. ในปีที่ไม่ใช่อธิกสุรทิน) */
function dateInYear(ev: SpecialEvent, y: number): string {
  const [, m, d] = ev.event_date.split("-").map(Number);
  const dd = m === 2 && d === 29 && !isLeap(y) ? 28 : d;
  return `${y}-${pad(m)}-${pad(dd)}`;
}

function yearsAt(ev: SpecialEvent, date: string): number | null {
  if (!ev.yearly || !ev.show_years) return null;
  const n = Number(date.slice(0, 4)) - Number(ev.event_date.slice(0, 4));
  return n >= 1 ? n : null;
}

/** ครั้งถัดไปนับจาก from (รวมวันนี้) */
export function nextOccurrence(ev: SpecialEvent, from: string): Occurrence | null {
  if (!ev.yearly) {
    const days = diffDays(from, ev.event_date);
    return days >= 0 ? { ev, date: ev.event_date, days, years: null } : null;
  }
  const y = Number(from.slice(0, 4));
  for (const yy of [y, y + 1]) {
    const date = dateInYear(ev, yy);
    if (date < ev.event_date) continue;          // ก่อนวันจริงครั้งแรก
    const days = diffDays(from, date);
    if (days >= 0) return { ev, date, days, years: yearsAt(ev, date) };
  }
  return null;
}

/** วันพิเศษที่ตรงกับวันที่ date */
export function eventsOn(date: string, events: SpecialEvent[]): Occurrence[] {
  return events.flatMap(ev => {
    const o = nextOccurrence(ev, date);
    return o && o.days === 0 ? [o] : [];
  });
}

/** วันพิเศษที่อยู่ในช่วงเตือน (0 ≤ days ≤ remind_days) เรียงใกล้สุดก่อน */
export function upcomingEvents(today: string, events: SpecialEvent[]): Occurrence[] {
  return events
    .map(ev => nextOccurrence(ev, today))
    .filter((o): o is Occurrence => !!o && (o.days === 0 || o.days <= o.ev.remind_days))
    .sort((a, b) => a.days - b.days);
}

export function occLabel(o: Occurrence): string {
  return `${o.ev.title}${o.years ? ` · ครบ ${o.years} ปี` : ""}`;
}
export function daysText(days: number): string {
  return days === 0 ? "วันนี้! 🎉" : days === 1 ? "พรุ่งนี้" : `อีก ${days} วัน`;
}

// ---------- รองรับโค้ดเดิม (หน้าตั้งค่าเวอร์ชันก่อน) ----------
export async function loadAnniversary(): Promise<string | null> {
  const { data } = await sb.from("app_settings").select("anniversary_date").eq("id", 1).maybeSingle();
  return (data?.anniversary_date as string | null) ?? null;
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
  try { localStorage.setItem(`bem_cache_${key}`, JSON.stringify({ at: Date.now(), data })); } catch { /* เต็ม/ปิดไว้ */ }
}
export function readCache<T>(key: string): Cached<T> | null {
  try {
    const v = JSON.parse(localStorage.getItem(`bem_cache_${key}`) ?? "null");
    return v && Number.isFinite(v.at) ? v : null;
  } catch { return null; }
}
export const cacheTime = (at: number) =>
  new Date(at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
