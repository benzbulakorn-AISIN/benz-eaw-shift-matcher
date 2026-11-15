// ============================================================
// Edge Function: daily-notify (ไฟล์เดียว — วางใน Supabase Editor ได้เลย)
// ส่ง LINE ตารางพรุ่งนี้ทุกวัน 19:00 (Asia/Bangkok) — กันซ้ำ + Retry + Log
// Secrets ที่ใช้: LINE_CHANNEL_ACCESS_TOKEN, CRON_SECRET
// ⚠️ ต้องปิด "Enforce JWT Verification" ของ Function นี้ (Cron ไม่มี JWT แต่ใช้ x-cron-secret แทน)
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

// ---------- Matching Engine (เหมือน src/lib/matching.ts) ----------
type Seg = { s: number; e: number };
type DayType =
  | "workday" | "saturday_workday" | "weekly_holiday"
  | "public_holiday" | "substitute_holiday" | "extra_holiday";
type MatchLevel = "green" | "yellow" | "orange" | "red" | "incomplete";

type BenzDay = {
  dayType: DayType | null;
  ot: { start: number; end: number | null } | null;
};
type EawDay = {
  code: string;
  segments: Seg[];
  isLeave: boolean;
  leaveIsFree: boolean | null;
} | null;

type Settings = {
  workStart: number;
  workEnd: number;
  workdayFocus: Seg;
  dayoffFocus: Seg;
  otUnknownEnd: number;
  leaveDefaultFree: boolean;
};

type MatchResult = {
  level: MatchLevel;
  windows: Seg[];
  totalMinutes: number;
  longest: Seg | null;
  focus: Seg | null;
  benzBusy: Seg[];
  eawBusy: Seg[];
  benzWorking: boolean;
  isApprox: boolean;
  hints: string[];
  missingReason: string | null;
};

const DEFAULT_SETTINGS: Settings = {
  workStart: 450, workEnd: 990,
  workdayFocus: { s: 990, e: 1440 }, dayoffFocus: { s: 480, e: 1440 },
  otUnknownEnd: 1200, leaveDefaultFree: true,
};

const WORKING: DayType[] = ["workday", "saturday_workday"];

const isValidSeg = (x: Seg) =>
  Number.isFinite(x.s) && Number.isFinite(x.e) && x.s >= 0 && x.e <= 1440 && x.s < x.e;

function timeToMin(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v <= 1440 ? v : null;
}

const minToTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function durationTh(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "0 นาที";
  const h = Math.floor(min / 60), m = min % 60;
  return [h ? `${h} ชม.` : "", m ? `${m} นาที` : ""].filter(Boolean).join(" ");
}

function union(segs: Seg[]): Seg[] {
  const sorted = segs.filter(isValidSeg).map(x => ({ ...x })).sort((a, b) => a.s - b.s);
  const out: Seg[] = [];
  for (const x of sorted) {
    const last = out[out.length - 1];
    if (last && x.s <= last.e) last.e = Math.max(last.e, x.e);
    else out.push(x);
  }
  return out;
}

function subtract(focus: Seg, busy: Seg[]): Seg[] {
  const out: Seg[] = [];
  let cur = focus.s;
  for (const b of union(busy)) {
    if (b.e <= cur || b.s >= focus.e) continue;
    if (b.s > cur) out.push({ s: cur, e: Math.min(b.s, focus.e) });
    cur = Math.max(cur, b.e);
    if (cur >= focus.e) break;
  }
  if (cur < focus.e) out.push({ s: cur, e: focus.e });
  return out;
}

function levelOf(total: number): MatchLevel {
  if (total > 360) return "green";
  if (total >= 120) return "yellow";
  if (total > 0) return "orange";
  return "red";
}

