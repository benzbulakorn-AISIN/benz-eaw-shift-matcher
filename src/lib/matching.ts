// ============================================================
// Matching Engine: คำนวณเวลาว่างร่วมกัน (Pure function, ไม่มี I/O)
// เวลาเป็น "นาทีของวัน" 0–1440, ช่วงแบบ [s, e)
// ไฟล์นี้ถูกคัดลอกไปไว้ใน supabase/functions/daily-notify/index.ts ด้วย (ต้องแก้ทั้ง 2 ที่ให้ตรงกัน)
// ============================================================
export type Seg = { s: number; e: number };
export type DayType =
  | "workday" | "saturday_workday" | "weekly_holiday"
  | "public_holiday" | "substitute_holiday" | "extra_holiday";
export type MatchLevel = "green" | "yellow" | "orange" | "red" | "incomplete";

export type BenzDay = {
  dayType: DayType | null;
  ot: { start: number; end: number | null } | null;
};
export type EawDay = {
  code: string;
  segments: Seg[];
  isLeave: boolean;
  leaveIsFree: boolean | null;
} | null;

export type Settings = {
  workStart: number;
  workEnd: number;
  workdayFocus: Seg;
  dayoffFocus: Seg;
  otUnknownEnd: number;
  leaveDefaultFree: boolean;
};

export type MatchResult = {
  level: MatchLevel;
  windows: Seg[];
  totalMinutes: number;
  longest: Seg | null;
  focus: Seg | null;
  benzBusy: Seg[];
  eawBusy: Seg[];
  benzWorking: boolean;
  isApprox: boolean;
  hints: string[];
  missingReason: string | null;
};

export const DEFAULT_SETTINGS: Settings = {
  workStart: 450, workEnd: 990,
  workdayFocus: { s: 990, e: 1440 }, dayoffFocus: { s: 480, e: 1440 },
  otUnknownEnd: 1200, leaveDefaultFree: true,
};

export const WORKING: DayType[] = ["workday", "saturday_workday"];

export const isValidSeg = (x: Seg) =>
  Number.isFinite(x.s) && Number.isFinite(x.e) && x.s >= 0 && x.e <= 1440 && x.s < x.e;

export function timeToMin(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v <= 1440 ? v : null;
}

export const minToTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function durationTh(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0 นาที";
  const h = Math.floor(min / 60), m = min % 60;
  return [h ? `${h} ชม.` : "", m ? `${m} นาที` : ""].filter(Boolean).join(" ");
}

export function union(segs: Seg[]): Seg[] {
  const sorted = segs.filter(isValidSeg).map(x => ({ ...x })).sort((a, b) => a.s - b.s);
  const out: Seg[] = [];
  for (const x of sorted) {
    const last = out[out.length - 1];
    if (last && x.s <= last.e) last.e = Math.max(last.e, x.e);
    else out.push(x);
  }
  return out;
}

function subtract(focus: Seg, busy: Seg[]): Seg[] {
  const out: Seg[] = [];
  let cur = focus.s;
  for (const b of union(busy)) {
    if (b.e <= cur || b.s >= focus.e) continue;
    if (b.s > cur) out.push({ s: cur, e: Math.min(b.s, focus.e) });
    cur = Math.max(cur, b.e);
    if (cur >= focus.e) break;
  }
  if (cur < focus.e) out.push({ s: cur, e: focus.e });
  return out;
}

export function levelOf(total: number): MatchLevel {
  if (total > 360) return "green";
  if (total >= 120) return "yellow";
  if (total > 0) return "orange";
  return "red";
}

function benzBusy(b: BenzDay, st: Settings): { segs: Seg[]; working: boolean; approx: boolean } | null {
  if (!b.dayType) return null;
  const working = WORKING.includes(b.dayType);
  const approx = !!b.ot && b.ot.end === null;
  const otEnd = b.ot ? (b.ot.end ?? st.otUnknownEnd) : null;
  if (working) {
    const end = Math.max(st.workEnd, otEnd ?? st.workEnd);
    return { segs: [{ s: st.workStart, e: end }], working, approx };
  }
  if (b.ot) return { segs: [{ s: b.ot.start, e: otEnd! }], working, approx };
  return { segs: [], working, approx: false };
}

