// หน้าต่างรายละเอียดวัน (v2)
// - Benz: แก้ OT ของตัวเอง + แก้เวรของ Eaw แทนได้
// - Eaw: แก้เวรของตัวเอง
// - หมายเหตุของใครของมัน · ปุ่มบันทึก 1 ปุ่ม (บันทึกทุกช่องพร้อมกัน)
import { useEffect, useMemo, useState } from "react";
import { sb } from "../lib/supabase";
import { loadDays, recompute, isWorking, settingsFromRow, loadSettingsRow, type DayInfo } from "../lib/data";
import { addDays, thaiDate } from "../lib/dateBkk";
import {
  matchDay, minToTime, union, LEVEL_ICON, LEVEL_COLOR, windowsText, suggestion,
  DEFAULT_SETTINGS, type Settings, type BenzDay,
} from "../lib/matching";
import { useApp, TimeBar, TimeScale, PrimaryButton, Spinner, benzLabel, Row, timeOptions, C } from "./ui";

type OtMode = "none" | "unknown" | "time";

export default function DaySheet({ date, onClose }: { date: string; onClose: () => void }) {
  const { me, profiles, types, typeMap, toast, version } = useApp();
  const eawId = profiles.find(p => p.role === "wannika")?.id ?? "";
  const isBenz = me.role === "bulakorn";

  const [day, setDay] = useState<DayInfo | null>(null);
  const [st, setSt] = useState<Settings>(DEFAULT_SETTINGS);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [otMode, setOtMode] = useState<OtMode>("none");
  const [otStart, setOtStart] = useState(990);
  const [otEnd, setOtEnd] = useState(1200);
  const [code, setCode] = useState("");
  const [leaveFree, setLeaveFree] = useState(true);
  const [note, setNote] = useState("");
  const [init, setInit] = useState("");

  useEffect(() => {
    Promise.all([loadDays(date, date, types, profiles), loadSettingsRow().catch(() => null)])
      .then(([[d], row]) => {
        setDay(d); setSt(settingsFromRow(row));
        const manualOt = d.ot && d.ot.note !== "QE:auto" ? d.ot : null;
        const mode: OtMode = !manualOt ? "none" : manualOt.end === null ? "unknown" : "time";
        const s0 = manualOt?.start ?? 990, e0 = manualOt?.end ?? 1200;
        const c0 = d.shift?.code ?? "";
        const lf0 = d.shift?.leaveIsFree ?? true;
        const n0 = d.notes.find(n => n.user_id === me.id)?.note ?? "";
        setOtMode(mode); setOtStart(s0); setOtEnd(e0); setCode(c0); setLeaveFree(lf0); setNote(n0);
        setInit(JSON.stringify([mode, s0, e0, c0, lf0, n0]));
      })
      .catch(() => setError("โหลดข้อมูลไม่ได้"));
  }, [date, version]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  const working = isWorking(day?.dayType ?? null);
  const qeDay = !!day?.qe;
  const otDirty = JSON.stringify([otMode, otStart, otEnd]) !== JSON.stringify(JSON.parse(init || "[]").slice(0, 3));
  const shiftDirty = JSON.stringify([code, leaveFree]) !== JSON.stringify(JSON.parse(init || "[]").slice(3, 5));
  const noteDirty = note !== (JSON.parse(init || "[]")[5] ?? "");
  const dirty = otDirty || shiftDirty || noteDirty;

  // ผลตัวอย่างสด (ก่อนบันทึก)
  const preview = useMemo(() => {
    if (!day) return null;
    let ot: BenzDay["ot"] = day.ot ? { start: day.ot.start, end: day.ot.end } : null;
    if (isBenz && !qeDay) ot = otMode === "none" ? null : { start: working ? st.workEnd : otStart, end: otMode === "unknown" ? null : otEnd };
    const t = typeMap.get(code);
    const eaw = t ? { code, segments: t.busy_segments, isLeave: t.is_leave, leaveIsFree: t.is_leave ? leaveFree : null } : null;
    return matchDay({ dayType: day.dayType, ot }, eaw, day.nextEaw ?? undefined, st);
  }, [day, otMode, otStart, otEnd, code, leaveFree, st, working, typeMap, isBenz, qeDay]);

  const otInvalid = otMode === "time" && (working ? otEnd <= st.workEnd : otEnd <= otStart);

  async function save() {
    if (!day || otInvalid || !dirty) return;
    setSaving(true);
    try {
      // 1) OT (เฉพาะ Benz, ไม่แตะวันที่มาจาก QE Tracker)
      if (isBenz && otDirty && !qeDay) {
        if (otMode === "none") {
          const { error } = await sb.from("overtime").delete().eq("user_id", me.id).eq("work_date", date);
          if (error) throw error;
        } else {
          const { error } = await sb.from("overtime").upsert({
            user_id: me.id, work_date: date, note: null,
            start_time: minToTime(working ? st.workEnd : otStart),
            end_time: otMode === "unknown" ? null : minToTime(otEnd),
          }, { onConflict: "user_id,work_date" });
          if (error) throw error;
        }
      }
      // 2) เวรของ Eaw (Eaw แก้เอง หรือ Benz แก้แทน)
      if (shiftDirty && code && eawId) {
        const t = typeMap.get(code)!;
        const segs = union(t.busy_segments);
        const { error } = await sb.from("shifts").upsert({
          user_id: eawId, shift_date: date, shift_type: code,
          start_time: segs.length ? minToTime(Math.min(...segs.map(x => x.s))) : null,
          end_time: segs.length ? minToTime(Math.max(...segs.map(x => x.e))) : null,
          crosses_midnight: false, busy_segments: t.busy_segments,
          leave_is_free: t.is_leave ? leaveFree : null,
          source: "manual", verified: true, ocr_confidence: null,
        }, { onConflict: "user_id,shift_date" });
        if (error) throw error;
      }
      // 3) หมายเหตุของฉัน
      if (noteDirty) {
        const trimmed = note.trim().slice(0, 100);
        if (trimmed) {
          const { error } = await sb.from("day_notes").upsert({ user_id: me.id, note_date: date, note: trimmed }, { onConflict: "user_id,note_date" });
          if (error) throw error;
        } else {
          await sb.from("day_notes").delete().eq("user_id", me.id).eq("note_date", date);
        }
      }
      await recompute(addDays(date, -1), date, types, profiles);
      toast(isBenz && shiftDirty ? "บันทึกแล้ว ✅ (แก้เวรแทน Eaw)" : "บันทึกแล้ว ✅");
      onClose();
    } catch (e) {
      const m = (e as { message?: string })?.message ?? "";
      toast(/row-level security/i.test(m) ? "🔒 ไม่มีสิทธิ์แก้เวรนี้ (รัน SQL 011)" : "❌ บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  const otherNotes = day?.notes.filter(n => n.user_id !== me.id) ?? [];
  const r = preview;

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`รายละเอียด ${thaiDate(date)}`} onClick={e => e.stopPropagation()}
        className="fade-in max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-slate-900 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-600" aria-hidden />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{thaiDate(date, true)}</h2>
          <button type="button" onClick={onClose} className="h-10 w-10 rounded-full bg-slate-800 text-lg" aria-label="ปิด">✕</button>
        </div>
        {error && <p className="text-rose-400">{error}</p>}
        {!day && !error && <Spinner />}
        {day && r && (
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl p-3" style={{ background: LEVEL_COLOR[r.level] + "1f" }}>
              <p className="text-lg font-extrabold" style={{ color: LEVEL_COLOR[r.level] }} aria-live="polite">
                {LEVEL_ICON[r.level]} {windowsText(r)}
              </p>
              <p className="text-sm font-semibold">{suggestion(r)}</p>
              {r.hints.map(h => <p key={h} className="text-sm font-semibold text-amber-300">{h}</p>)}
            </div>

            <div className="flex flex-col gap-1.5 rounded-2xl bg-slate-800 p-3">
              <TimeBar label="Benz" segs={r.benzBusy} color={C.work} />
              <TimeBar label="Eaw" segs={r.eawBusy} color={typeMap.get(code)?.color ?? C.none} />
              <TimeBar label="ว่างร่วม" segs={r.windows} color={C.free} />
              <TimeScale />
            </div>

            {!isBenz && <Row who="Benz" label={benzLabel(day)} />}
            {otherNotes.map((n, i) => <p key={i} className="text-sm text-slate-300">📝 {isBenz ? "Eaw" : "Benz"}: {n.note}</p>)}

            {/* ⏱️ OT ของ Benz */}
            {isBenz && (
              <fieldset className="flex flex-col gap-2 rounded-2xl bg-slate-800 p-3">
                <legend className="px-1 text-sm font-semibold text-slate-400">⏱️ Benz {day.dayType ? (working ? "(วันทำงาน)" : "(วันหยุด)") : ""}</legend>
                {!day.dayType && <p className="text-sm text-orange-300">❔ ยังไม่มีปฏิทินบริษัทของวันนี้</p>}
                {qeDay ? (
                  <p className="text-sm font-semibold text-pink-300">💗 {benzLabel(day).text} · แก้ได้ที่ QE Tracker</p>
                ) : (
                  <>
                    <select value={otMode} onChange={e => setOtMode(e.target.value as OtMode)} className="min-h-12 rounded-xl bg-slate-700 px-3">
                      <option value="none">ไม่มี OT</option>
                      <option value="time">มี OT (ระบุเวลา)</option>
                      <option value="unknown">มี OT ไม่รู้เวลาเลิก (คิด 20:00)</option>
                    </select>
                    {otMode !== "none" && !working && (
                      <label className="flex items-center gap-2">เริ่ม
                        <select value={otStart} onChange={e => setOtStart(Number(e.target.value))} className="min-h-12 flex-1 rounded-xl bg-slate-700 px-3">
                          {timeOptions(360, 1380).map(m => <option key={m} value={m}>{minToTime(m)}</option>)}
                        </select>
                      </label>
                    )}
                    {otMode === "time" && (
                      <label className="flex items-center gap-2">ถึง
                        <select value={otEnd} onChange={e => setOtEnd(Number(e.target.value))} className="min-h-12 flex-1 rounded-xl bg-slate-700 px-3">
                          {timeOptions(working ? 1020 : 390, 1440).map(m => <option key={m} value={m}>{minToTime(m)}</option>)}
                        </select>
                      </label>
                    )}
                    {otInvalid && <p role="alert" className="text-sm text-rose-400">เวลาเลิกต้องหลังเวลาเริ่ม</p>}
                  </>
                )}
              </fieldset>
            )}

            {/* 🏥 เวรของ Eaw (Benz แก้แทนได้) */}
            <fieldset className="flex flex-col gap-2 rounded-2xl bg-slate-800 p-3">
              <legend className="px-1 text-sm font-semibold text-slate-400">🏥 เวรของ Eaw{isBenz ? " · แก้แทน" : ""}</legend>
              <div className="grid grid-cols-2 gap-2">
                {types.filter(t => !t.needs_confirm).map(t => {
                  const on = code === t.code;
                  return (
                    <button key={t.code} type="button" onClick={() => setCode(t.code)} aria-pressed={on}
                      className={`flex min-h-12 items-center gap-2 rounded-xl border-2 px-3 text-left text-sm font-semibold ${on ? "" : "border-transparent bg-slate-700/60"}`}
                      style={on ? { borderColor: t.color, background: t.color + "2e" } : undefined}>
                      <span aria-hidden>{t.icon}</span><span className="truncate">{t.label_th}</span>
                    </button>
                  );
                })}
              </div>
              {typeMap.get(code)?.is_leave && (
                <label className="flex min-h-12 items-center justify-between">
                  <span>วันลานี้ว่างไหม</span>
                  <input type="checkbox" checked={leaveFree} onChange={e => setLeaveFree(e.target.checked)} className="h-6 w-6" />
                </label>
              )}
            </fieldset>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate-400">📝 หมายเหตุของฉัน</span>
              <input value={note} maxLength={100} onChange={e => setNote(e.target.value)} placeholder="เช่น นัดทานข้าว"
                className="min-h-12 rounded-xl border border-slate-700 bg-slate-800 px-3" />
            </label>

            <PrimaryButton disabled={!dirty || saving || otInvalid} onClick={save}>
              {saving ? "⏳ กำลังบันทึก..." : "💾 บันทึก"}
            </PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}
