// 🏛️ วันหยุดราชการ + 💰 วันเงินเดือนออก (ข้อมูลอ้างอิง — ไม่มีผลกับการคำนวณเวลาว่าง)
import { useEffect, useState } from "react";
import { sb } from "./supabase";

export type RefDate = { ref_date: string; kind: "gov_holiday" | "payday"; title: string; gov_off: boolean; note: string | null };
export const REF_ICON: Record<RefDate["kind"], string> = { gov_holiday: "🏛️", payday: "💰" };

const cache = new Map<number, RefDate[]>();

/** โหลดข้อมูลอ้างอิงของปี y (ค.ศ.) — คืน null ระหว่างโหลด */
export function useRefDates(y: number): RefDate[] | null {
  const [list, setList] = useState<RefDate[] | null>(cache.get(y) ?? null);
  useEffect(() => {
    let alive = true;
    if (cache.has(y)) { setList(cache.get(y)!); return; }
    sb.from("reference_dates").select("ref_date, kind, title, gov_off, note")
      .gte("ref_date", `${y}-01-01`).lte("ref_date", `${y}-12-31`).order("ref_date")
      .then(({ data, error }) => {
        const v = error ? [] : ((data ?? []) as RefDate[]);
        if (!error) cache.set(y, v);
        if (alive) setList(v);
      });
    return () => { alive = false; };
  }, [y]);
  return list;
}

export const refsOn = (date: string, list: RefDate[] | null) => (list ?? []).filter(r => r.ref_date === date);
