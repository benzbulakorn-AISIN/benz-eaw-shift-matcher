// 🕐 ไทม์ไลน์วันนี้ (v2) + เส้นเวลาปัจจุบัน + นับถอยหลัง (อัปเดตทุก 30 วินาที)
// v2: ป้ายเวลาปัจจุบันบนจุดของเส้นแดง · สเกลเวลาทุก 2 ชั่วโมง (00, 02, 04 … 24)
import { useEffect, useState } from "react";
import type { DayInfo } from "../lib/data";
import { minToTime, LEVEL_ICON, LEVEL_COLOR, type Seg } from "../lib/matching";
import { shortDate } from "../lib/dateBkk";
import { useApp, Card, C, benzLabel, eawLabel } from "./ui";

export function nowMinBkk(d = new Date()): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const h = Number(p.find(x => x.type === "hour")?.value ?? 0) % 24;
  const m = Number(p.find(x => x.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export function dur(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0 นาที";
  const h = Math.floor(min / 60), m = min % 60;
  return [h ? `${h} ชม.` : "", m ? `${m} นาที` : ""].filter(Boolean).join(" ");
}

const HOURS = Array.from({ length: 13 }, (_, i) => i * 2);   // 0, 2, 4 … 24
const pctOf = (min: number) => (min / 1440) * 100;

function personNow(busy: Seg[], now: number): { busy: boolean; text: string } {
  const cur = busy.find(s => now >= s.s && now < s.e);
  if (cur) return { busy: true, text: cur.e >= 1440 ? "ไม่ว่างถึงเที่ยงคืน" : `ว่างอีก ${dur(cur.e - now)} (${minToTime(cur.e)})` };
  const next = busy.filter(s => s.s > now).sort((a, b) => a.s - b.s)[0];
  return { busy: false, text: next ? `ว่างอยู่ · ติดธุระอีก ${dur(next.s - now)} (${minToTime(next.s)})` : "ว่างถึงสิ้นวัน" };
}

// เส้นแนวตั้งทุก 2 ชม. (เส้นทุก 6 ชม. เข้มกว่า)
function Grid() {
  return (
    <>
      {HOURS.slice(1, -1).map(h => (
        <div key={h} className={`absolute inset-y-0 w-px ${h % 6 === 0 ? "bg-slate-500/50" : "bg-slate-500/20"}`} style={{ left: `${pctOf(h * 60)}%` }} />
      ))}
    </>
  );
}

function Track({ label, segs, color, now }: { label: string; segs: Seg[]; color: string; now: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs text-slate-400">{label}</span>
      <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-slate-700">
        {segs.map((x, i) => (
          <div key={i} className="absolute inset-y-0 rounded-full"
            style={{ left: `${pctOf(x.s)}%`, width: `${pctOf(x.e - x.s)}%`, background: color, opacity: x.e <= now ? 0.35 : 1 }} />
        ))}
        <Grid />
      </div>
    </div>
  );
}

export default function TodayTimeline({ day }: { day: DayInfo }) {
  const { typeMap, openDay } = useApp();
  const [now, setNow] = useState(nowMinBkk());
  useEffect(() => {
    const t = window.setInterval(() => setNow(nowMinBkk()), 30_000);
    const vis = () => document.visibilityState === "visible" && setNow(nowMinBkk());
    document.addEventListener("visibilitychange", vis);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, []);

  const r = day.result;
  const color = LEVEL_COLOR[r.level];
  const eawColor = typeMap.get(day.shift?.code ?? "")?.color ?? C.none;
  const pct = pctOf(now);
  // ป้ายเวลาไม่ให้ล้นขอบซ้าย/ขวา
  const labelShift = pct < 8 ? "0%" : pct > 92 ? "-100%" : "-50%";

  let head: { icon: string; text: string; sub: string; tone: string };
  if (r.level === "incomplete") {
    head = { icon: "⚪", text: "ข้อมูลไม่ครบ", sub: r.missingReason ?? "", tone: C.none };
  } else {
    const cur = r.windows.find(w => now >= w.s && now < w.e);
    const next = r.windows.filter(w => w.s > now).sort((a, b) => a.s - b.s)[0];
    if (cur) head = { icon: "💚", text: `ตอนนี้ว่างตรงกัน · เหลืออีก ${dur(cur.e - now)}`, sub: `ถึง ${minToTime(cur.e)} น.`, tone: C.free };
    else if (next) head = { icon: "⏳", text: `อีก ${dur(next.s - now)} จะได้เจอกัน 💕`, sub: `ว่างตรงกัน ${minToTime(next.s)}–${minToTime(next.e)} น.`, tone: color };
    else if (r.windows.length) head = { icon: "🌙", text: "ช่วงว่างตรงกันวันนี้ผ่านไปแล้ว", sub: `วันนี้ได้อยู่ด้วยกัน ${dur(r.totalMinutes)}`, tone: C.none };
    else head = { icon: "❤️", text: "วันนี้ไม่มีเวลาว่างตรงกัน", sub: "📞 โทรหากันก่อนนอนนะ", tone: LEVEL_COLOR.red };
  }

  const bNow = personNow(r.benzBusy, now);
  const eNow = personNow(r.eawBusy, now);

  return (
    <button type="button" onClick={() => openDay(day.date)} className="text-left" aria-label={`ดูรายละเอียดวันนี้ ${shortDate(day.date)}`}>
      <Card className="!p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <p className="text-sm font-semibold text-slate-400">วันนี้ · {shortDate(day.date)}</p>
          <span className="rounded-full bg-slate-700 px-2.5 py-0.5 text-xs font-bold tabular-nums">🕐 {minToTime(now)}</span>
        </div>
        <div className="px-4 pb-1 pt-1" aria-live="polite">
          <p className="text-lg font-extrabold" style={{ color: head.tone }}>{head.icon} {head.text}</p>
          <p className="text-sm font-semibold text-slate-400">{head.sub}</p>
        </div>

        {/* ไทม์ไลน์ + เส้นตอนนี้ (pt-9 เผื่อพื้นที่ป้ายเวลา) */}
        <div className="relative flex flex-col gap-1.5 px-4 pb-2 pt-9">
          <Track label="Benz" segs={r.benzBusy} color={C.work} now={now} />
          <Track label="Eaw" segs={r.eawBusy} color={eawColor} now={now} />
          <Track label="ว่างร่วม" segs={r.windows} color={C.free} now={now} />

          {/* สเกลทุก 2 ชม. */}
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0" />
            <div className="relative h-4 flex-1 text-[9px] tabular-nums text-slate-500 sm:text-[11px]">
              {HOURS.map(h => (
                <span key={h} className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${pctOf(h * 60)}%`, transform: h === 0 ? "none" : h === 24 ? "translateX(-100%)" : undefined }}>
                  {String(h).padStart(2, "0")}<span className="hidden sm:inline">:00</span>
                </span>
              ))}
            </div>
          </div>

          {/* เส้นเวลาปัจจุบัน + ป้ายเวลา (คอลัมน์ป้ายกว้าง 3rem + gap 0.5rem) */}
          <div className="pointer-events-none absolute bottom-7 top-2 left-[calc(1rem+3.5rem)] right-4">
            <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded bg-rose-500" style={{ left: `${pct}%` }}>
              <span className="absolute left-1/2 top-[22px] h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-rose-500 ring-2 ring-slate-800" />
            </div>
            <span className="absolute top-0 whitespace-nowrap rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-extrabold tabular-nums text-white shadow"
              style={{ left: `${pct}%`, transform: `translateX(${labelShift})` }}>
              {minToTime(now)} น.
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-slate-700 px-4 py-3 text-sm">
          {[{ who: "Benz", lb: benzLabel(day), st: bNow }, { who: "Eaw", lb: eawLabel(day, typeMap), st: eNow }].map(p => (
            <div key={p.who} className="min-w-0 rounded-xl bg-slate-700/50 px-3 py-2">
              <p className="truncate font-bold">{p.lb.icon} {p.who}</p>
              <p className={`truncate text-xs font-semibold ${p.st.busy ? "text-orange-300" : "text-emerald-300"}`}>
                {p.st.busy ? "🔴 " : "🟢 "}{r.level === "incomplete" && p.who === "Eaw" && !day.shift ? "ไม่มีเวร" : p.st.text}
              </p>
            </div>
          ))}
        </div>
        {r.level !== "incomplete" && r.totalMinutes > 0 && (
          <p className="border-t border-slate-700 px-4 py-2 text-xs text-slate-400">
            {LEVEL_ICON[r.level]} ทั้งวันว่างตรงกัน {dur(r.totalMinutes)} · {r.windows.map(w => `${minToTime(w.s)}–${minToTime(w.e)}`).join(", ")}
          </p>
        )}
      </Card>
    </button>
  );
}
