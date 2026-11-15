// ============================================================
// Edge Function: ocr-import (ไฟล์เดียว — วางใน Supabase Editor ได้เลย)
// รับ importId → ดาวน์โหลดรูป Private → Gemini อ่าน → ตรวจซ้ำ → คืน "ผลร่าง" (ยังไม่บันทึกลง shifts)
// Secrets ที่ใช้: GEMINI_API_KEY, GEMINI_MODEL, APP_ORIGIN (ตั้งใน Edge Functions → Secrets)
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------- Gemini ----------
async function geminiJson<T>(imageB64: string, mime: string, prompt: string, schema: unknown): Promise<T> {
  const key = Deno.env.get("GEMINI_API_KEY");
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.8-flash";
  if (!key) throw new Error("MISSING_GEMINI_KEY");
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: mime, data: imageB64 } }, { text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: schema },
      }),
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt < 3) { await new Promise(r => setTimeout(r, 2000 * attempt)); continue; }
      throw new Error(res.status === 429 ? "GEMINI_QUOTA" : `GEMINI_HTTP_${res.status}`);
    }
    if (!res.ok) throw new Error(`GEMINI_HTTP_${res.status}`);
    const text = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("GEMINI_EMPTY");
    try { return JSON.parse(text) as T; } catch { throw new Error("GEMINI_BAD_JSON"); }
  }
  throw new Error("GEMINI_FAILED");
}

// ---------- ตรวจผลซ้ำ ----------
const pad = (n: number) => String(n).padStart(2, "0");
const normalize = (s: string) => s.toLowerCase().replace(/\s/g, "");
const stripEmoji = (s: string) => s.replace(/[^\p{L}\p{N}/]/gu, "");

function validateShiftDraft(
  ai: { month: number; year_be: number; days: { day: number; text: string; clear: boolean }[] },
  mappings: { normalized: string; shift_type_code: string }[],
  types: { code: string; needs_confirm: boolean }[],
  fallback: { month: number | null; year: number | null },
) {
  const warnings: string[] = [];
  const month = ai.month >= 1 && ai.month <= 12 ? ai.month : fallback.month;
  const yearAd = ai.year_be > 2400 ? ai.year_be - 543 : ai.year_be > 2000 ? ai.year_be : fallback.year;
  if (!month || !yearAd) return { month, year: yearAd, days: [], warnings: ["ไม่พบเดือน/ปี กรุณาเลือกเอง"] };

  const dim = new Date(Date.UTC(yearAd, month, 0)).getUTCDate();
  const mapMap = new Map(mappings.map(m => [m.normalized, m.shift_type_code]));
  const confirm = new Set(types.filter(t => t.needs_confirm).map(t => t.code));
  const out = new Map<string, any>();

  for (const d of ai.days ?? []) {
    if (!Number.isInteger(d.day) || d.day < 1 || d.day > dim) continue;
    const date = `${yearAd}-${pad(month)}-${pad(d.day)}`;
    if (out.has(date)) { const p = out.get(date); p.needs_review = true; p.reason = "พบวันที่ซ้ำในรูป"; continue; }
    const raw = stripEmoji(d.text ?? "").slice(0, 30);
    let code = raw ? mapMap.get(normalize(raw)) ?? "UNKNOWN" : "UNKNOWN";
    if (confirm.has(code)) code = "UNKNOWN";
    const reason = !raw ? "ช่องว่าง/อ่านไม่ได้" : code === "UNKNOWN" ? `ไม่รู้จักคำ "${raw}"` : !d.clear ? "AI ไม่มั่นใจ" : null;
    out.set(date, { date, raw_text: raw, shift_type: code, confidence: reason === null ? 0.95 : 0.5, needs_review: reason !== null, reason });
  }
  for (let i = 1; i <= dim; i++) {
    const date = `${yearAd}-${pad(month)}-${pad(i)}`;
    if (!out.has(date)) out.set(date, { date, raw_text: "", shift_type: "UNKNOWN", confidence: 0, needs_review: true, reason: "ไม่พบวันนี้ในรูป" });
  }
  const missing = [...out.values()].filter(d => d.reason === "ไม่พบวันนี้ในรูป").length;
  if (missing) warnings.push(`ไม่พบในรูป ${missing} วัน`);
  return { month, year: yearAd, days: [...out.values()].sort((a, b) => a.date.localeCompare(b.date)), warnings };
}

function validateCalendarDraft(ai: { year_be: number; months: { month: number; working_days_label: number; days: { day: number; day_type: string; clear: boolean }[] }[] }) {
  const TYPES = ["workday", "saturday_workday", "weekly_holiday", "public_holiday", "substitute_holiday", "extra_holiday"];
  const year = ai.year_be > 2400 ? ai.year_be - 543 : ai.year_be;
  if (!(year > 2000 && year < 2100)) throw new Error("GEMINI_EMPTY");
  const days: { date: string; day_type: string | null; needs_review: boolean; reason: string | null }[] = [];
  const monthFlags: { month: number; counted: number; label: number; ok: boolean }[] = [];
  for (let m = 1; m <= 12; m++) {
    const src = ai.months?.find(x => x.month === m);
    const dim = new Date(Date.UTC(year, m, 0)).getUTCDate();
    let counted = 0;
    for (let d = 1; d <= dim; d++) {
      const date = `${year}-${pad(m)}-${pad(d)}`;
      const dow = new Date(Date.UTC(year, m - 1, d)).getUTCDay();
      const a = src?.days?.find(x => x.day === d);
      let t = a && TYPES.includes(a.day_type) ? a.day_type : null;
      if (t === "workday" && dow === 6) t = "saturday_workday";
      let reason: string | null = !src ? "ไม่พบในรูป" : !a ? "ไม่พบวันนี้" : !t ? "ประเภทไม่ชัด" : !a.clear ? "AI ไม่มั่นใจ" : null;
      if (t === "weekly_holiday" && dow !== 0 && dow !== 6) reason = "วันหยุดประจำสัปดาห์ไม่ใช่ ส-อา";
      if (t === "workday" || t === "saturday_workday") counted++;
      days.push({ date, day_type: t, needs_review: reason !== null, reason });
    }
    const label = src?.working_days_label ?? -1;
    monthFlags.push({ month: m, counted, label, ok: counted === label });
  }
  const total = monthFlags.reduce((s, x) => s + x.counted, 0);
  return { year, days, monthFlags, total };
}

