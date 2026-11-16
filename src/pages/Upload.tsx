// 📤 อัปโหลดเวร (v3)
// - เลือกได้หลายรูปพร้อมกัน (1 เดือนมักใช้ 2 รูป) → อ่านทีละรูปต่อเนื่อง → รวมผลเป็นเดือนเดียว
// - เพิ่มรูปภายหลังได้ในหน้าตรวจผล (ค่าที่แก้ไว้แล้วไม่หาย)
// - ทั้ง Eaw และ Benz ใช้หน้าจอเดียวกัน — ข้อมูลบันทึกเป็นเวรของ Eaw เสมอ
import { useEffect, useMemo, useState } from "react";
import { sb } from "../lib/supabase";
import {
  uploadAndOcr, invokeOcr, diffShifts, recompute, finishImage, errorText, type DiffRow, type DraftDay,
} from "../lib/data";
import { MONTH_TH, MONTH_SHORT, monthRange, addDays, todayBkk } from "../lib/dateBkk";
import { useApp, Card, PrimaryButton, Spinner } from "../components/ui";
import ReviewGrid, { type ReviewCell } from "../components/ReviewGrid";

type Phase = "pick" | "busy" | "needMonth" | "review" | "done";
type Img = { importId: string; imagePath: string | null };
type Review = { images: Img[]; year: number; month: number; rows: DiffRow[]; warnings: string[] };
type LastImport = { month: number | null; year: number | null; user_id: string; imported_at: string | null; created_at: string };

const MAX_FILES = 4;
const MISSING = "ไม่พบวันนี้ในรูป";
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" });