function benzBusy(b: BenzDay, st: Settings): { segs: Seg[]; working: boolean; approx: boolean } | null {
  if (!b.dayType) return null;
  const working = WORKING.includes(b.dayType);
  const approx = !!b.ot && b.ot.end === null;
  const otEnd = b.ot ? (b.ot.end ?? st.otUnknownEnd) : null;
  if (working) {
    const end = Math.max(st.workEnd, otEnd ?? st.workEnd);
    return { segs: [{ s: st.workStart, e: end }], working, approx };
  }
  if (b.ot) return { segs: [{ s: b.ot.start, e: otEnd! }], working, approx };
  return { segs: [], working, approx: false };
}

function eawBusy(e: EawDay, st: Settings): Seg[] | null {
  if (!e || e.code === "UNKNOWN") return null;
  if (e.isLeave) {
    const free = e.leaveIsFree ?? st.leaveDefaultFree;
    return free ? [] : [{ s: 0, e: 1440 }];
  }
  return e.segments;
}

const incomplete = (reason: string): MatchResult => ({
  level: "incomplete", windows: [], totalMinutes: 0, longest: null, focus: null,
  benzBusy: [], eawBusy: [], benzWorking: false, isApprox: false, hints: [], missingReason: reason,
});

function matchDay(benz: BenzDay, eaw: EawDay, nextEaw: EawDay | undefined, st: Settings = DEFAULT_SETTINGS): MatchResult {
  const b = benzBusy(benz, st);
  if (!b) return incomplete("ยังไม่มีปฏิทินบริษัทของวันนี้");
  const e = eawBusy(eaw, st);
  if (!e) return incomplete(eaw?.code === "UNKNOWN" ? "เวรของ Eaw รอยืนยัน" : "ยังไม่มีเวรของ Eaw");
  if (![...b.segs, ...e].every(isValidSeg)) return incomplete("เวลาไม่ถูกต้อง กรุณาตรวจสอบ");

  const focus = b.working ? st.workdayFocus : st.dayoffFocus;
  const windows = subtract(focus, [...b.segs, ...e]);
  const total = windows.reduce((s, w) => s + (w.e - w.s), 0);
  const longest = windows.reduce<Seg | null>((a, w) => (!a || w.e - w.s > a.e - a.s ? w : a), null);

  const hints: string[] = [];
  const nextStartsMidnight = !!nextEaw && !nextEaw.isLeave && nextEaw.segments.some(x => x.s === 0);
  if (nextStartsMidnight && windows.some(w => w.e === 1440)) hints.push("🌙 Eaw เข้าเวรต่อตอนเที่ยงคืน");
  if (b.approx) hints.push("⏱️ OT ยังไม่ระบุเวลาเลิก (คิดถึง 20:00)");

  return {
    level: levelOf(total), windows, totalMinutes: total, longest, focus,
    benzBusy: union(b.segs), eawBusy: union(e), benzWorking: b.working,
    isApprox: b.approx, hints, missingReason: null,
  };
}

function suggestion(r: MatchResult): string {
  if (r.level === "incomplete") return `❔ ${r.missingReason}`;
  if (r.totalMinutes === 0) return "📞 โทรหากันก่อนนอนนะ";
  const overlap = (a: number, b: number) =>
    r.windows.reduce((s, w) => s + Math.max(0, Math.min(w.e, b) - Math.max(w.s, a)), 0);
  if (!r.benzWorking && r.totalMinutes >= 480) return "🚗 ไปเที่ยวด้วยกันได้ทั้งวัน";
  if (overlap(1020, 1260) >= 120) return `🍽️ ทานข้าวเย็นด้วยกันได้ประมาณ ${durationTh(r.totalMinutes)}`;
  if (overlap(660, 840) >= 120) return "☕ นัดทานข้าวกลางวันได้";
  if (r.totalMinutes < 120) return "💬 มีเวลาสั้น ๆ คุยกันได้";
  return `💛 มีเวลาว่างด้วยกัน ${durationTh(r.totalMinutes)}`;
}

const LEVEL_ICON: Record<MatchLevel, string> =
  { green: "💚", yellow: "💛", orange: "🧡", red: "❤️", incomplete: "⚪" };