function eawBusy(e: EawDay, st: Settings): Seg[] | null {
  if (!e || e.code === "UNKNOWN") return null;
  if (e.isLeave) {
    const free = e.leaveIsFree ?? st.leaveDefaultFree;
    return free ? [] : [{ s: 0, e: 1440 }];
  }
  return e.segments;
}

const incomplete = (reason: string): MatchResult => ({
  level: "incomplete", windows: [], totalMinutes: 0, longest: null, focus: null,
  benzBusy: [], eawBusy: [], benzWorking: false, isApprox: false, hints: [], missingReason: reason,
});

export function matchDay(benz: BenzDay, eaw: EawDay, nextEaw: EawDay | undefined, st: Settings = DEFAULT_SETTINGS): MatchResult {
  const b = benzBusy(benz, st);
  if (!b) return incomplete("ยังไม่มีปฏิทินบริษัทของวันนี้");
  const e = eawBusy(eaw, st);
  if (!e) return incomplete(eaw?.code === "UNKNOWN" ? "เวรของ Eaw รอยืนยัน" : "ยังไม่มีเวรของ Eaw");
  if (![...b.segs, ...e].every(isValidSeg)) return incomplete("เวลาไม่ถูกต้อง กรุณาตรวจสอบ");

  const focus = b.working ? st.workdayFocus : st.dayoffFocus;
  const windows = subtract(focus, [...b.segs, ...e]);
  const total = windows.reduce((s, w) => s + (w.e - w.s), 0);
  const longest = windows.reduce<Seg | null>((a, w) => (!a || w.e - w.s > a.e - a.s ? w : a), null);

  const hints: string[] = [];
  const nextStartsMidnight = !!nextEaw && !nextEaw.isLeave && nextEaw.segments.some(x => x.s === 0);
  if (nextStartsMidnight && windows.some(w => w.e === 1440)) hints.push("🌙 Eaw เข้าเวรต่อตอนเที่ยงคืน");
  if (b.approx) hints.push("⏱️ OT ยังไม่ระบุเวลาเลิก (คิดถึง 20:00)");

  return {
    level: levelOf(total), windows, totalMinutes: total, longest, focus,
    benzBusy: union(b.segs), eawBusy: union(e), benzWorking: b.working,
    isApprox: b.approx, hints, missingReason: null,
  };
}

export function suggestion(r: MatchResult): string {
  if (r.level === "incomplete") return `❔ ${r.missingReason}`;
  if (r.totalMinutes === 0) return "📞 โทรหากันก่อนนอนนะ";
  const overlap = (a: number, b: number) =>
    r.windows.reduce((s, w) => s + Math.max(0, Math.min(w.e, b) - Math.max(w.s, a)), 0);
  if (!r.benzWorking && r.totalMinutes >= 480) return "🚗 ไปเที่ยวด้วยกันได้ทั้งวัน";
  if (overlap(1020, 1260) >= 120) return `🍽️ ทานข้าวเย็นด้วยกันได้ประมาณ ${durationTh(r.totalMinutes)}`;
  if (overlap(660, 840) >= 120) return "☕ นัดทานข้าวกลางวันได้";
  if (r.totalMinutes < 120) return "💬 มีเวลาสั้น ๆ คุยกันได้";
  return `💛 มีเวลาว่างด้วยกัน ${durationTh(r.totalMinutes)}`;
}

export const LEVEL_ICON: Record<MatchLevel, string> =
  { green: "💚", yellow: "💛", orange: "🧡", red: "❤️", incomplete: "⚪" };
export const LEVEL_COLOR: Record<MatchLevel, string> =
  { green: "#22C55E", yellow: "#EAB308", orange: "#F97316", red: "#EF4444", incomplete: "#64748B" };

export function windowsText(r: MatchResult): string {
  if (r.level === "incomplete") return "ข้อมูลไม่ครบ";
  if (!r.windows.length) return "ไม่มีช่วงเวลาว่างตรงกัน";
  const t = r.windows.map(w => `${minToTime(w.s)}–${minToTime(w.e)}`).join(", ");
  return `ว่างตรงกัน ${t} น. รวม ${durationTh(r.totalMinutes)}${r.isApprox ? " (ประมาณ)" : ""}`;
}
