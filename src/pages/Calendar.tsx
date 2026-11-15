import { useEffect, useState } from "react";
import { loadDays, monthlySummary, type DayInfo } from "../lib/data";
import { todayBkk, monthRange, dowOf, MONTH_TH, shortDate } from "../lib/dateBkk";
import { LEVEL_ICON, durationTh } from "../lib/matching";
import { useApp, Card, Spinner, benzLabel, eawLabel } from "../components/ui";

const HEAD = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

export default function Calendar() {
  const { types, profiles, typeMap, version, openDay } = useApp();
  const t = todayBkk();
  const [ym, setYm] = useState({ y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)) });
  const [days, setDays] = useState<DayInfo[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setDays(null);
    const [from, to] = monthRange(ym.y, ym.m);
    loadDays(from, to, types, profiles)
      .then(d => { setDays(d); setError(""); })
      .catch(() => setError("โหลดข้อมูลไม่ได้ ลองใหม่อีกครั้ง"));
  }, [ym, types, profiles, version]);

  const move = (n: number) => setYm(({ y, m }) => {
    const k = y * 12 + (m - 1) + n;
    return { y: Math.floor(k / 12), m: (k % 12) + 1 };
  });

  const lead = days ? (dowOf(days[0].date) + 6) % 7 : 0;
  const sum = days ? monthlySummary(days) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => move(-1)} className="h-12 w-12 rounded-xl bg-slate-800 text-xl" aria-label="เดือนก่อน">‹</button>
        <h2 className="text-lg font-bold">{MONTH_TH[ym.m - 1]} {ym.y + 543}</h2>
        <button type="button" onClick={() => move(1)} className="h-12 w-12 rounded-xl bg-slate-800 text-xl" aria-label="เดือนถัดไป">›</button>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
        <span>แถว 1 = Benz</span><span>แถว 2 = Eaw</span><span>แถว 3 = ผล</span>
      </div>

      {error && <p className="text-center text-rose-400">{error}</p>}
      {!days && !error && <Spinner />}
      {days && (
        <div className="grid grid-cols-7 gap-1">
          {HEAD.map(h => <div key={h} className="text-center text-xs text-slate-400">{h}</div>)}
          {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} />)}
          {days.map(d => {
            const b = benzLabel(d), e = eawLabel(d, typeMap);
            return (
              <button key={d.date} type="button" onClick={() => openDay(d.date)}
                aria-label={`${shortDate(d.date)} Benz ${b.text} Eaw ${e.text}`}
                className={`flex min-h-24 flex-col items-stretch gap-0.5 rounded-lg bg-slate-800 p-1 text-left ${d.date === t ? "ring-2 ring-violet-400" : ""}`}>
                <span className="text-xs font-bold">{Number(d.date.slice(8))}</span>
                <span className="truncate rounded px-0.5 text-sm md:text-xs" style={{ background: b.color + "40" }}>
                  {b.icon}<span className="hidden md:inline"> {b.text}</span></span>
                <span className="truncate rounded px-0.5 text-sm md:text-xs" style={{ background: e.color + "40" }}>
                  {e.icon}<span className="hidden md:inline"> {e.text}</span></span>
                <span className="text-center text-sm">{LEVEL_ICON[d.result.level]}
                  <span className="hidden md:inline text-xs"> {d.result.level === "incomplete" ? "" : durationTh(d.result.totalMinutes)}</span></span>
              </button>
            );
          })}
        </div>
      )}

      {sum && (
        <Card>
          <h3 className="mb-2 font-bold">📊 สรุปเดือนนี้</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Stat k="💞 วันที่ว่างตรงกัน" v={`${sum.freeDays} วัน`} />
            <Stat k="🌆 เย็นที่ว่างตรงกัน" v={`${sum.freeEvenings} เย็น`} />
            <Stat k="🏖️ หยุดตรงกันทั้งวัน" v={`${sum.bothOffFullDay} วัน`} />
            <Stat k="⏱️ Benz มี OT" v={`${sum.otDays} วัน`} />
          </dl>
          <p className="mt-3 text-sm text-slate-400">เวรของ Eaw</p>
          <div className="mt-1 flex flex-wrap gap-2 text-sm">
            {types.filter(x => !x.needs_confirm).map(x => (
              <span key={x.code} className="rounded-lg px-2 py-1" style={{ background: x.color + "33" }}>
                {x.icon} {x.label_th} {sum.shiftCounts[x.code] ?? 0}
              </span>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate-400">🏆 วันที่เหมาะนัดที่สุด</p>
          {sum.bestDays.length === 0 && <p className="text-sm">ยังไม่มีข้อมูลพอ</p>}
          <ol className="mt-1 flex flex-col gap-1">
            {sum.bestDays.map((d, i) => (
              <li key={d.date}>
                <button type="button" onClick={() => openDay(d.date)} className="flex w-full justify-between rounded-lg bg-slate-700/50 px-3 py-2 text-left">
                  <span>{i + 1}. {shortDate(d.date)}</span><span>{LEVEL_ICON[d.result.level]} {durationTh(d.result.totalMinutes)}</span>
                </button>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return <div className="rounded-lg bg-slate-700/50 p-2"><dt className="text-slate-400">{k}</dt><dd className="text-lg font-bold">{v}</dd></div>;
}
