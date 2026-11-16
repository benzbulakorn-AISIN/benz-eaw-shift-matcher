// 📤 อัปโหลดเวร (v2): ทั้ง Eaw และ Benz ใช้หน้าจอเดียวกัน — ข้อมูลบันทึกเป็นเวรของ Eaw เสมอ
// เลือกรูป → อ่าน → ตรวจเฉพาะวันที่เปลี่ยน → ✅ ตรวจสอบและบันทึก → ลบ/เก็บรูป
import { useEffect, useMemo, useState } from "react";
import { sb } from "../lib/supabase";
import {
  uploadAndOcr, invokeOcr, diffShifts, recompute, finishImage, errorText, type DiffRow, type DraftDay,
} from "../lib/data";
import { MONTH_TH, MONTH_SHORT, monthRange, addDays, todayBkk } from "../lib/dateBkk";
import { useApp, Card, PrimaryButton, Spinner } from "../components/ui";
import ReviewGrid, { type ReviewCell } from "../components/ReviewGrid";

type Phase = "pick" | "busy" | "needMonth" | "review" | "done";
type Review = { importId: string; imagePath: string | null; year: number; month: number; rows: DiffRow[]; warnings: string[] };
type LastImport = { month: number | null; year: number | null; user_id: string; imported_at: string | null; created_at: string };

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" });

