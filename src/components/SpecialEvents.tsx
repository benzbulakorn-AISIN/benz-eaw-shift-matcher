// 🎉 จัดการวันพิเศษ (ใช้ในหน้า ⚙️ ตั้งค่า)
// รายการ → แตะเพื่อแก้ / ➕ เพิ่ม  ·  หน้าแก้ไขมีปุ่มบันทึก 1 ปุ่ม (ลบเป็นลิงก์เล็กด้านล่าง)
import { useEffect, useState } from "react";
import { sb } from "../lib/supabase";
import { loadEvents, nextOccurrence, daysText, type SpecialEvent } from "../lib/special";
import { shortDate, todayBkk } from "../lib/dateBkk";
import { useApp, PrimaryButton, Spinner } from "./ui";

const ICONS: { icon: string; label: string }[] = [
  { icon: "🎂", label: "วันเกิด" }, { icon: "💍", label: "ครบรอบ" }, { icon: "🥂", label: "ปาร์ตี้" }, { icon: "💕", label: "เดท" },
  { icon: "✈️", label: "เที่ยว" }, { icon: "🏖️", label: "ทะเล" }, { icon: "🍽️", label: "ทานข้าว" }, { icon: "🎁", label: "ของขวัญ" },
  { icon: "🏥", label: "หาหมอ" }, { icon: "🎓", label: "รับปริญญา" }, { icon: "🙏", label: "ทำบุญ" }, { icon: "👨‍👩‍👧", label: "ครอบครัว" },
  { icon: "🏠", label: "บ้าน" }, { icon: "🚗", label: "รถ" }, { icon: "📌", label: "นัดหมาย" }, { icon: "🎉", label: "อื่น ๆ" },
];
const REMIND = [0, 1, 3, 7, 14, 30, 60];

type Draft = Omit<SpecialEvent, "id"> & { id?: string };
const blank = (): Draft => ({
  title: "", icon: "🎂", event_date: todayBkk(), yearly: true, show_years: true, remind_days: 7, note: "",
});

export default function SpecialEvents() {
  const { version, bump } = useApp();
  const [list, setList] = useState<SpecialEvent[] | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const today = todayBkk();

  useEffect(() => { loadEvents(true).then(setList).catch(() => setList([])); }, [version]);

  if (edit) return <EventForm draft={edit} onDone={changed => { setEdit(null); if (changed) bump(); }} />;
  if (!list) return <Spinner />;

  // เรียงตามครั้งถัดไป · นัดครั้งเดียวที่ผ่านไปแล้วแยกไว้ท้าย
  const rows = list.map(ev => ({ ev, next: nextOccurrence(ev, today) }));
  const active = rows.filter(r => r.next).sort((a, b) => a.next!.days - b.next!.days);
  const past = rows.filter(r => !r.next);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-400">แสดงในปฏิทิน และแจ้งใน LINE ตอน 19:00 ทุกวันช่วงก่อนถึงวัน</p>
      {active.length === 0 && <p className="rounded-xl bg-slate-700/50 px-3 py-4 text-center text-sm text-slate-400">🎈 ยังไม่มีวันพิเศษ</p>}
      <div className="flex flex-col gap-1.5">
        {active.map(({ ev, next }) => (
          <button key={ev.id} type="button" onClick={() => setEdit({ ...ev, note: ev.note ?? "" })}
            className="flex min-h-14 items-center gap-3 rounded-xl bg-slate-700/50 px-3 py-2 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-500/20 text-xl" aria-hidden>{ev.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{ev.title}{next!.years ? ` · ครบ ${next!.years} ปี` : ""}</span>
              <span className="block truncate text-xs text-slate-400">
                {shortDate(next!.date)} · {ev.yearly ? "ทุกปี" : "ครั้งเดียว"} · {ev.remind_days ? `🔔 ${ev.remind_days} วัน` : "🔕"}
              </span>
            </span>
            <span className={`shrink-0 text-sm font-bold ${next!.days <= ev.remind_days ? "text-pink-300" : "text-slate-400"}`}>{daysText(next!.days)}</span>
          </button>
        ))}
      </div>
      {past.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-400">นัดที่ผ่านไปแล้ว ({past.length})</summary>
          <div className="mt-1.5 flex flex-col gap-1">
            {past.map(({ ev }) => (
              <button key={ev.id} type="button" onClick={() => setEdit({ ...ev, note: ev.note ?? "" })}
                className="flex items-center gap-2 rounded-lg bg-slate-700/30 px-3 py-2 text-left opacity-70">
                {ev.icon} {ev.title} · {shortDate(ev.event_date)}
              </button>
            ))}
          </div>
        </details>
      )}
      <button type="button" onClick={() => setEdit(blank())}
        className="flex min-h-12 items-center justify-center rounded-xl border-2 border-dashed border-slate-600 font-bold text-slate-200">
        ➕ เพิ่มวันพิเศษ
      </button>
    </div>
  );
}