// รวมผลหลายรูป: วันที่อ่านได้ชนะ "ไม่พบในรูป" · ถ้า 2 รูปอ่านชัดแต่ได้ค่าต่างกัน → ⚠️ ให้ตรวจ (ไม่เดา)
function mergeDays(list: DraftDay[][]): DraftDay[] {
  const out = new Map<string, DraftDay>();
  for (const days of list) for (const d of days) {
    const p = out.get(d.date);
    if (!p || (p.reason === MISSING && d.reason !== MISSING)) { out.set(d.date, { ...d }); continue; }
    if (d.reason === MISSING) continue;
    if (p.needs_review && !d.needs_review) { out.set(d.date, { ...d }); continue; }
    if (!p.needs_review && !d.needs_review && p.shift_type !== d.shift_type) {
      out.set(d.date, { ...p, needs_review: true, reason: `รูปอ่านไม่ตรงกัน (${p.raw_text || "?"} / ${d.raw_text || "?"})` });
    }
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export default function Upload() {
  const { me, types, typeMap, profiles, toast, bump, version } = useApp();
  const eawId = profiles.find(p => p.role === "wannika")?.id ?? "";
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

  // ทำต่อจากงานที่ค้าง (เช่น เน็ตหลุด) — รวมทุกรูปที่ค้างตรวจของคนนี้
  useEffect(() => {
    sb.from("schedule_imports").select("id, image_path, draft_payload")
      .eq("user_id", me.id).eq("kind", "shift").eq("import_status", "reviewing")
      .order("created_at", { ascending: true }).limit(MAX_FILES)
      .then(async ({ data }) => {
        const list = (data ?? []).filter(x => x.draft_payload?.days?.length);
        if (list.length) await openReview(list.map(x => ({ importId: x.id, imagePath: x.image_path })), list.map(x => x.draft_payload));
        else setPhase("pick");
      }, () => setPhase("pick"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function openReview(images: Img[], drafts: any[]) {
    const ok = drafts.filter(d => d?.month && d?.year && d?.days?.length);
    if (!ok.length) {
      setRv({ images, year: pickYm.y, month: pickYm.m, rows: [], warnings: drafts.flatMap(d => d?.warnings ?? []) });
      setPhase("needMonth");
      return;
    }
    const { month, year } = ok[0];
    const same = ok.filter(d => d.month === month && d.year === year);
    const warnings: string[] = [];
    if (same.length < ok.length) warnings.push(`⚠️ มี ${ok.length - same.length} รูปเป็นคนละเดือน ไม่ได้นำมารวม`);
    if (ok.length < drafts.length) warnings.push(`⚠️ มี ${drafts.length - ok.length} รูปอ่านเดือนไม่ได้ ไม่ได้นำมารวม`);
    const merged = mergeDays(same.map(d => d.days as DraftDay[]));
    const missing = merged.filter(d => d.reason === MISSING).length;
    if (missing) warnings.push(`ยังไม่พบในรูป ${missing} วัน → ➕ เพิ่มรูป หรือแตะเลือกเอง`);

    const [from, to] = monthRange(year, month);
    const { data: existing } = await sb.from("shifts").select("shift_date, shift_type")
      .eq("user_id", eawId).gte("shift_date", from).lte("shift_date", to);
    setRv({ images, year, month, rows: diffShifts(merged, existing ?? []), warnings });
    setPhase("review");
  }

  // อ่านทีละรูปต่อเนื่อง แล้วรวมผล (keep = ผลที่ตรวจไว้แล้ว ถ้ากด ➕ เพิ่มรูป)
  async function onFiles(list: FileList | null, keep: Review | null) {
    const files = list ? [...list].slice(0, MAX_FILES) : [];
    if (!files.length) return;
    if (!eawId) { setError("ไม่พบบัญชีของ Eaw"); return; }
    setError(""); setSelected(null); setPhase("busy");
    const images: Img[] = keep ? [...keep.images] : [];
    const drafts: any[] = keep
      ? [{ month: keep.month, year: keep.year, days: keep.rows.map(({ old: _o, kind: _k, ...d }) => d), warnings: [] }]
      : [];
    const errors: string[] = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const res = await uploadAndOcr(files[i], me.id, "shift", s => setStep(`รูป ${i + 1}/${files.length} · ${s}`));
        await sb.from("schedule_imports").update({ target_user_id: eawId }).eq("id", res.importId);
        const { data: row } = await sb.from("schedule_imports").select("image_path").eq("id", res.importId).single();
        images.push({ importId: res.importId, imagePath: row?.image_path ?? null });
        drafts.push(res.draft);
      } catch (e) {
        errors.push(`รูปที่ ${i + 1}: ${errorText(e)}`);
      }
    }
    if (errors.length) setError(errors.join(" · "));
    if (!images.length) { setPhase("pick"); return; }
    if (keep && drafts.length === 1) { setRv(keep); setPhase("review"); return; }
    await openReview(images, drafts);
  }

  async function retryWithMonth() {
    if (!rv) return;
    setPhase("busy");
    try {
      const drafts: any[] = [];
      for (let i = 0; i < rv.images.length; i++) {
        setStep(`รูป ${i + 1}/${rv.images.length} · กำลังอ่านอีกครั้ง...`);
        const img = rv.images[i];
        await sb.from("schedule_imports").update({ month: pickYm.m, year: pickYm.y, import_status: "ocr_done" }).eq("id", img.importId);
        drafts.push(await invokeOcr(img.importId));
      }
      await openReview(rv.images, drafts);
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
      const ids = rv.images.map(i => i.importId);
      // ใช้รูปแรกที่เป็นเดือนนี้เป็นตัวบันทึก แล้วปิดรูปอื่นเป็น saved
      const { data: imps } = await sb.from("schedule_imports").select("id, month, year, import_status").in("id", ids);
      let main = (imps ?? []).find(x => x.month === rv.month && x.year === rv.year && ["ocr_done", "reviewing"].includes(x.import_status));
      if (!main) {
        main = (imps ?? []).find(x => ["ocr_done", "reviewing"].includes(x.import_status));
        if (!main) throw new Error("IMPORT_NOT_FOUND");
        await sb.from("schedule_imports").update({ month: rv.month, year: rv.year }).eq("id", main.id);
      }
      const { error } = await sb.rpc("save_shift_import", { p_import_id: main.id, p_rows: rows, p_target_user: eawId });
      if (error) throw new Error(error.message);
      const others = ids.filter(id => id !== main!.id);
      if (others.length) await sb.from("schedule_imports")
        .update({ import_status: "saved", imported_at: new Date().toISOString(), draft_payload: null, target_user_id: eawId })
        .in("id", others);
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
    if (rv) for (const img of rv.images) await finishImage(img.importId, img.imagePath, keep).catch(() => undefined);
    toast(keep ? "🔒 เก็บรูปแบบส่วนตัวแล้ว" : "🗑️ ลบรูปแล้ว");
    setRv(null); setPhase("pick");
  }

  async function startOver() {
    if (rv) for (const img of rv.images) {
      if (img.imagePath) await sb.storage.from("private-images").remove([img.imagePath]).catch(() => undefined);
      await sb.from("schedule_imports").update({ import_status: "discarded", image_path: null, draft_payload: null }).eq("id", img.importId);
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
            <p className="mt-1 text-sm text-slate-400">เลือกได้หลายรูปพร้อมกัน (สูงสุด {MAX_FILES}) · 1 เดือนมักใช้ 2 รูป</p>
          </div>
          <label className="flex min-h-14 w-full cursor-pointer items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 text-lg font-bold text-white shadow-md">
            📷 เลือกรูปตารางเวร
            <input type="file" accept="image/*" multiple className="sr-only" onChange={e => { onFiles(e.target.files, null); e.target.value = ""; }} />
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
            <div className="flex items-center justify-between gap-2">
              <p className="text-lg font-extrabold">{MONTH_TH[rv.month - 1]} {rv.year + 543}</p>
              <span className="rounded-full bg-slate-700 px-2.5 py-0.5 text-xs font-bold">🖼️ {rv.images.length} รูป</span>
            </div>
            <p className="text-sm">🔄 เปลี่ยน {changed} วัน · {pending ? <span className="font-bold text-orange-300">⚠️ ต้องตรวจ {pending} วัน</span> : "✅ ตรวจครบแล้ว"}</p>
            {rv.warnings.map(w => <p key={w} className="text-sm text-amber-300">{w}</p>)}
            {changed === 0 && pending === 0 && <p className="mt-1 text-sm text-emerald-300">✅ ตารางตรงกับข้อมูลเดิมทั้งหมด</p>}
          </Card>
          <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-600 font-semibold text-slate-300">
            ➕ เพิ่มรูปของเดือนนี้
            <input type="file" accept="image/*" multiple className="sr-only" onChange={e => { onFiles(e.target.files, rv); e.target.value = ""; }} />
          </label>
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
          <p className="text-sm text-slate-400">รูปต้นฉบับ {rv?.images.length ?? 0} รูป จะทำอย่างไร</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => finish(false)} className="min-h-14 rounded-xl bg-violet-600 font-bold text-white">🗑️ ลบรูป</button>
            <button type="button" onClick={() => finish(true)} className="min-h-14 rounded-xl bg-slate-700 font-bold">🔒 เก็บรูป</button>
          </div>
        </Card>
      )}
    </div>
  );
}
