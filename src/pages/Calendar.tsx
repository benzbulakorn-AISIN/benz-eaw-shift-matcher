import { useEffect, useRef, useState } from "react";
import { loadDays, monthlySummary, type DayInfo } from "../lib/data";
import { todayBkk, monthRange, dowOf, MONTH_TH, shortDate } from "../lib/dateBkk";
import { LEVEL_ICON, LEVEL_COLOR, durationTh } from "../lib/matching";
import { useApp, Card, Spinner, benzLabel, eawLabel } from "../components/ui";

const HEAD = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

export default function Calendar() {
  const { types, profiles, typeMap, version, openDay } = useApp();
  const t = todayBkk();
  const [ym, setYm] = useState({ y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)) });
  const [days, setDays] = useState<DayInfo[] | null>(null);
  const [error, setError] = useState("");
  const touchX = useRef<number | null>(null);

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
        <button type="button" onClick={() => move(-1)} className="card h-11 w-11 rounded-full border border-slate-700 bg-slate-800 text-xl" aria-label="เดือนก่อน">‹</button>
        <h2 className="text-lg font-extrabold">{MONTH_TH[ym.m - 1]} {ym.y + 543}</h2>
        <button type="button" onClick={() => move(1)} className="card h-11 w-11 rounded-full border border-slate-700 bg-slate-800 text-xl" aria-label="เดือนถัดไป">›</button>
      </div>

      {/* คำอธิบาย */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-400">
        <span>บน = Benz</span><span>กลาง = Eaw</span>
        <span>💚 &gt;6ชม.</span><span>💛 2–6</span><span>🧡 &lt;2</span><span>❤️ ไม่ว่าง</span>
      </div>

      {error && <p className="text-center text-rose-400">{error}</p>}
      {!days && !error && <Spinner />}
      {days && (
        <div className="grid grid-cols-7 gap-1 fade-in"
          onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
          onTouchEnd={e => {
            if (touchX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            if (Math.abs(dx) > 60) move(dx < 0 ? 1 : -1);
          }}>
          {HEAD.map((h, i) => <div key={h} className={`pb-1 text-center text-xs font-semibold ${i >= 5 ? "text-rose-400" : "text-slate-400"}`}>{h}</div>)}
          {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} />)}
          {days.map(d => {
            const b = benzLabel(d), e = eawLabel(d, typeMap);
            const lc = LEVEL_COLOR[d.result.level];
            const isToday = d.date === t;
            return (
              <button key={d.date} type="button" onClick={() => openDay(d.date)}
                aria-label={`${shortDate(d.date)} Benz ${b.text} Eaw ${e.text}`}
                className={`card flex min-h-[86px] flex-col gap-1 rounded-xl border bg-slate-800 p-1 ${isToday ? "border-violet-500 ring-2 ring-violet-500/40" : "border-slate-700"}`}
                style={{ boxShadow: `inset 0 -3px 0 ${lc}` }}>
                <span className={`px-0.5 text-left text-xs font-bold ${isToday ? "text-violet-300" : ""}`}>{Number(d.date.slice(8))}</span>
                <span className="flex h-5 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-md text-[13px] leading-none" style={{ background: b.color + "33" }}>
                  <span aria-hidden>{b.icon}</span><span className="hidden truncate text-[11px] text-slate-200 md:inline">{b.text}</span>
                </span>
                <span className="flex h-5 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-md text-[13px] leading-none" style={{ background: e.color + "33" }}>
                  <span aria-hidden>{e.icon}</span><span className="hidden truncate text-[11px] text-slate-200 md:inline">{e.text}</span>
                </span>
                <span className="text-center text-sm leading-none">{LEVEL_ICON[d.result.level]}
                  <span className="hidden text-[11px] font-semibold md:inline"> {d.result.level === "incomplete" ? "" : durationTh(d.result.totalMinutes)}</span></span>
              </button>
            );
          })}
        </div>
      )}

      {sum && (
        <Card>
          <h3 className="mb-3 text-lg font-extrabold">📊 สรุปเดือนนี้</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Stat icon="💞" k="วันที่ว่างตรงกัน" v={sum.freeDays} unit="วัน" />
            <Stat icon="🌆" k="เย็นที่ว่างตรงกัน" v={sum.freeEvenings} unit="เย็น" />
            <Stat icon="🏖️" k="หยุดตรงกันทั้งวัน" v={sum.bothOffFullDay} unit="วัน" />
            <Stat icon="⏱️" k="Benz มี OT" v={sum.otDays} unit="วัน" />
          </dl>
          {sum.leaveDays > 0 && <p className="mt-2 text-sm text-slate-400">💗 Benz ลา (จาก QE Tracker) {sum.leaveDays} วัน</p>}

          <p className="mt-4 text-sm font-semibold text-slate-400">เวรของ Eaw</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-sm">
            {types.filter(x => !x.needs_confirm).map(x => (
              <span key={x.code} className="rounded-full px-2.5 py-1 font-semibold" style={{ background: x.color + "2e" }}>
                {x.icon} {x.label_th} <b>{sum.shiftCounts[x.code] ?? 0}</b>
              </span>
            ))}
          </div>

          <p className="mt-4 text-sm font-semibold text-slate-400">🏆 วันที่เหมาะนัดที่สุด</p>
          {sum.bestDays.length === 0 && <p className="text-sm">ยังไม่มีข้อมูลพอ</p>}
          <ol className="mt-1.5 flex flex-col gap-1.5">
            {sum.bestDays.map((d, i) => (
              <li key={d.date}>
                <button type="button" onClick={() => openDay(d.date)}
                  className="flex w-full items-center justify-between rounded-xl bg-slate-700/60 px-3 py-2.5 text-left">
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">{i + 1}</span>
                    {shortDate(d.date)}
                  </span>
                  <span className="font-semibold">{LEVEL_ICON[d.result.level]} {durationTh(d.result.totalMinutes)}</span>
                </button>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

function Stat({ icon, k, v, unit }: { icon: string; k: string; v: number; unit: string }) {
  return (
    <div className="rounded-xl bg-slate-700/60 p-3">
      <dt className="text-slate-400">{icon} {k}</dt>
      <dd className="text-2xl font-extrabold">{v} <span className="text-sm font-semibold text-slate-400">{unit}</span></dd>
    </div>
  );
}
