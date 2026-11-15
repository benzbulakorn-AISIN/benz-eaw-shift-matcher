import { createContext, useContext, type ReactNode } from "react";
import type { Profile, ShiftType, DayInfo } from "../lib/data";
import { minToTime, WORKING, type Seg } from "../lib/matching";

// ---------- Context ของทั้งแอป ----------
export type Tab = "home" | "calendar" | "upload" | "settings";
export type AppCtx = {
  me: Profile;
  profiles: Profile[];
  types: ShiftType[];
  typeMap: Map<string, ShiftType>;
  version: number;
  bump: () => void;
  openDay: (date: string) => void;
  toast: (msg: string) => void;
  goTab: (t: Tab) => void;
};
export const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("NO_CTX");
  return c;
};

// ---------- สีและป้ายสถานะ ----------
export const C = {
  work: "#3B82F6", ot: "#7C3AED", free: "#22C55E", leave: "#EC4899", none: "#64748B",
};
const HOLIDAY_TH: Record<string, string> = {
  weekly_holiday: "วันหยุด", public_holiday: "นักขัตฤกษ์",
  substitute_holiday: "หยุดชดเชย", extra_holiday: "หยุดพิเศษ",
};
export const DAY_TYPE_LABEL: Record<string, { icon: string; label: string; color: string }> = {
  workday: { icon: "💼", label: "วันทำงาน", color: C.work },
  saturday_workday: { icon: "💼", label: "เสาร์ทำงาน", color: "#0EA5E9" },
  weekly_holiday: { icon: "🏖️", label: "หยุดประจำสัปดาห์", color: "#EF4444" },
  public_holiday: { icon: "🔶", label: "หยุดนักขัตฤกษ์", color: "#EAB308" },
  substitute_holiday: { icon: "🔵", label: "หยุดชดเชย", color: "#38BDF8" },
  extra_holiday: { icon: "🔺", label: "หยุดพิเศษ", color: C.free },
};

export const segText = (s: Seg[]) => s.map(x => `${minToTime(x.s)}–${minToTime(x.e)}`).join(", ");

export type Label = { icon: string; text: string; color: string };

export function benzLabel(d: DayInfo): Label {
  if (!d.dayType) return { icon: "❔", text: "ไม่มีปฏิทิน", color: C.none };
  if (WORKING.includes(d.dayType)) {
    if (!d.ot) return { icon: "💼", text: "07:30–16:30", color: C.work };
    return { icon: "⏱️", text: d.ot.end === null ? "OT (ประมาณ 20:00)" : `OT ถึง ${minToTime(d.ot.end)}`, color: C.ot };
  }
  if (d.ot) return { icon: "⏱️", text: `มาทำงาน ${minToTime(d.ot.start)}–${d.ot.end === null ? "20:00?" : minToTime(d.ot.end)}`, color: C.ot };
  return { icon: "🏖️", text: HOLIDAY_TH[d.dayType] ?? "วันหยุด", color: C.free };
}

export function eawLabel(d: DayInfo, typeMap: Map<string, ShiftType>): Label {
  if (!d.shift) return { icon: "❔", text: "ไม่มีเวร", color: C.none };
  const t = typeMap.get(d.shift.code);
  if (!t) return { icon: "⚠️", text: d.shift.code, color: "#FB923C" };
  if (t.is_leave) return { icon: t.icon, text: `${t.label_th} (${d.shift.leaveIsFree === false ? "ไม่ว่าง" : "ว่าง"})`, color: t.color };
  if (!d.shift.segments.length) return { icon: t.icon, text: t.label_th, color: t.color };
  return { icon: t.icon, text: `${t.label_th} ${segText(d.shift.segments)}`, color: t.color };
}

// ---------- Components ----------
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-slate-800/90 border border-slate-700 p-4 ${className}`}>{children}</section>;
}

export function Row({ who, label }: { who: string; label: Label }) {
  return (
    <div className="flex items-center gap-2 py-1 min-w-0">
      <span className="w-12 shrink-0 text-sm text-slate-400">{who}</span>
      <span className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold min-w-0"
        style={{ background: label.color + "33", color: "#F1F5F9", borderLeft: `4px solid ${label.color}` }}>
        <span aria-hidden>{label.icon}</span><span className="truncate">{label.text}</span>
      </span>
    </div>
  );
}

export function PrimaryButton({ children, disabled, onClick, type = "button" }:
  { children: ReactNode; disabled?: boolean; onClick?: () => void; type?: "button" | "submit" }) {
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      className="w-full min-h-12 rounded-xl bg-violet-600 px-4 py-3 text-base font-bold text-white disabled:bg-slate-600 disabled:text-slate-300 active:scale-[.99]">
      {children}
    </button>
  );
}

// แถบเวลา 00–24 (ส่วนที่ทึบ = ไม่ว่าง)
export function TimeBar({ label, segs, color }: { label: string; segs: Seg[]; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs text-slate-400">{label}</span>
      <div className="relative h-5 flex-1 rounded bg-slate-700/60 overflow-hidden" aria-label={`${label} ${segText(segs) || "ไม่มี"}`}>
        {segs.map((x, i) => (
          <div key={i} className="absolute inset-y-0" style={{ left: `${(x.s / 1440) * 100}%`, width: `${((x.e - x.s) / 1440) * 100}%`, background: color }} />
        ))}
        {[6, 12, 18].map(h => <div key={h} className="absolute inset-y-0 w-px bg-slate-500/50" style={{ left: `${(h / 24) * 100}%` }} />)}
      </div>
    </div>
  );
}

export function TimeScale() {
  return (
    <div className="flex items-center gap-2 text-[10px] text-slate-500">
      <span className="w-12 shrink-0" />
      <div className="flex flex-1 justify-between"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
    </div>
  );
}

export function Spinner({ text = "กำลังโหลด..." }: { text?: string }) {
  return <p className="py-8 text-center text-slate-400" role="status">⏳ {text}</p>;
}

// ตัวเลือกเวลา 30 นาที
export function timeOptions(from: number, to: number) {
  const out: number[] = [];
  for (let m = from; m <= to; m += 30) out.push(m);
  return out;
}
