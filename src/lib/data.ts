// โหลดข้อมูล / คำนวณ Matching / สรุปเดือน / เปรียบเทียบ OCR / เตรียมรูป  (v2)
import { sb } from "./supabase";
import {
  matchDay, timeToMin, minToTime, DEFAULT_SETTINGS, WORKING,
  type Settings, type EawDay, type BenzDay, type MatchResult, type DayType, type Seg,
} from "./matching";
import { addDays } from "./dateBkk";

export type Role = "bulakorn" | "wannika";
export type Profile = { id: string; display_name: string; role: Role };
export type ShiftType = {
  code: string; label_th: string; label_en: string; icon: string; color: string;
  busy_segments: Seg[]; is_leave: boolean; needs_confirm: boolean; sort_order: number;
};
export type DayInfo = {
  date: string;
  dayType: DayType | null;
  ot: { start: number; end: number | null; note: string | null } | null;
  shift: { code: string; segments: Seg[]; leaveIsFree: boolean | null; note: string | null } | null;
  nextEaw: EawDay;
  notes: { user_id: string; note: string }[];
  result: MatchResult;
};

// ---------- ข้อมูลพื้นฐาน ----------
export async function loadProfiles(): Promise<Profile[]> {
  const { data, error } = await sb.from("users").select("id, display_name, role");
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function loadShiftTypes(): Promise<ShiftType[]> {
  const { data, error } = await sb.from("shift_types").select("*").order("sort_order");
  if (error) throw error;
  return (data ?? []) as ShiftType[];
}

export async function loadSettingsRow() {
  const { data, error } = await sb.from("app_settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return data;
}

export function settingsFromRow(row: any): Settings {
  if (!row) return DEFAULT_SETTINGS;
  const fw = (row.focus_windows ?? []) as { key: string; s: number; e: number }[];
  const pick = (k: string, d: Seg) => {
    const f = fw.find(x => x.key === k);
    return f ? { s: f.s, e: f.e } : d;
  };
  return {
    workStart: timeToMin(row.work_start) ?? 450,
    workEnd: timeToMin(row.work_end) ?? 990,
    workdayFocus: pick(row.workday_focus_key ?? "after_work", DEFAULT_SETTINGS.workdayFocus),
    dayoffFocus: pick(row.dayoff_focus_key ?? "day_off", DEFAULT_SETTINGS.dayoffFocus),
    otUnknownEnd: timeToMin(row.ot_unknown_end) ?? 1200,
    leaveDefaultFree: row.leave_default_free ?? true,
  };
}

// ---------- โหลดช่วงวันที่ + คำนวณ ----------
export async function loadDays(from: string, to: string, types: ShiftType[], profiles: Profile[]): Promise<DayInfo[]> {
  const eawId = profiles.find(p => p.role === "wannika")?.id ?? "";
  const until = addDays(to, 1);
  const [row, cal, ot, sh, notes] = await Promise.all([
    loadSettingsRow().catch(() => null),
    sb.from("company_calendar").select("calendar_date, day_type").gte("calendar_date", from).lte("calendar_date", to),
    sb.from("overtime").select("work_date, start_time, end_time, note").gte("work_date", from).lte("work_date", to),
    sb.from("shifts").select("shift_date, shift_type, busy_segments, leave_is_free, note")
      .eq("user_id", eawId).gte("shift_date", from).lte("shift_date", until),
    sb.from("day_notes").select("note_date, user_id, note").gte("note_date", from).lte("note_date", to),
  ]);
  for (const r of [cal, ot, sh]) if (r.error) throw r.error;

  const st = settingsFromRow(row);
  const leave = new Set(types.filter(t => t.is_leave).map(t => t.code));
  const calMap = new Map((cal.data ?? []).map((c: any) => [c.calendar_date, c.day_type as DayType]));
  const otMap = new Map((ot.data ?? []).map((o: any) => [o.work_date, o]));
  const shMap = new Map((sh.data ?? []).map((s: any) => [s.shift_date, s]));
  const noteRows = (notes.error ? [] : notes.data ?? []) as { note_date: string; user_id: string; note: string }[];

  const eawOf = (d: string): EawDay => {
    const s: any = shMap.get(d);
    return s ? { code: s.shift_type, segments: s.busy_segments ?? [], isLeave: leave.has(s.shift_type), leaveIsFree: s.leave_is_free } : null;
  };

  const out: DayInfo[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const o: any = otMap.get(d);
    const s: any = shMap.get(d);
    const benz: BenzDay = {
      dayType: calMap.get(d) ?? null,
      ot: o ? { start: timeToMin(o.start_time) ?? st.workEnd, end: timeToMin(o.end_time) } : null,
    };
    const nextEaw = eawOf(addDays(d, 1));
    out.push({
      date: d,
      dayType: benz.dayType,
      ot: o ? { start: benz.ot!.start, end: benz.ot!.end, note: o.note ?? null } : null,
      shift: s ? { code: s.shift_type, segments: s.busy_segments ?? [], leaveIsFree: s.leave_is_free, note: s.note ?? null } : null,
      nextEaw,
      notes: noteRows.filter(n => n.note_date === d).map(n => ({ user_id: n.user_id, note: n.note })),
      result: matchDay(benz, eawOf(d), nextEaw ?? undefined, st),
    });
  }
  return out;
}

export async function saveMatches(days: DayInfo[]) {
  if (!days.length) return;
  const rows = days.map(({ date, result: r }) => ({
    match_date: date,
    common_free_start: r.longest ? minToTime(r.longest.s) : null,
    common_free_end: r.longest ? minToTime(r.longest.e) : null,
    common_free_minutes: r.totalMinutes,
    free_windows: r.windows,
    focus_start: r.focus?.s ?? null,
    focus_end: r.focus?.e ?? null,
    match_level: r.level,
    missing_reason: r.missingReason,
    is_approx: r.isApprox,
    hints: r.hints,
    calculated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from("match_results").upsert(rows.slice(i, i + 200), { onConflict: "match_date" });
    if (error) throw error;
  }
}

export async function recompute(from: string, to: string, types: ShiftType[], profiles: Profile[]) {
  const days = await loadDays(from, to, types, profiles);
  await saveMatches(days);
  return days;
}

// ---------- สรุปรายเดือน ----------
export function monthlySummary(days: DayInfo[]) {
  const evening = (r: MatchResult) =>
    r.windows.reduce((s, w) => s + Math.max(0, Math.min(w.e, 1440) - Math.max(w.s, 990)), 0);
  const shiftCounts: Record<string, number> = {};
  days.forEach(d => { if (d.shift) shiftCounts[d.shift.code] = (shiftCounts[d.shift.code] ?? 0) + 1; });
  return {
    freeDays: days.filter(d => d.result.totalMinutes > 0).length,
    freeEvenings: days.filter(d => evening(d.result) >= 120).length,
    bothOffFullDay: days.filter(d => d.result.level !== "incomplete" && !d.result.benzWorking
      && d.result.benzBusy.length === 0 && d.result.eawBusy.length === 0).length,
    otDays: days.filter(d => d.ot).length,
    shiftCounts,
    bestDays: days.filter(d => d.result.totalMinutes > 0)
      .sort((a, b) => b.result.totalMinutes - a.result.totalMinutes || a.date.localeCompare(b.date))
      .slice(0, 5),
  };
}

export const isWorking = (t: DayType | null) => !!t && WORKING.includes(t);

// ---------- OCR draft + Diff ----------
export type DraftDay = {
  date: string; raw_text: string; shift_type: string; confidence: number;
  needs_review: boolean; reason: string | null;
};
export type DiffRow = DraftDay & { old: string | null; kind: "new" | "changed" | "same" };

export function diffShifts(draft: DraftDay[], existing: { shift_date: string; shift_type: string }[]): DiffRow[] {
  const old = new Map(existing.map(e => [e.shift_date, e.shift_type]));
  return draft.map(d => {
    const prev = old.get(d.date) ?? null;
    // วันที่ไม่อยู่ในรูป แต่มีข้อมูลเดิม → คงค่าเดิมไว้ (ไม่เดา)
    if (d.reason === "ไม่พบวันนี้ในรูป" && prev) {
      return { ...d, shift_type: prev, needs_review: false, reason: null, old: prev, kind: "same" as const };
    }
    const kind = prev === null ? "new" : prev === d.shift_type ? "same" : "changed";
    return { ...d, old: prev, kind };
  });
}

// ---------- รูปภาพ ----------
export async function sha256Hex(file: Blob): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function resizeImage(file: File, maxSide = 2000): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("RESIZE_FAILED"))), "image/jpeg", 0.9));
}