const LEVEL_COLOR: Record<MatchLevel, string> =
  { green: "#22C55E", yellow: "#EAB308", orange: "#F97316", red: "#EF4444", incomplete: "#64748B" };

function windowsText(r: MatchResult): string {
  if (r.level === "incomplete") return "ข้อมูลไม่ครบ";
  if (!r.windows.length) return "ไม่มีช่วงเวลาว่างตรงกัน";
  const t = r.windows.map(w => `${minToTime(w.s)}–${minToTime(w.e)}`).join(", ");
  return `ว่างตรงกัน ${t} น. รวม ${durationTh(r.totalMinutes)}${r.isApprox ? " (ประมาณ)" : ""}`;
}

// ---------- วันที่ Asia/Bangkok ----------
function todayBkk(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const MONTH_TH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
function thaiDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH_TH[m - 1]} ${y + 543}`;
}

// ---------- ส่ง LINE ----------
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const LINE_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";   // ← Supabase Secrets
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";                // ← Supabase Secrets
const RETRY_DELAY_MIN: Record<number, number> = { 1: 5, 2: 15, 3: 30 };

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

const HOLIDAY_TH: Record<string, string> = {
  weekly_holiday: "วันหยุดประจำสัปดาห์", public_holiday: "วันหยุดตามประเพณี",
  substitute_holiday: "วันหยุดชดเชย", extra_holiday: "วันหยุดพิเศษ",
};
const segText = (s: Seg[]) => s.map(x => `${minToTime(x.s)}–${minToTime(x.e)}`).join(", ");
function durationLong(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return [h ? `${h} ชั่วโมง` : "", m ? `${m} นาที` : ""].filter(Boolean).join(" ") || "0 นาที";
}

async function buildMessage(date: string): Promise<string> {
  const next = addDays(date, 1);
  const isTomorrow = date === addDays(todayBkk(), 1);
  const dayWord = isTomorrow ? "พรุ่งนี้" : "วันนี้";

  const { data: eawUser } = await sb.from("users").select("id").eq("role", "wannika").single();
  const [stR, calR, otR, shR, tyR] = await Promise.all([
    sb.from("app_settings").select("*").eq("id", 1).single(),
    sb.from("company_calendar").select("day_type").eq("calendar_date", date).maybeSingle(),
    sb.from("overtime").select("start_time, end_time").eq("work_date", date).maybeSingle(),
    sb.from("shifts").select("shift_date, shift_type, busy_segments, leave_is_free")
      .eq("user_id", eawUser?.id ?? "00000000-0000-0000-0000-000000000000").in("shift_date", [date, next]),
    sb.from("shift_types").select("code, label_th, is_leave"),
  ]);

  const s = stR.data;
  const fw = (s?.focus_windows ?? []) as { key: string; s: number; e: number }[];
  const pick = (k: string, d: Seg) => { const f = fw.find(x => x.key === k); return f ? { s: f.s, e: f.e } : d; };
  const st: Settings = s ? {
    workStart: timeToMin(s.work_start) ?? 450, workEnd: timeToMin(s.work_end) ?? 990,
    workdayFocus: pick(s.workday_focus_key ?? "after_work", DEFAULT_SETTINGS.workdayFocus),
    dayoffFocus: pick(s.dayoff_focus_key ?? "day_off", DEFAULT_SETTINGS.dayoffFocus),
    otUnknownEnd: timeToMin(s.ot_unknown_end) ?? 1200, leaveDefaultFree: s.leave_default_free ?? true,
  } : DEFAULT_SETTINGS;

  const types = new Map((tyR.data ?? []).map((t: any) => [t.code, t]));
  const eawOf = (d: string): EawDay => {
    const x: any = (shR.data ?? []).find((r: any) => r.shift_date === d);
    if (!x) return null;
    return { code: x.shift_type, segments: x.busy_segments ?? [], isLeave: !!types.get(x.shift_type)?.is_leave, leaveIsFree: x.leave_is_free };
  };

  const o: any = otR.data;
  const benz: BenzDay = {
    dayType: (calR.data?.day_type as DayType) ?? null,
    ot: o ? { start: timeToMin(o.start_time) ?? st.workEnd, end: timeToMin(o.end_time) } : null,
  };
  const eaw = eawOf(date);
  const r: MatchResult = matchDay(benz, eaw, eawOf(next) ?? undefined, st);

  const b: string[] = ["👨‍💼 Bulakorn"];
  if (!benz.dayType) b.push("❔ ยังไม่มีปฏิทินบริษัท");
  else if (WORKING.includes(benz.dayType)) {
    b.push(`ทำงาน ${minToTime(st.workStart)}–${minToTime(st.workEnd)} น.`);
    if (!benz.ot) b.push("OT: ไม่มี");
    else if (benz.ot.end === null) b.push(`OT: ไม่ระบุเวลาเลิก (คิดถึง ${minToTime(st.otUnknownEnd)} น.)`);
    else b.push(`OT ถึง ${minToTime(benz.ot.end)} น.`);
  } else {
    b.push(`🏖️ ${HOLIDAY_TH[benz.dayType] ?? "วันหยุด"}`);
    if (benz.ot) b.push(`มาทำงาน ${minToTime(benz.ot.start)}–${minToTime(benz.ot.end ?? st.otUnknownEnd)} น.${benz.ot.end === null ? " (ประมาณ)" : ""}`);
  }

  const w: string[] = ["🏥 Wannika"];
  if (!eaw) w.push("❔ ยังไม่มีเวร กรุณาอัปโหลด");
  else if (eaw.code === "UNKNOWN") w.push("⚠️ เวรรอยืนยัน");
  else if (eaw.isLeave) w.push(`💗 วันลา (${(eaw.leaveIsFree ?? st.leaveDefaultFree) ? "ว่าง" : "ไม่ว่าง"})`);
  else if (eaw.segments.length === 0) w.push("🏖️ วันหยุด");
  else {
    w.push(`${types.get(eaw.code)?.label_th ?? eaw.code} ${segText(eaw.segments)} น.`);
    if (eaw.segments.some(x => x.s === 0)) w.push(isTomorrow ? "(เริ่มเที่ยงคืนคืนนี้)" : `(เริ่ม 00:00 น. วันที่ ${thaiDate(date)})`);
  }

  const m: string[] = [];
  if (r.level === "incomplete") m.push("⚪ ข้อมูลไม่ครบ", r.missingReason ?? "");
  else if (r.level === "red") m.push(`❤️ สรุป: ${dayWord}ไม่มีช่วงเวลาว่างตรงกัน`);
  else {
    const eve = r.windows.reduce((a, x) => a + Math.max(0, Math.min(x.e, 1440) - Math.max(x.s, 990)), 0);
    const summary = !r.benzWorking && r.totalMinutes >= 480 ? `${dayWord}หยุดตรงกัน มีเวลาว่างเกือบทั้งวัน`
      : eve >= 120 ? `${dayWord}มีเวลาว่างช่วงเย็นตรงกัน`
      : r.totalMinutes >= 120 ? `${dayWord}มีเวลาว่างช่วงกลางวันตรงกัน`
      : `${dayWord}มีเวลาว่างตรงกันสั้น ๆ`;
    m.push(`${LEVEL_ICON[r.level]} ว่างตรงกัน`,
      `${segText(r.windows)} น. รวมประมาณ ${durationLong(r.totalMinutes)}${r.isApprox ? " (ประมาณ)" : ""}`,
      "", `⭐ สรุป: ${summary}`);
  }
  r.hints.filter(h => !h.startsWith("⏱️")).forEach(h => m.push(h));

  return [`📅 ตาราง${dayWord}: ${thaiDate(date)}`, "", ...b, "", ...w, "", ...m]
    .join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function resolveTargets(): Promise<{ key: string; to: string | null }[]> {
  const { data: s } = await sb.from("app_settings").select("line_target_type, line_group_id").eq("id", 1).single();
  if (s?.line_target_type === "personal") {
    const { data: us } = await sb.from("users").select("role, line_user_id, notification_enabled");
    return (us ?? []).filter((u: any) => u.notification_enabled).map((u: any) => ({ key: `personal:${u.role}`, to: u.line_user_id }));
  }
  return [{ key: "group", to: s?.line_group_id ?? null }];
}

async function push(to: string, text: string, retryKey: string) {
  return fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LINE_TOKEN}`, "X-Line-Retry-Key": retryKey },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
}