export default function Upload() {
  const { me, types, typeMap, profiles, toast, bump, version } = useApp();
  const eaw = profiles.find(p => p.role === "wannika");
  const eawId = eaw?.id ?? "";
  const isProxy = me.role === "bulakorn";
  const nameOf = (id: string) => (profiles.find(p => p.id === id)?.role === "bulakorn" ? "Benz" : "Eaw");

  const [phase, setPhase] = useState<Phase>("busy");
  const [step, setStep] = useState("กำลังตรวจงานค้าง...");
  const [error, setError] = useState("");
  const [rv, setRv] = useState<Review | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [last, setLast] = useState<LastImport | null | undefined>(undefined);
  const t = todayBkk();
  const [pickYm, setPickYm] = useState({ y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)) });

  // อัปโหลดล่าสุด (ของใครก็ได้)
  useEffect(() => {
    sb.from("schedule_imports").select("month, year, user_id, imported_at, created_at")
      .eq("kind", "shift").eq("import_status", "saved")
      .order("imported_at", { ascending: false, nullsFirst: false }).limit(1)
      .then(({ data }) => setLast((data?.[0] as LastImport) ?? null), () => setLast(null));
  }, [version]);

  // ทำต่อจากงานที่ค้างของคนที่ล็อกอินอยู่ (เช่น เน็ตหลุด)
  useEffect(() => {
    sb.from("schedule_imports").select("id, image_path, draft_payload, month, year")
      .eq("user_id", me.id).eq("kind", "shift").eq("import_status", "reviewing")
      .order("created_at", { ascending: false }).limit(1)
      .then(async ({ data }) => {
        const imp = data?.[0];
        if (imp?.draft_payload?.days?.length) await openReview(imp.id, imp.image_path, imp.draft_payload);
        else setPhase("pick");
      }, () => setPhase("pick"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function openReview(importId: string, imagePath: string | null, draft: any) {
    if (!draft?.month || !draft?.year || !draft?.days?.length) {
      setRv({ importId, imagePath, year: pickYm.y, month: pickYm.m, rows: [], warnings: draft?.warnings ?? [] });
      setPhase("needMonth");
      return;
    }
    const [from, to] = monthRange(draft.year, draft.month);
    const { data: existing } = await sb.from("shifts").select("shift_date, shift_type")
      .eq("user_id", eawId).gte("shift_date", from).lte("shift_date", to);
    setRv({ importId, imagePath, year: draft.year, month: draft.month,
      rows: diffShifts(draft.days as DraftDay[], existing ?? []), warnings: draft.warnings ?? [] });
    setPhase("review");
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!eawId) { setError("ไม่พบบัญชีของ Eaw"); return; }
    setError(""); setPhase("busy");
    try {
      const res = await uploadAndOcr(file, me.id, "shift", setStep);
      await sb.from("schedule_imports").update({ target_user_id: eawId }).eq("id", res.importId);
      const { data: row } = await sb.from("schedule_imports").select("image_path").eq("id", res.importId).single();
      await openReview(res.importId, row?.image_path ?? null, res.draft);
    } catch (e) {
      setError(errorText(e)); setPhase("pick");
    }
  }

  async function retryWithMonth() {
    if (!rv) return;
    setPhase("busy"); setStep("กำลังอ่านตารางอีกครั้ง...");
    try {
      await sb.from("schedule_imports").update({ month: pickYm.m, year: pickYm.y, import_status: "ocr_done" }).eq("id", rv.importId);
      const draft = await invokeOcr(rv.importId);
      await openReview(rv.importId, rv.imagePath, draft);
    } catch (e) {
      setError(errorText(e)); setPhase("needMonth");
    }
  }

  function pick(date: string, value: string) {
    setRv(prev => prev && ({
      ...prev,
      rows: prev.rows.map(r => r.date !== date ? r : {
        ...r, shift_type: value, needs_review: false, reason: null, confidence: 1,
        kind: r.old === null ? "new" : r.old === value ? "same" : "changed",
      }),
    }));
  }

  const pending = rv?.rows.filter(r => r.needs_review || r.shift_type === "UNKNOWN").length ?? 0;
  const changed = rv?.rows.filter(r => r.kind !== "same").length ?? 0;

  const cells = useMemo(() => {
    const m = new Map<string, ReviewCell>();
    rv?.rows.forEach(r => {
      const tt = typeMap.get(r.shift_type);
      const old = r.old ? typeMap.get(r.old) : null;
      m.set(r.date, {
        date: r.date, icon: tt?.icon ?? "❔", label: tt?.label_th ?? r.raw_text ?? "ไม่ทราบ",
        color: tt?.color ?? "#64748B",
        state: r.needs_review || r.shift_type === "UNKNOWN" ? "review" : r.kind,
        oldIcon: old?.icon, reason: r.reason,
      });
    });
    return m;
  }, [rv, typeMap]);

  async function save() {
    if (!rv || pending) return;
    setPhase("busy"); setStep("กำลังบันทึก...");
    try {
      const rows = rv.rows.map(r => ({ date: r.date, shift_type: r.shift_type, confidence: r.confidence, raw_text: r.raw_text }));
      const { error } = await sb.rpc("save_shift_import", { p_import_id: rv.importId, p_rows: rows, p_target_user: eawId });
      if (error) throw new Error(error.message);
      const [from, to] = monthRange(rv.year, rv.month);
      await recompute(addDays(from, -1), to, types, profiles);
      bump();
      setPhase("done");
    } catch (e) {
      const m = (e as Error).message;
      setError(/NOT_ALLOWED|INVALID_TARGET|row-level security/i.test(m) ? "🔒 ยังไม่มีสิทธิ์อัปโหลดแทน (รัน SQL 011 ก่อน)" : errorText(e));
      setPhase("review");
    }
  }

  async function finish(keep: boolean) {
    if (rv) await finishImage(rv.importId, rv.imagePath, keep).catch(() => undefined);
    toast(keep ? "🔒 เก็บรูปแบบส่วนตัวแล้ว" : "🗑️ ลบรูปแล้ว");
    setRv(null); setPhase("pick");
  }

  async function startOver() {
    if (rv) {
      if (rv.imagePath) await sb.storage.from("private-images").remove([rv.imagePath]).catch(() => undefined);
      await sb.from("schedule_imports").update({ import_status: "discarded", image_path: null, draft_payload: null }).eq("id", rv.importId);
    }
    setRv(null); setError(""); setPhase("pick");
  }

  return (
    <div className="flex flex-col gap-3">
      {isProxy && (
        <div className="flex items-center gap-2 rounded-2xl border border-violet-500/50 bg-violet-600/15 px-4 py-2.5 text-sm font-semibold text-violet-200">
          <span aria-hidden>📤</span> อัปโหลดแทน Eaw · บันทึกเป็นเวรของ Eaw
        </div>
      )}

      {error && <p role="alert" className="rounded-2xl bg-rose-500/15 px-4 py-3 font-semibold text-rose-300">{error}</p>}

      {phase === "busy" && <Spinner text={step} />}

      {phase === "pick" && (
        <Card className="flex flex-col items-center gap-4 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-600/20 text-3xl" aria-hidden>📷</span>
          <div>
            <p className="text-lg font-extrabold">อัปโหลดตารางเวรของ Eaw</p>
            <p className="mt-1 text-sm text-slate-400">แคปหน้าจอแอปตารางเวรให้เห็นหัวเดือนและแถว Eaw ครบทั้งเดือน</p>
          </div>
          <label className="flex min-h-14 w-full cursor-pointer items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-lg font-bold text-white shadow-md">
            📷 เลือกรูปตารางเวร
            <input type="file" accept="image/*" className="sr-only" onChange={e => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <p className="text-sm text-slate-400">
            {last === undefined ? "…"
              : last ? <>🕐 อัปโหลดล่าสุด: <b className="text-slate-200">{last.month ? `${MONTH_SHORT[last.month - 1]} ${(last.year ?? 0) + 543}` : "—"}</b> โดย <b className="text-slate-200">{nameOf(last.user_id)}</b> · {fmtDay(last.imported_at ?? last.created_at)}</>
              : "ยังไม่เคยอัปโหลด"}
          </p>
        </Card>
      )}

      {phase === "needMonth" && rv && (
        <Card className="flex flex-col gap-3">
          <p className="font-bold">❔ ไม่พบเดือน/ปีในรูป กรุณาเลือก</p>
          <div className="flex gap-2">
            <select value={pickYm.m} onChange={e => setPickYm(p => ({ ...p, m: Number(e.target.value) }))} className="min-h-12 flex-1 rounded-lg bg-slate-700 px-3">
              {MONTH_TH.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
            </select>
            <select value={pickYm.y} onChange={e => setPickYm(p => ({ ...p, y: Number(e.target.value) }))} className="min-h-12 rounded-lg bg-slate-700 px-3">
              {[0, 1].map(k => { const y = Number(t.slice(0, 4)) + k; return <option key={y} value={y}>{y + 543}</option>; })}
            </select>
          </div>
          <PrimaryButton onClick={retryWithMonth}>🔄 อ่านอีกครั้ง</PrimaryButton>
          <button type="button" onClick={startOver} className="text-sm text-slate-400 underline">เริ่มใหม่</button>
        </Card>
      )}

      {phase === "review" && rv && (
        <>
          <Card>
            <p className="text-lg font-extrabold">{MONTH_TH[rv.month - 1]} {rv.year + 543}</p>
            <p className="text-sm">🔄 เปลี่ยน {changed} วัน · {pending ? <span className="font-bold text-orange-300">⚠️ ต้องตรวจ {pending} วัน</span> : "✅ ตรวจครบแล้ว"}</p>
            {rv.warnings.map(w => <p key={w} className="text-sm text-amber-300">{w}</p>)}
            {changed === 0 && pending === 0 && <p className="mt-1 text-sm text-emerald-300">✅ ตารางตรงกับข้อมูลเดิมทั้งหมด</p>}
          </Card>
          <ReviewGrid year={rv.year} month={rv.month} cells={cells} selected={selected} onSelect={setSelected}
            options={types.filter(x => !x.needs_confirm).map(x => ({ value: x.code, icon: x.icon, label: x.label_th }))}
            onPick={pick} />
          <PrimaryButton disabled={pending > 0} onClick={save}>
            {pending ? `เหลือต้องตรวจ ${pending} วัน` : "✅ ตรวจสอบและบันทึก"}
          </PrimaryButton>
          <button type="button" onClick={startOver} className="text-sm text-slate-400 underline">ยกเลิกและเริ่มใหม่</button>
        </>
      )}

      {phase === "done" && (
        <Card className="flex flex-col gap-3 text-center">
          <p className="text-lg font-extrabold">✅ บันทึกเวรของ Eaw แล้ว</p>
          <p className="text-sm text-slate-400">รูปต้นฉบับจะทำอย่างไร</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => finish(false)} className="min-h-14 rounded-xl bg-violet-600 font-bold text-white">🗑️ ลบรูป</button>
            <button type="button" onClick={() => finish(true)} className="min-h-14 rounded-xl bg-slate-700 font-bold">🔒 เก็บรูป</button>
          </div>
        </Card>
      )}
    </div>
  );
}
