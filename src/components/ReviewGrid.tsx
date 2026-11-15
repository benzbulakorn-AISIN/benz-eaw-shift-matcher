// ปฏิทินตรวจผล OCR (ใช้ทั้งตารางเวรและปฏิทิน SA) — แตะวันเพื่อเลือกค่าใหม่
import { dowOf, daysInMonth, isoOf } from "../lib/dateBkk";

export type ReviewCell = {
  date: string;
  icon: string;
  label: string;
  color: string;
  state: "same" | "changed" | "new" | "review";
  oldIcon?: string;
  reason?: string | null;
};
export type Option = { value: string; icon: string; label: string };

const HEAD = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

export default function ReviewGrid({ year, month, cells, selected, onSelect, options, onPick }: {
  year: number; month: number; cells: Map<string, ReviewCell>;
  selected: string | null; onSelect: (d: string | null) => void;
  options: Option[]; onPick: (date: string, value: string) => void;
}) {
  const first = isoOf(year, month, 1);
  const lead = (dowOf(first) + 6) % 7;
  const n = daysInMonth(year, month);
  const sel = selected ? cells.get(selected) : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-1">
        {HEAD.map(h => <div key={h} className="text-center text-xs text-slate-400">{h}</div>)}
        {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} />)}
        {Array.from({ length: n }).map((_, i) => {
          const date = isoOf(year, month, i + 1);
          const c = cells.get(date);
          const review = c?.state === "review";
          const dim = c?.state === "same";
          return (
            <button key={date} type="button" onClick={() => onSelect(selected === date ? null : date)}
              aria-label={`วันที่ ${i + 1} ${c?.label ?? "ไม่มีข้อมูล"}${review ? " ต้องตรวจ" : ""}`}
              className={`flex min-h-16 flex-col items-center justify-center rounded-lg border-2 p-0.5 text-xs
                ${review ? "review-pulse border-dashed border-orange-400 bg-orange-500/10" : c?.state === "changed" || c?.state === "new" ? "border-violet-400" : "border-transparent"}
                ${selected === date ? "ring-2 ring-white" : ""} ${dim ? "opacity-50" : ""}`}
              style={{ background: review ? undefined : (c?.color ?? "#334155") + "33" }}>
              <span className="font-bold">{i + 1}</span>
              <span className="text-base" aria-hidden>{review ? "⚠️" : c?.icon ?? "❔"}</span>
              {c?.state === "changed" && c.oldIcon && <span className="text-[10px]" aria-hidden>{c.oldIcon}→</span>}
              {review && <span className="text-[10px] font-bold text-orange-300">ตรวจ</span>}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="rounded-xl bg-slate-800 p-3" aria-live="polite">
          <p className="mb-2 text-sm">
            วันที่ {Number(selected.slice(8))} · {sel?.reason ? <span className="text-orange-300">⚠️ {sel.reason}</span> : sel?.label}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {options.map(o => (
              <button key={o.value} type="button" onClick={() => { onPick(selected, o.value); onSelect(null); }}
                className="min-h-12 rounded-lg bg-slate-700 px-2 text-sm">{o.icon} {o.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
