// หน้าต่างรายละเอียดวัน: ดูเวลาทั้งสองคน + แก้ OT/เวรของตัวเอง + หมายเหตุ (ปุ่มบันทึก 1 ปุ่ม)
import { useEffect, useMemo, useState } from "react";
import { sb } from "../lib/supabase";
import { loadDays, recompute, isWorking, settingsFromRow, loadSettingsRow, type DayInfo } from "../lib/data";
import { addDays, thaiDate } from "../lib/dateBkk";
import {
  matchDay, minToTime, union, LEVEL_ICON, LEVEL_COLOR, windowsText, suggestion,
  DEFAULT_SETTINGS, type Settings, type BenzDay,
} from "../lib/matching";
import { useApp, Row, TimeBar, TimeScale, PrimaryButton, Spinner, benzLabel, eawLabel, timeOptions, C } from "./ui";

type OtMode = "none" | "unknown" | "time";

export default function DaySheet({ date, onClose }: { date: string; onClose: () => void }) {
  const { me, profiles, types, typeMap, toast, version } = useApp();
  const [day, setDay] = useState<DayInfo | null>(null);
  const [st, setSt] = useState<Settings>(DEFAULT_SETTINGS);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // ฟอร์ม
  const [otMode, setOtMode] = useState<OtMode>("none");
  const [otStart, setOtStart] = useState(990);
  const [otEnd, setOtEnd] = useState(1200);
  const [code, setCode] = useState("");
  const [leaveFree, setLeaveFree] = useState(true);
  const [note, setNote] = useState("");
  const [init, setInit] = useState("");

  const isBenz = me.role === "bulakorn";

  useEffect(() => {
    Promise.all([loadDays(date, date, types, profiles), loadSettingsRow().catch(() => null)])
      .then(([[d], row]) => {
        setDay(d); setSt(settingsFromRow(row));
        const mode: OtMode = !d.ot ? "none" : d.ot.end === null ? "unknown" : "time";
        const s0 = d.ot?.start ?? 990, e0 = d.ot?.end ?? 1200;
        const c0 = d.shift?.code ?? "";
        const lf0 = d.shift?.leaveIsFree ?? true;
        const n0 = d.notes.find(n => n.user_id === me.id)?.note ?? "";
        setOtMode(mode); setOtStart(s0); setOtEnd(e0); setCode(c0); setLeaveFree(lf0); setNote(n0);
        setInit(JSON.stringify([mode, s0, e0, c0, lf0, n0]));
      })
      .catch(() => setError("โหลดข้อมูลไม่ได้"));
    // โหลดใหม่เมื่อเปลี่ยนวัน หรืออีกคนบันทึก (version)
  }, [date, version]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const working = isWorking(day?.dayType ?? null);
  const dirty = JSON.stringify([otMode, otStart, otEnd, code, leaveFree, note]) !== init;

  // ผลตัวอย่างสด (ก่อนบันทึก)
  const preview = useMemo(() => {
    if (!day) return null;
    const ot = otMode === "none" ? null : { start: working ? st.workEnd : otStart, end: otMode === "unknown" ? null : otEnd };
    const benz: BenzDay = { dayType: day.dayType, ot };
    const t = typeMap.get(code);
    const eaw = t ? { code, segments: t.busy_segments, isLeave: t.is_leave, leaveIsFree: t.is_leave ? leaveFree : null } : null;
    return matchDay(benz, isBenz ? (day.shift ? { code: day.shift.code, segments: day.shift.segments, isLeave: !!typeMap.get(day.shift.code)?.is_leave, leaveIsFree: day.shift.leaveIsFree } : null) : eaw,
      day.nextEaw ?? undefined, st);
  }, [day, otMode, otStart, otEnd, code, leaveFree, st, working, typeMap, isBenz]);

  const otInvalid = otMode === "time" && (working ? otEnd <= st.workEnd : otEnd <= otStart);

  async function save() {
    if (!day || otInvalid) return;
    setSaving(true);
    try {
      if (isBenz) {
        if (otMode === "none") {
          const { error } = await sb.from("overtime").delete().eq("user_id", me.id).eq("work_date", date);
          if (error) throw error;
        } else {
          const { error } = await sb.from("overtime").upsert({
            user_id: me.id, work_date: date,
            start_time: minToTime(working ? st.workEnd : otStart),
            end_time: otMode === "unknown" ? null : minToTime(otEnd),
          }, { onConflict: "user_id,work_date" });
          if (error) throw error;
        }
      } else if (code) {
        const t = typeMap.get(code)!;
        const segs = union(t.busy_segments);
        const { error } = await sb.from("shifts").upsert({
          user_id: me.id, shift_date: date, shift_type: code,
          start_time: segs.length ? minToTime(Math.min(...segs.map(x => x.s))) : null,
          end_time: segs.length ? minToTime(Math.max(...segs.map(x => x.e))) : null,
          crosses_midnight: false, busy_segments: t.busy_segments,
          leave_is_free: t.is_leave ? leaveFree : null,
          source: "manual", verified: true, ocr_confidence: null,
        }, { onConflict: "user_id,shift_date" });
        if (error) throw error;
      }
      const trimmed = note.trim().slice(0, 100);
      if (trimmed) {
        const { error } = await sb.from("day_notes").upsert({ user_id: me.id, note_date: date, note: trimmed }, { onConflict: "user_id,note_date" });
        if (error) throw error;
      } else {
        await sb.from("day_notes").delete().eq("user_id", me.id).eq("note_date", date);
      }
      await recompute(addDays(date, -1), date, types, profiles);
      toast("บันทึกแล้ว ✅");
      onClose();
    } catch {
      toast("❌ บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  const otherNotes = day?.notes.filter(n => n.user_id !== me.id) ?? [];
  const r = preview;

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`รายละเอียด ${thaiDate(date)}`} onClick={e => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-slate-900 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{thaiDate(date, true)}</h2>
          <button type="button" onClick={onClose} className="h-12 w-12 rounded-xl bg-slate-800 text-xl" aria-label="ปิด">✕</button>
        </div>
        {error && <p className="text-rose-400">{error}</p>}
        {!day && !error && <Spinner />}
        {day && r && (
          <div className="flex flex-col gap-3">
            <p className="text-lg font-bold" style={{ color: LEVEL_COLOR[r.level] }} aria-live="polite">
              {LEVEL_ICON[r.level]} {windowsText(r)}
            </p>
            <p className="text-sm">{suggestion(r)}</p>
            {r.hints.map(h => <p key={h} className="text-sm text-amber-300">{h}</p>)}

            <div className="flex flex-col gap-1 rounded-xl bg-slate-800 p-3">
              <TimeBar label="Benz" segs={r.benzBusy} color={C.work} />
              <TimeBar label="Eaw" segs={r.eawBusy} color={typeMap.get(isBenz ? day.shift?.code ?? "" : code)?.color ?? C.none} />
              <TimeBar label="ว่างร่วม" segs={r.windows} color={C.free} />
              <TimeScale />
            </div>

            {isBenz ? <Row who="Eaw" label={eawLabel(day, typeMap)} /> : <Row who="Benz" label={benzLabel(day)} />}
            {otherNotes.map((n, i) => <p key={i} className="text-sm text-slate-300">📝 {isBenz ? "Eaw" : "Benz"}: {n.note}</p>)}

            {isBenz && (
              <fieldset className="flex flex-col gap-2 rounded-xl bg-slate-800 p-3">
                <legend className="px-1 text-sm text-slate-400">⏱️ OT ของ Benz {day.dayType ? (working ? "(วันทำงาน)" : "(วันหยุด)") : ""}</legend>
                {!day.dayType && <p className="text-sm text-orange-300">❔ ยังไม่มีปฏิทินบริษัทของวันนี้</p>}
                <select value={otMode} onChange={e => setOtMode(e.target.value as OtMode)} className="min-h-12 rounded-lg bg-slate-700 px-3">
                  <option value="none">ไม่มี OT</option>
                  <option value="time">มี OT (ระบุเวลา)</option>
                  <option value="unknown">มี OT ไม่รู้เวลาเลิก (คิด 20:00)</option>
                </select>
                {otMode !== "none" && !working && (
                  <label className="flex items-center gap-2">เริ่ม
                    <select value={otStart} onChange={e => setOtStart(Number(e.target.value))} className="min-h-12 flex-1 rounded-lg bg-slate-700 px-3">
                      {timeOptions(360, 1380).map(m => <option key={m} value={m}>{minToTime(m)}</option>)}
                    </select>
                  </label>
                )}
                {otMode === "time" && (
                  <label className="flex items-center gap-2">ถึง
                    <select value={otEnd} onChange={e => setOtEnd(Number(e.target.value))} className="min-h-12 flex-1 rounded-lg bg-slate-700 px-3">
                      {timeOptions(working ? 1020 : 390, 1440).map(m => <option key={m} value={m}>{minToTime(m)}</option>)}
                    </select>
                  </label>
                )}
                {otInvalid && <p role="alert" className="text-sm text-rose-400">เวลาเลิกต้องหลังเวลาเริ่ม</p>}
              </fieldset>
            )}

            {!isBenz && (
              <fieldset className="flex flex-col gap-2 rounded-xl bg-slate-800 p-3">
                <legend className="px-1 text-sm text-slate-400">🏥 เวรของ Eaw</legend>
                <select value={code} onChange={e => setCode(e.target.value)} className="min-h-12 rounded-lg bg-slate-700 px-3">
                  {!code && <option value="">— เลือกเวร —</option>}
                  {types.filter(t => !t.needs_confirm).map(t => <option key={t.code} value={t.code}>{t.icon} {t.label_th}</option>)}
                </select>
                {typeMap.get(code)?.is_leave && (
                  <label className="flex min-h-12 items-center justify-between">
                    <span>วันลานี้ว่างไหม</span>
                    <input type="checkbox" checked={leaveFree} onChange={e => setLeaveFree(e.target.checked)} className="h-6 w-6" />
                  </label>
                )}
              </fieldset>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-400">📝 หมายเหตุของฉัน</span>
              <input value={note} maxLength={100} onChange={e => setNote(e.target.value)} placeholder="เช่น นัดทานข้าว"
                className="min-h-12 rounded-xl bg-slate-800 px-3" />
            </label>

            <PrimaryButton disabled={!dirty || saving || otInvalid || (!isBenz && !code)} onClick={save}>
              {saving ? "⏳ กำลังบันทึก..." : "💾 บันทึก"}
            </PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}