async function deliver(row: { id: string; target_date: string; line_target: string; attempt: number; retry_key: string }) {
  try {
    const to = (await resolveTargets()).find(t => t.key === row.line_target)?.to ?? null;
    if (!to) throw new Error("NO_LINE_TARGET");
    if (!LINE_TOKEN) throw new Error("MISSING_LINE_TOKEN");
    const message = await buildMessage(row.target_date);
    await sb.from("notification_logs").update({ message }).eq("id", row.id);
    const res = await push(to, message, row.retry_key);
    if (res.ok || res.status === 409) {
      await sb.from("notification_logs").update({ status: "sent", sent_at: new Date().toISOString(), next_retry_at: null, error_message: null }).eq("id", row.id);
      return { id: row.id, status: "sent" };
    }
    throw new Error(`LINE_HTTP_${res.status}`);
  } catch (e) {
    const err = (e instanceof Error ? e.message : "UNKNOWN").slice(0, 200);
    const delay = RETRY_DELAY_MIN[row.attempt];
    await sb.from("notification_logs").update({
      status: delay ? "retrying" : "failed",
      next_retry_at: delay ? new Date(Date.now() + delay * 60_000).toISOString() : null,
      error_message: err,
    }).eq("id", row.id);
    return { id: row.id, status: delay ? "retrying" : "failed", error: err };
  }
}