// ---------- Prompt + Schema ----------
const SHIFT_PROMPT = `อ่านเฉพาะแถวที่ขึ้นต้นด้วย "Eaw" ห้ามอ่านแถวอื่น
- month = เดือนที่แสดงหัวตาราง, year_be = ปี พ.ศ. ที่หัวตาราง (0 ถ้าไม่เห็น)
- days = ทุกวันของเดือนนั้นที่เห็นในรูป ไม่รวมวันของเดือนอื่น (ตัวเลขสีเทาจาง)
- text = คำในช่องแบบตรงตัว ไม่รวม emoji ห้ามแปลหรือแก้คำ
- clear = false ถ้าอ่านไม่ชัด ถูกตัด หรือไม่แน่ใจ ห้ามเดา`;
const SHIFT_SCHEMA = { type: "OBJECT", required: ["month", "year_be", "days"], properties: {
  month: { type: "INTEGER" }, year_be: { type: "INTEGER" },
  days: { type: "ARRAY", items: { type: "OBJECT", required: ["day", "text", "clear"], properties: {
    day: { type: "INTEGER" }, text: { type: "STRING" }, clear: { type: "BOOLEAN" } } } } } };

const CAL_PROMPT = `นี่คือปฏิทินบริษัท SIAM AISIN (อาจมีเพียง 6 เดือนในรูป)
year_be = ปี พ.ศ. ของปฏิทิน
สำหรับทุกวันที่เห็น ให้ระบุ day_type:
- weekly_holiday = ช่องพื้นแดง
- public_holiday = มีสัญลักษณ์สี่เหลี่ยมข้าวหลามตัดสีเหลือง
- substitute_holiday = มีวงกลมสีฟ้า
- extra_holiday = มีสามเหลี่ยมสีเขียว
- workday = ช่องพื้นเทาหรือขาว ไม่มีสัญลักษณ์
ช่องทแยงที่มี 2 วัน (เช่น 23/30) ให้ใส่ทั้ง 2 วัน
working_days_label = ตัวเลขในวงเล็บ [ ] ข้างชื่อเดือน (-1 ถ้าไม่เห็น)
clear = false ถ้าไม่แน่ใจ ห้ามเดา`;
const CAL_SCHEMA = { type: "OBJECT", required: ["year_be", "months"], properties: {
  year_be: { type: "INTEGER" },
  months: { type: "ARRAY", items: { type: "OBJECT", required: ["month", "working_days_label", "days"], properties: {
    month: { type: "INTEGER" }, working_days_label: { type: "INTEGER" },
    days: { type: "ARRAY", items: { type: "OBJECT", required: ["day", "day_type", "clear"], properties: {
      day: { type: "INTEGER" },
      day_type: { type: "STRING", enum: ["workday", "weekly_holiday", "public_holiday", "substitute_holiday", "extra_holiday"] },
      clear: { type: "BOOLEAN" } } } } } } } } };

// ---------- Handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: "UNAUTHORIZED" }, 401);

  let importId = "";
  try {
    ({ importId } = await req.json());
    const { data: imp } = await sb.from("schedule_imports").select("*").eq("id", importId).single();
    if (!imp || imp.user_id !== user.id || !imp.image_path) return json({ error: "NOT_FOUND" }, 404);

    const { data: file, error } = await sb.storage.from("private-images").download(imp.image_path);
    if (error || !file) throw new Error("DOWNLOAD_FAILED");
    const b64 = encodeBase64(new Uint8Array(await file.arrayBuffer()));
    const mime = file.type || "image/jpeg";

    let draft: Record<string, unknown>;
    if (imp.kind === "shift") {
      const ai = await geminiJson<any>(b64, mime, SHIFT_PROMPT, SHIFT_SCHEMA);
      const [{ data: maps }, { data: types }] = await Promise.all([
        sb.from("shift_code_mappings").select("normalized, shift_type_code"),
        sb.from("shift_types").select("code, needs_confirm"),
      ]);
      draft = validateShiftDraft(ai, maps ?? [], types ?? [], { month: imp.month, year: imp.year });
    } else {
      const ai = await geminiJson<any>(b64, mime, CAL_PROMPT, CAL_SCHEMA);
      draft = validateCalendarDraft(ai);
    }

    await sb.from("schedule_imports").update({
      import_status: "reviewing", draft_payload: draft,
      month: (draft.month as number) ?? imp.month, year: (draft.year as number) ?? imp.year,
    }).eq("id", importId);
    return json(draft);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OCR_FAILED";   // ไม่ Log ข้อความในรูป
    if (importId) await sb.from("schedule_imports").update({ import_status: "failed", error_message: msg }).eq("id", importId);
    return json({ error: msg }, 500);
  }
});