function EventForm({ draft, onDone }: { draft: Draft; onDone: (changed: boolean) => void }) {
  const { me, toast } = useApp();
  const [d, setD] = useState<Draft>(draft);
  const [custom, setCustom] = useState(!REMIND.includes(draft.remind_days));
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(p => ({ ...p, [k]: v }));

  const title = d.title.trim();
  const remindOk = Number.isInteger(d.remind_days) && d.remind_days >= 0 && d.remind_days <= 90;
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(d.event_date);
  const valid = title.length > 0 && dateOk && remindOk;

  async function save() {
    if (!valid) return;
    setSaving(true);
    const row = {
      title: title.slice(0, 40), icon: d.icon, event_date: d.event_date, yearly: d.yearly,
      show_years: d.yearly && d.show_years, remind_days: d.remind_days, note: d.note?.trim().slice(0, 100) || null,
    };
    const { error } = d.id
      ? await sb.from("special_events").update(row).eq("id", d.id)
      : await sb.from("special_events").insert({ ...row, created_by: me.id });
    setSaving(false);
    if (error) { toast("❌ บันทึกไม่สำเร็จ"); return; }
    await loadEvents(true);
    toast("บันทึกแล้ว ✅");
    onDone(true);
  }

  async function remove() {
    if (!d.id || !window.confirm(`ลบ "${d.title}" ?`)) return;
    const { error } = await sb.from("special_events").delete().eq("id", d.id);
    if (error) { toast("❌ ลบไม่สำเร็จ"); return; }
    await loadEvents(true);
    toast("🗑️ ลบแล้ว");
    onDone(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => onDone(false)} className="self-start font-semibold text-violet-300">‹ รายการวันพิเศษ</button>

      {/* ไอคอน */}
      <div>
        <p className="mb-1.5 text-sm font-semibold text-slate-400">ไอคอน</p>
        <div className="grid grid-cols-8 gap-1.5">
          {ICONS.map(x => (
            <button key={x.icon} type="button" onClick={() => set("icon", x.icon)} aria-label={x.label} aria-pressed={d.icon === x.icon}
              className={`flex aspect-square items-center justify-center rounded-xl text-xl ${d.icon === x.icon ? "bg-pink-500/30 ring-2 ring-pink-400" : "bg-slate-700/60"}`}>
              {x.icon}
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-slate-400">ชื่อ</span>
        <input value={d.title} maxLength={40} onChange={e => set("title", e.target.value)} placeholder="เช่น วันเกิด Eaw / After party ระยอง"
          className="min-h-12 rounded-xl bg-slate-700 px-3" />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-slate-400">{d.yearly ? "วันที่จริงครั้งแรก (เช่น วันเกิด/วันแต่งงาน)" : "วันที่นัด"}</span>
        <input type="date" value={d.event_date} onChange={e => set("event_date", e.target.value)} className="min-h-12 rounded-xl bg-slate-700 px-3" />
      </label>

      <div className="flex flex-col gap-2 rounded-xl bg-slate-700/40 p-3">
        <Switch label="🔁 ซ้ำทุกปี" on={d.yearly} onChange={v => set("yearly", v)} />
        {d.yearly && <Switch label="🔢 แสดง “ครบ N ปี”" on={d.show_years} onChange={v => set("show_years", v)} />}
      </div>

      {/* เตือนล่วงหน้า */}
      <div>
        <p className="mb-1.5 text-sm font-semibold text-slate-400">🔔 แจ้งใน LINE ทุกวัน 19:00 ล่วงหน้า</p>
        <div className="flex flex-wrap gap-1.5">
          {REMIND.map(n => (
            <button key={n} type="button" onClick={() => { setCustom(false); set("remind_days", n); }} aria-pressed={!custom && d.remind_days === n}
              className={`min-h-10 rounded-full px-3 text-sm font-semibold ${!custom && d.remind_days === n ? "bg-violet-600 text-white" : "bg-slate-700/60"}`}>
              {n === 0 ? "ไม่เตือน" : `${n} วัน`}
            </button>
          ))}
          <button type="button" onClick={() => setCustom(true)} aria-pressed={custom}
            className={`min-h-10 rounded-full px-3 text-sm font-semibold ${custom ? "bg-violet-600 text-white" : "bg-slate-700/60"}`}>กำหนดเอง</button>
        </div>
        {custom && (
          <label className="mt-2 flex items-center gap-2">
            <input type="number" inputMode="numeric" min={0} max={90} value={d.remind_days}
              onChange={e => set("remind_days", Math.max(0, Math.min(90, Math.trunc(Number(e.target.value) || 0))))}
              className="min-h-12 w-24 rounded-xl bg-slate-700 px-3 text-center" />
            <span className="text-sm">วันก่อนถึงวัน (สูงสุด 90)</span>
          </label>
        )}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-slate-400">📝 หมายเหตุ</span>
        <input value={d.note ?? ""} maxLength={100} onChange={e => set("note", e.target.value)} placeholder="เช่น จองร้านแล้ว / ซื้อของขวัญ"
          className="min-h-12 rounded-xl bg-slate-700 px-3" />
      </label>

      <PrimaryButton disabled={!valid || saving} onClick={save}>{saving ? "⏳ กำลังบันทึก..." : "💾 บันทึก"}</PrimaryButton>
      {d.id && <button type="button" onClick={remove} className="text-sm font-semibold text-rose-400">🗑️ ลบรายการนี้</button>}
    </div>
  );
}

function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3">
      <span className="font-semibold">{label}</span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-slate-600"}`}>
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-7" : "left-1"}`} />
      </button>
    </div>
  );
}
