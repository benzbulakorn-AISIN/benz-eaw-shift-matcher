import { useEffect, useState } from "react";
import { loadDays, type DayInfo } from "../lib/data";
import { todayBkk, addDays, shortDate, DOW_SHORT, dowOf } from "../lib/dateBkk";
import { LEVEL_ICON, LEVEL_COLOR, windowsText, suggestion, durationTh } from "../lib/matching";
import { useApp, Card, Row, Spinner, benzLabel, eawLabel } from "../components/ui";

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
  const missing = days.slice(1).filter(d => !d.shift).length;

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={() => openDay(tomorrow.date)} className="text-left">
        <Card className="border-2" >
          <p className="text-sm text-slate-400">พรุ่งนี้ · {shortDate(tomorrow.date)}</p>
          <p className="mt-1 text-2xl font-bold" style={{ color: LEVEL_COLOR[r.level] }}>
            {LEVEL_ICON[r.level]} {r.level === "incomplete" ? "ข้อมูลไม่ครบ" : r.totalMinutes ? `ว่างตรงกัน ${durationTh(r.totalMinutes)}` : "ไม่ว่างตรงกัน"}
          </p>
          {r.level !== "incomplete" && r.totalMinutes > 0 && <p className="text-lg">{windowsText(r).replace(/^ว่างตรงกัน /, "").replace(/ รวม.*$/, "")}{r.isApprox ? " (ประมาณ)" : ""}</p>}
          <hr className="my-3 border-slate-700" />
          <Row who="Benz" label={benzLabel(tomorrow)} />
          <Row who="Eaw" label={eawLabel(tomorrow, typeMap)} />
          <hr className="my-3 border-slate-700" />
          <p className="font-semibold">{suggestion(r)}</p>
          {r.hints.map(h => <p key={h} className="text-sm text-amber-300">{h}</p>)}
        </Card>
      </button>

      <button type="button" onClick={() => openDay(today.date)}
        className="flex items-center justify-between rounded-xl bg-slate-800 px-4 py-3 text-left">
        <span>วันนี้ · {shortDate(today.date)}</span>
        <span className="font-semibold">{LEVEL_ICON[today.result.level]} {today.result.level === "incomplete" ? "ข้อมูลไม่ครบ" : durationTh(today.result.totalMinutes)}</span>
      </button>

      <div>
        <p className="mb-2 text-sm text-slate-400">7 วันข้างหน้า</p>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[tomorrow, ...week].map(d => (
            <button key={d.date} type="button" onClick={() => openDay(d.date)}
              className="flex min-w-16 flex-col items-center rounded-xl bg-slate-800 px-2 py-2"
              aria-label={`${shortDate(d.date)} ${windowsText(d.result)}`}>
              <span className="text-xs text-slate-400">{DOW_SHORT[dowOf(d.date)]}</span>
              <span className="text-lg font-bold">{Number(d.date.slice(8))}</span>
              <span className="text-xl" aria-hidden>{LEVEL_ICON[d.result.level]}</span>
            </button>
          ))}
        </div>
      </div>

      {missing > 0 && (
        <button type="button" onClick={() => goTab("upload")} className="rounded-xl border border-orange-400 bg-orange-500/15 px-4 py-3 text-left font-semibold text-orange-200">
          ⚠️ ยังไม่มีเวรของ Eaw {missing} วัน → อัปโหลด
        </button>
      )}
    </div>
  );
}