async function runDaily() {
  const today = todayBkk();
  const target = addDays(today, 1);
  const { data: s } = await sb.from("app_settings").select("notification_enabled").eq("id", 1).single();
  const out = [];
  for (const t of await resolveTargets()) {
    const base = { notification_date: today, target_date: target, line_target: t.key };
    if (!s?.notification_enabled) {
      await sb.from("notification_logs").upsert({ ...base, status: "skipped", error_message: "ปิดการแจ้งเตือน" },
        { onConflict: "target_date,line_target", ignoreDuplicates: true });
      out.push({ target: t.key, status: "skipped" });
      continue;
    }
    const { data: rows } = await sb.from("notification_logs").upsert(
      { ...base, status: "pending", attempt: 1, next_retry_at: new Date(Date.now() + 10 * 60_000).toISOString() },
      { onConflict: "target_date,line_target", ignoreDuplicates: true },
    ).select();
    if (!rows?.length) { out.push({ target: t.key, status: "duplicate" }); continue; }
    out.push(await deliver(rows[0]));
  }
  return out;
}

async function runRetry() {
  const { data: due, error } = await sb.rpc("claim_due_notifications");
  if (error) throw error;
  const out = [];
  for (const row of due ?? []) out.push(await deliver(row));
  return out;
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "UNAUTHORIZED" }, 401);
  const body = await req.json().catch(() => ({}));
  try {
    if (body.mode === "retry") return json(await runRetry());
    const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : addDays(todayBkk(), 1);
    if (body.mode === "preview") return json({ message: await buildMessage(date) });   // ดูข้อความ ไม่ส่ง
    if (body.mode === "test") {                                                       // ส่งทดสอบ ไม่บันทึก Log ไม่กันการส่งจริง 19:00
      const to = (await resolveTargets())[0]?.to;
      if (!to) return json({ error: "NO_LINE_TARGET" }, 400);
      const res = await push(to, "🧪 ทดสอบ\n\n" + await buildMessage(date), crypto.randomUUID());
      return json({ status: res.status });
    }
    return json(await runDaily());
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "FAILED" }, 500);
  }
});