export async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    if (!navigator.onLine) await new Promise(r => window.addEventListener("online", r, { once: true }));
    try { return await fn(); }
    catch (e) { if (i >= tries) throw e; await new Promise(r => setTimeout(r, 1500 * i)); }
  }
}

// อัปโหลดรูป + สร้าง schedule_imports + เรียก OCR
export async function uploadAndOcr(
  file: File, uid: string, kind: "shift" | "company_calendar",
  onStep: (msg: string) => void,
): Promise<{ importId: string; draft: any }> {
  onStep("กำลังเตรียมรูป...");
  const hash = await sha256Hex(file);
  const { data: dup } = await sb.from("schedule_imports").select("id, created_at")
    .eq("user_id", uid).eq("image_hash", hash).not("import_status", "in", "(failed,discarded)").limit(1);
  if (dup && dup.length) throw new Error(`DUPLICATE:${dup[0].created_at}`);

  const blob = await resizeImage(file);
  const path = `${uid}/${kind === "shift" ? "shifts" : "calendar"}/${hash}.jpg`;
  onStep("กำลังอัปโหลด...");
  await withRetry(async () => {
    const { error } = await sb.storage.from("private-images").upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (error && !/exist|duplicate/i.test(error.message)) throw error;
  });

  const { data: imp, error: impErr } = await sb.from("schedule_imports")
    .insert({ user_id: uid, kind, image_path: path, image_hash: hash, import_status: "uploaded" })
    .select("id").single();
  if (impErr) throw new Error(impErr.code === "23505" ? "DUPLICATE:" : impErr.message);

  onStep("กำลังอ่านตาราง... (ประมาณ 30–90 วินาที)");
  let draft: any;
  try {
    draft = await invokeOcr(imp.id);
  } catch (e) {
    // ปลดล็อกรูปนี้ เพื่อให้เลือกรูปเดิมลองใหม่ได้
    await sb.from("schedule_imports")
      .update({ import_status: "failed", error_message: String((e as Error).message ?? "").slice(0, 100) })
      .eq("id", imp.id).in("import_status", ["uploaded", "ocr_done"]);
    throw e;
  }
  return { importId: imp.id, draft };
}

