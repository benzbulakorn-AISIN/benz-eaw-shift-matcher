// 📋 วันอ้างอิงของเดือน (แสดงใต้ปฏิทิน) — วันหยุดราชการ + วันเงินเดือนออก
import { useRefDates, REF_ICON } from "../lib/reference";
import { shortDate, MONTH_TH } from "../lib/dateBkk";
import { useApp, Card } from "./ui";

export default function ReferenceMonth({ y, m }: { y: number; m: number }) {
  const { openDay } = useApp();
  const list = useRefDates(y);
  if (list === null) return null;
  const mm = String(m).padStart(2, "0");
  const items = list.filter(r => r.ref_date.slice(5, 7) === mm);

  return (
    <Card className="!p-3">
      <p className="mb-1.5 text-sm font-bold text-slate-400">📋 อ้างอิงเดือน{MONTH_TH[m - 1]}</p>
      {list.length === 0 ? (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-300">
          ⚠️ ยังไม่มีวันหยุดราชการ/วันเงินเดือนของปี {y + 543} · เพิ่มด้วย SQL แบบไฟล์ 014
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400">ไม่มีวันหยุดราชการเดือนนี้</p>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map(r => (
            <button key={`${r.kind}-${r.ref_date}`} type="button" onClick={() => openDay(r.ref_date)}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${r.kind === "payday" ? "bg-emerald-500/10" : "bg-sky-500/10"}`}>
              <span aria-hidden>{REF_ICON[r.kind]}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">
                {r.title}{!r.gov_off && r.kind === "gov_holiday" ? " (ราชการไม่หยุด)" : ""}
              </span>
              <span className="shrink-0 text-slate-400">{shortDate(r.ref_date)}</span>
            </button>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-slate-500">ใช้อ้างอิงวางแผนลาเท่านั้น ไม่ได้เปลี่ยนเวรหรือวันหยุดของ Eaw</p>
    </Card>
  );
}
