import { useEffect, useState } from "react";
import { loadDays, type DayInfo } from "../lib/data";
import { todayBkk, addDays, shortDate, DOW_SHORT, dowOf } from "../lib/dateBkk";
import { LEVEL_ICON, LEVEL_COLOR, suggestion, durationTh, minToTime, type MatchResult } from "../lib/matching";
import { useApp, Card, Row, Spinner, TimeBar, TimeScale, benzLabel, eawLabel, C } from "../components/ui";

const LEVEL_TEXT: Record<string, string> = {
  green: "ว่างตรงกันเยอะ", yellow: "ว่างตรงกันพอดี", orange: "ว่างตรงกันนิดหน่อย", red: "ไม่ว่างตรงกัน", incomplete: "ข้อมูลไม่ครบ",
};
const shortHrs = (r: MatchResult) =>
  r.level === "incomplete" ? "–" : r.totalMinutes === 0 ? "0" : `${Math.round(r.totalMinutes / 6) / 10}ช.`;

export default function Home() {
  const { types, profiles, typeMap, version, openDay, goTab } = useApp();
  const [days, setDays] = useState<DayInfo[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const today = todayBkk();
    loadDays(today, addDays(today, 7), types, profiles)
      .then(d => { setDays(d); setError(""); })
      .catch(() => setError("โหลดข้อมูลไม่ได้ ลองใหม่อีกครั้ง"));
  }, [types, profiles, version]);

  if (error) return <p className="py-8 text-center text-rose-400">{error}</p>;
  if (!days) return <Spinner />;

  const [today, tomorrow, ...week] = days;
  const r = tomorrow.result;
  const color = LEVEL_COLOR[r.level];
  const missing = days.slice(1).filter(d => !d.shift).length;
  const eawColor = typeMap.get(tomorrow.shift?.code ?? "")?.color ?? C.none;

  return (
    <div className="flex flex-col gap-3">
      {/* ===== การ์ดพรุ่งนี้ ===== */}
      <button type="button" onClick={() => openDay(tomorrow.date)} className="text-left" aria-label={`ดูรายละเอียดพรุ่งนี้ ${shortDate(tomorrow.date)}`}>
        <Card className="relative overflow-hidden !p-0" style={{ borderColor: color + "88" }}>
          <div className="px-4 pb-3 pt-4" style={{ background: `linear-gradient(135deg, ${color}2e, transparent 70%)` }}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-400">พรุ่งนี้ · {shortDate(tomorrow.date)}</p>
              <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: color + "33", color }}>
                {LEVEL_ICON[r.level]} {LEVEL_TEXT[r.level]}
              </span>
            </div>
            {r.level === "incomplete" ? (
              <p className="mt-2 text-2xl font-extrabold text-slate-300">⚪ {r.missingReason}</p>
            ) : r.totalMinutes > 0 ? (
              <>
                <p className="mt-2 text-4xl font-extrabold tracking-tight" style={{ color }}>
                  {durationTh(r.totalMinutes)}{r.isApprox ? <span className="text-base font-semibold"> (ประมาณ)</span> : null}
                </p>
                <p className="text-lg font-semibold text-slate-200">
                  🕐 {r.windows.map(w => `${minToTime(w.s)}–${minToTime(w.e)}`).join(", ")} น.
                </p>
              </>
            ) : (
              <p className="mt-2 text-3xl font-extrabold" style={{ color }}>ไม่มีเวลาว่างตรงกัน</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5 border-t border-slate-700 px-4 py-3">
            <TimeBar label="Benz" segs={r.benzBusy} color={C.work} />
            <TimeBar label="Eaw" segs={r.eawBusy} color={eawColor} />
            <TimeBar label="ว่างร่วม" segs={r.windows} color={C.free} />
            <TimeScale />
          </div>

          <div className="border-t border-slate-700 px-4 py-2">
            <Row who="Benz" label={benzLabel(tomorrow)} />
            <Row who="Eaw" label={eawLabel(tomorrow, typeMap)} />
          </div>

          <div className="border-t border-slate-700 bg-slate-900/40 px-4 py-3">
            <p className="font-semibold">{suggestion(r)}</p>
            {r.hints.map(h => <p key={h} className="text-sm font-semibold text-amber-300">{h}</p>)}
          </div>
        </Card>
      </button>

      {/* ===== วันนี้ ===== */}
      <button type="button" onClick={() => openDay(today.date)}
        className="card flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-left">
        <span><span className="text-sm text-slate-400">วันนี้</span><br /><span className="font-semibold">{shortDate(today.date)}</span></span>
        <span className="text-lg font-bold" style={{ color: LEVEL_COLOR[today.result.level] }}>
          {LEVEL_ICON[today.result.level]} {today.result.level === "incomplete" ? "ข้อมูลไม่ครบ" : today.result.totalMinutes ? durationTh(today.result.totalMinutes) : "ไม่ว่าง"}
        </span>
      </button>

      {/* ===== 7 วันข้างหน้า (พอดีจอ ไม่ต้องเลื่อน) ===== */}
      <div>
        <p className="mb-2 px-1 text-sm font-semibold text-slate-400">7 วันข้างหน้า</p>
        <div className="grid grid-cols-7 gap-1.5">
          {[tomorrow, ...week].slice(0, 7).map(d => {
            const dow = dowOf(d.date);
            return (
              <button key={d.date} type="button" onClick={() => openDay(d.date)}
                aria-label={`${shortDate(d.date)} ${d.result.level === "incomplete" ? "ข้อมูลไม่ครบ" : durationTh(d.result.totalMinutes)}`}
                className="card flex flex-col items-center gap-0.5 rounded-xl border border-slate-700 bg-slate-800 py-2"
                style={{ boxShadow: `inset 0 -3px 0 ${LEVEL_COLOR[d.result.level]}` }}>
                <span className={`text-[11px] ${dow === 0 || dow === 6 ? "text-rose-400" : "text-slate-400"}`}>{DOW_SHORT[dow]}</span>
                <span className="text-lg font-bold leading-tight">{Number(d.date.slice(8))}</span>
                <span className="text-base leading-none" aria-hidden>{LEVEL_ICON[d.result.level]}</span>
                <span className="text-[10px] font-semibold text-slate-400">{shortHrs(d.result)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {missing > 0 && (
        <button type="button" onClick={() => goTab("upload")}
          className="rounded-2xl border border-orange-400 bg-orange-500/10 px-4 py-3 text-left font-semibold text-orange-200">
          ⚠️ ยังไม่มีเวรของ Eaw {missing} วัน → อัปโหลด
        </button>
      )}
    </div>
  );
}