export async function invokeOcr(importId: string) {
  // ไม่เรียกซ้ำอัตโนมัติ (การอ่านรูปใช้เวลานาน) + ตัดการรอที่ 140 วินาที เพื่อไม่ให้หน้าจอค้าง
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("OCR_TIMEOUT")), 140_000));
  const { data, error } = await Promise.race([sb.functions.invoke("ocr-import", { body: { importId } }), timeout]);
  if (error) {
    let code = "OCR_FAILED";
    try { code = (await (error as any).context?.json())?.error ?? code; } catch { /* ignore */ }
    if ((error as any).context?.status === 546) code = "OCR_TIMEOUT";
    throw new Error(code);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function finishImage(importId: string, path: string | null, keep: boolean) {
  if (!keep && path) {
    await sb.storage.from("private-images").remove([path]);
    await sb.from("schedule_imports").update({ image_path: null, image_kept: false }).eq("id", importId);
  } else {
    await sb.from("schedule_imports").update({ image_kept: true }).eq("id", importId);
  }
}

export function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (msg.startsWith("DUPLICATE")) return "📷 รูปนี้นำเข้าแล้ว";
  if (msg === "OCR_TIMEOUT") return "⏱️ อ่านรูปนานเกินไป ลองครอปให้เห็นเฉพาะตาราง แล้วลองใหม่";
  if (msg === "GEMINI_QUOTA") return "⏳ ระบบอ่านรูปไม่ว่าง ลองใหม่ใน 1 นาที";
  if (msg === "MISSING_GEMINI_KEY") return "⚙️ ยังไม่ได้ตั้งค่าระบบอ่านรูป";
  if (/^GEMINI_HTTP_4/.test(msg)) return "⚙️ ตั้งค่าระบบอ่านรูปไม่ถูกต้อง (ตรวจ GEMINI_MODEL)";
  if (["GEMINI_BAD_JSON", "GEMINI_EMPTY", "NO_TEXT"].includes(msg)) return "📷 อ่านรูปไม่ได้ ลองแคปใหม่ให้เห็นตารางเต็มจอ";
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return "📶 อินเทอร์เน็ตขัดข้อง ลองใหม่อีกครั้ง";
  if (/UNCONFIRMED_DAY/.test(msg)) return "⚠️ ยังมีวันที่ต้องตรวจ";
  return "ระบบขัดข้อง ลองใหม่ภายหลัง";
}
