// ⚙️ ตั้งค่า (v3) — แบบ iOS Settings
// หน้าแรก: กลุ่ม + แถว (ไอคอนพื้นสี · ชื่อ · สถานะด้านขวา · ›)  →  แตะแถวเพื่อเข้าหน้าย่อย (มีปุ่ม ‹ กลับ)
// แต่ละหน้าย่อยมีปุ่มบันทึกไม่เกิน 1 ปุ่ม
import { useEffect, useMemo, useState } from "react";
import { sb } from "../lib/supabase";
import { loadSettingsRow, recompute, uploadAndOcr, finishImage, errorText } from "../lib/data";
import { MONTH_SHORT, MONTH_TH, daysInMonth, isoOf, shortDate, todayBkk } from "../lib/dateBkk";
import { minToTime } from "../lib/matching";
import { useApp, PrimaryButton, Spinner, DAY_TYPE_LABEL, timeOptions } from "../components/ui";
import ReviewGrid, { type ReviewCell } from "../components/ReviewGrid";
import ChangePasscode from "../components/ChangePasscode";
import { loadAnniversary } from "../lib/special";

type Key = "line" | "focus" | "anniversary" | "calendar" | "mapping" | "history" | "passcode" | "backup";
type Status = Partial<Record<Key, { text: string; tone?: "ok" | "warn" | "muted" }>>;

const PAGES: Record<Key, { icon: string; color: string; title: string }> = {
  line: { icon: "🔔", color: "#22C55E", title: "แจ้งเตือน LINE" },
  focus: { icon: "⏰", color: "#F97316", title: "เวลาที่สนใจ" },
  anniversary: { icon: "💍", color: "#EC4899", title: "วันครบรอบแต่งงาน" },
  calendar: { icon: "🗓️", color: "#EF4444", title: "ปฏิทิน SA" },
  mapping: { icon: "🔤", color: "#3B82F6", title: "คำเรียกเวร" },
  history: { icon: "📜", color: "#64748B", title: "ประวัติ" },
  passcode: { icon: "🔑", color: "#EAB308", title: "เปลี่ยนรหัส 6 หลัก" },
  backup: { icon: "💾", color: "#8B5CF6", title: "สำรองข้อมูล" },
};
const GROUPS: { title: string; keys: Key[] }[] = [
  { title: "การแจ้งเตือน", keys: ["line", "focus", "anniversary"] },
  { title: "ข้อมูลตาราง", keys: ["calendar", "mapping", "history"] },
  { title: "บัญชี", keys: ["passcode", "backup"] },
];

export default function Settings() {
  const { me, version } = useApp();
  const [open, setOpen] = useState<Key | null>(null);
  const [status, setStatus] = useState<Status>({});

  // สถานะด้านขวาของแต่ละแถว
  useEffect(() => {
    if (open) return;
    (async () => {
      const s: Status = {};
      const row = await loadSettingsRow().catch(() => null);
      if (row) {
        s.line = !row.line_group_id ? { text: "ยังไม่เชื่อม", tone: "warn" }
          : row.notification_enabled ? { text: "✅ 19:00", tone: "ok" } : { text: "ปิดอยู่", tone: "muted" };
        const fw = (row.focus_windows ?? []) as { key: string; s: number; e: number }[];
        const w = fw.find(x => x.key === (row.workday_focus_key ?? "after_work"));
        if (w) s.focus = { text: `${minToTime(w.s)}–${minToTime(w.e)}` };
        s.anniversary = row.anniversary_date
          ? { text: shortDate(row.anniversary_date).replace(/^\S+\.\s/, "") } : { text: "ยังไม่ตั้ง", tone: "muted" };
      }
      const y = Number(todayBkk().slice(0, 4));
      const { count } = await sb.from("company_calendar").select("calendar_date", { count: "exact", head: true }).eq("source_year", y);
      s.calendar = count ? { text: `${y + 543} ✅`, tone: "ok" } : { text: `${y + 543} ยังไม่มี`, tone: "warn" };
      const { count: mc } = await sb.from("shift_code_mappings").select("id", { count: "exact", head: true });
      s.mapping = { text: `${mc ?? 0} คำ`, tone: "muted" };
      const { data: last } = await sb.from("notification_logs").select("status").order("created_at", { ascending: false }).limit(1);
      s.history = last?.[0]?.status === "failed" ? { text: "⚠️ ส่งไม่สำเร็จ", tone: "warn" } : { text: "", tone: "muted" };
      setStatus(s);
    })().catch(() => undefined);
  }, [open, version]);

  if (open) {
    const p = PAGES[open];
    return (
      <div className="fade-in flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setOpen(null)} className="flex min-h-11 items-center gap-1 rounded-full pr-3 font-semibold text-violet-300">
            <span className="text-2xl leading-none" aria-hidden>‹</span> ตั้งค่า
          </button>
        </div>
        <h2 className="flex items-center gap-3 px-1 text-xl font-extrabold">
          <IconBox icon={p.icon} color={p.color} /> {p.title}
        </h2>
        <section className="card rounded-2xl border border-slate-700 bg-slate-800 p-4">
          {open === "line" && <LineSection />}
          {open === "focus" && <FocusSection />}
          {open === "anniversary" && <AnniversarySection />}
          {open === "calendar" && <CalendarSection />}
          {open === "mapping" && <MappingSection />}
          {open === "history" && <HistorySection />}
          {open === "passcode" && <ChangePasscode />}
          {open === "backup" && <BackupSection />}
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* โปรไฟล์ */}
      <div className="card flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-800 p-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-3xl" aria-hidden>
          {me.role === "bulakorn" ? "👨‍💼" : "👩‍⚕️"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold">{me.display_name}</p>
          <p className="text-sm text-slate-400">{me.role === "bulakorn" ? "Benz · แก้ OT และเวรแทน Eaw ได้" : "Eaw · อัปโหลดและแก้เวร"}</p>
        </div>
      </div>

      {GROUPS.map(g => (
        <div key={g.title}>
          <p className="mb-1.5 px-4 text-xs font-bold uppercase tracking-wide text-slate-400">{g.title}</p>
          <div className="card overflow-hidden rounded-2xl border border-slate-700 bg-slate-800">
            {g.keys.map((k, i) => {
              const p = PAGES[k], st = status[k];
              return (
                <button key={k} type="button" onClick={() => setOpen(k)}
                  className={`flex min-h-14 w-full items-center gap-3 px-4 text-left ${i > 0 ? "border-t border-slate-700" : ""}`}>
                  <IconBox icon={p.icon} color={p.color} />
                  <span className="flex-1 truncate font-semibold">{p.title}</span>
                  {st?.text && (
                    <span className={`shrink-0 text-sm ${st.tone === "ok" ? "text-emerald-300" : st.tone === "warn" ? "text-orange-300" : "text-slate-400"}`}>{st.text}</span>
                  )}
                  <span className="text-xl text-slate-500" aria-hidden>›</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="card overflow-hidden rounded-2xl border border-slate-700 bg-slate-800">
        <button type="button" onClick={() => sb.auth.signOut()} className="flex min-h-14 w-full items-center justify-center font-bold text-rose-400">
          🚪 ออกจากระบบ
        </button>
      </div>
      <p className="text-center text-xs text-slate-500">ลา/อบรมของ Benz ซิงก์จาก QE Tracker อัตโนมัติทุกวัน 18:50</p>
    </div>
  );
}

function IconBox({ icon, color }: { icon: string; color: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base" style={{ background: color + "33" }} aria-hidden>
      {icon}
    </span>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-slate-600"}`}>
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-7" : "left-1"}`} />
    </button>
  );
}

// ---------- 🔔 LINE ----------
function LineSection() {
  const { toast } = useApp();
  const [row, setRow] = useState<any>(null);
  const [enabled, setEnabled] = useState(true);
  const [target, setTarget] = useState("group");
  const [last, setLast] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettingsRow().then(r => { setRow(r); setEnabled(r.notification_enabled); setTarget(r.line_target_type); }).catch(() => setRow({}));
    sb.from("notification_logs").select("target_date, status, sent_at")
      .order("created_at", { ascending: false }).limit(1).then(({ data }) => setLast(data?.[0] ?? null));
  }, []);

  if (!row) return <Spinner />;
  const dirty = enabled !== row.notification_enabled || target !== row.line_target_type;

  async function save() {
    setSaving(true);
    const { error } = await sb.from("app_settings").update({ notification_enabled: enabled, line_target_type: target }).eq("id", 1);
    setSaving(false);
    if (error) { toast("❌ บันทึกไม่สำเร็จ"); return; }
    setRow({ ...row, notification_enabled: enabled, line_target_type: target });
    toast("บันทึกแล้ว ✅");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-12 items-center justify-between gap-3">
        <span className="font-semibold">แจ้งตารางพรุ่งนี้ทุกวัน 19:00</span>
        <Toggle on={enabled} onChange={setEnabled} label="เปิดแจ้งเตือน" />
      </div>
      <div>
        <p className="mb-1.5 text-sm text-slate-400">ส่งไปที่</p>
        <div className="grid grid-cols-2 gap-2">
          {[{ v: "group", t: "👥 กลุ่ม LINE" }, { v: "personal", t: "👤 LINE ส่วนตัว" }].map(o => (
            <button key={o.v} type="button" onClick={() => setTarget(o.v)} aria-pressed={target === o.v}
              className={`min-h-12 rounded-xl border-2 font-semibold ${target === o.v ? "border-violet-500 bg-violet-600/20" : "border-transparent bg-slate-700/60"}`}>{o.t}</button>
          ))}
        </div>
      </div>
      <div className="rounded-xl bg-slate-700/50 p-3 text-sm">
        <p>กลุ่ม LINE: {row.line_group_id ? "✅ เชื่อมแล้ว" : "❌ ยังไม่เชื่อม (เชิญบอทเข้ากลุ่ม)"}</p>
        <p className="text-slate-400">ส่งล่าสุด: {last ? `${shortDate(last.target_date)} · ${last.status === "sent" ? "✅ สำเร็จ" : last.status === "failed" ? "❌ ไม่สำเร็จ" : last.status}` : "ยังไม่เคยส่ง"}</p>
      </div>
      <PrimaryButton disabled={!dirty || saving} onClick={save}>💾 บันทึก</PrimaryButton>
    </div>
  );
}

// ---------- ⏰ ช่วงเวลาที่สนใจ ----------
function FocusSection() {
  const { toast, types, profiles, bump } = useApp();
  const [row, setRow] = useState<any>(null);
  const [w, setW] = useState({ s: 990, e: 1440 });
  const [d, setD] = useState({ s: 480, e: 1440 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettingsRow().then(r => {
      setRow(r);
      const fw = (r.focus_windows ?? []) as any[];
      const a = fw.find(x => x.key === (r.workday_focus_key ?? "after_work"));
      const b = fw.find(x => x.key === (r.dayoff_focus_key ?? "day_off"));
      if (a) setW({ s: a.s, e: a.e });
      if (b) setD({ s: b.s, e: b.e });
    }).catch(() => setRow({}));
  }, []);

  if (!row) return <Spinner />;
  const invalid = w.s >= w.e || d.s >= d.e;

  async function save() {
    setSaving(true);
    const keyW = row.workday_focus_key ?? "after_work", keyD = row.dayoff_focus_key ?? "day_off";
    const fw = ((row.focus_windows ?? []) as any[]).map(x => x.key === keyW ? { ...x, ...w } : x.key === keyD ? { ...x, ...d } : x);
    const { error } = await sb.from("app_settings").update({ focus_windows: fw }).eq("id", 1);
    if (!error) {
      const t = todayBkk();
      await recompute(t, isoOf(Number(t.slice(0, 4)) + 1, 1, 31), types, profiles).catch(() => undefined);
      bump();
    }
    setSaving(false);
    toast(error ? "❌ บันทึกไม่สำเร็จ" : "บันทึกแล้ว ✅");
  }

  const Pick = ({ v, set }: { v: { s: number; e: number }; set: (x: { s: number; e: number }) => void }) => (
    <div className="flex items-center gap-2">
      <select value={v.s} onChange={e => set({ ...v, s: Number(e.target.value) })} aria-label="เริ่ม" className="min-h-12 flex-1 rounded-xl bg-slate-700 px-2">
        {timeOptions(0, 1410).map(m => <option key={m} value={m}>{minToTime(m)}</option>)}
      </select>–
      <select value={v.e} onChange={e => set({ ...v, e: Number(e.target.value) })} aria-label="ถึง" className="min-h-12 flex-1 rounded-xl bg-slate-700 px-2">
        {timeOptions(30, 1440).map(m => <option key={m} value={m}>{minToTime(m)}</option>)}
      </select>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-400">ระบบนับเวลาว่างตรงกันเฉพาะในช่วงนี้</p>
      <p className="font-semibold">💼 วันที่ Benz ทำงาน</p><Pick v={w} set={setW} />
      <p className="font-semibold">🏖️ วันที่ Benz หยุด</p><Pick v={d} set={setD} />
      {invalid && <p role="alert" className="text-sm text-rose-400">เวลาสิ้นสุดต้องหลังเวลาเริ่ม</p>}
      <PrimaryButton disabled={invalid || saving} onClick={save}>{saving ? "⏳ กำลังคำนวณ..." : "💾 บันทึก"}</PrimaryButton>
    </div>
  );
}

// ---------- 💍 วันครบรอบ ----------
function AnniversarySection() {
  const { toast, bump } = useApp();
  const [val, setVal] = useState<string | null>(null);
  const [init, setInit] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { loadAnniversary(true).then(v => { setVal(v ?? ""); setInit(v ?? ""); }).catch(() => setVal("")); }, []);
  if (val === null) return <Spinner />;
  const invalid = !!val && (!/^\d{4}-\d{2}-\d{2}$/.test(val) || val > todayBkk());

  async function save() {
    setSaving(true);
    const { error } = await sb.from("app_settings").update({ anniversary_date: val || null }).eq("id", 1);
    setSaving(false);
    if (error) { toast("❌ บันทึกไม่สำเร็จ"); return; }
    await loadAnniversary(true); setInit(val ?? ""); bump(); toast("บันทึกแล้ว ✅");
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-400">ปฏิทินจะแสดง 💍 และหน้าหลักจะเตือนล่วงหน้า 7 วัน</p>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">วันแต่งงาน</span>
        <input type="date" value={val} max={todayBkk()} onChange={e => setVal(e.target.value)}
          className="min-h-12 rounded-xl bg-slate-700 px-3" />
      </label>
      {val && !invalid && <p className="text-sm font-semibold text-pink-300">💍 {shortDate(val)}</p>}
      {invalid && <p role="alert" className="text-sm text-rose-400">วันที่ต้องไม่เกินวันนี้</p>}
      <PrimaryButton disabled={saving || invalid || val === init} onClick={save}>💾 บันทึก</PrimaryButton>
    </div>
  );
}

// ---------- 🗓️ ปฏิทิน SA ----------
type CalDay = { day_type: string | null; needs_review: boolean; reason: string | null };
const DAY_OPTIONS = Object.entries(DAY_TYPE_LABEL).map(([value, x]) => ({ value, icon: x.icon, label: x.label }));
const WORK = ["workday", "saturday_workday"];

function CalendarSection() {
  const { me, types, profiles, toast, bump } = useApp();
  const [years, setYears] = useState<{ year: number; n: number; work: number }[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [days, setDays] = useState<Map<string, CalDay>>(new Map());
  const [labels, setLabels] = useState<Record<number, number>>({});
  const [imports, setImports] = useState<{ id: string; path: string | null }[]>([]);
  const [existing, setExisting] = useState<Map<string, string>>(new Map());
  const [month, setMonth] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const isBenz = me.role === "bulakorn";

  const loadYears = () => sb.from("company_calendar").select("source_year, base_day_type, day_type").then(({ data }) => {
    const c: Record<number, { n: number; work: number }> = {};
    (data ?? []).forEach((r: any) => {
      const x = (c[r.source_year] ??= { n: 0, work: 0 });
      x.n++; if (WORK.includes(r.base_day_type ?? r.day_type)) x.work++;
    });
    setYears(Object.entries(c).map(([y, v]) => ({ year: Number(y), ...v })).sort((a, b) => b.year - a.year));
  });
  useEffect(() => { loadYears(); }, []);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const { importId, draft } = await uploadAndOcr(file, me.id, "company_calendar", setBusy);
      const { data: row } = await sb.from("schedule_imports").select("image_path").eq("id", importId).single();
      if (!draft?.year || !Array.isArray(draft.days)) throw new Error("GEMINI_EMPTY");
      if (year && draft.year !== year) throw new Error("YEAR_MISMATCH");
      const merged = new Map(days);
      for (const d of draft.days as ({ date: string } & CalDay)[]) {
        const prev = merged.get(d.date);
        if (!prev || prev.reason === "ไม่พบในรูป") merged.set(d.date, { day_type: d.day_type, needs_review: d.needs_review, reason: d.reason });
      }
      const lb = { ...labels };
      (draft.monthFlags ?? []).forEach((f: any) => { if (f.found !== false && f.label >= 0) lb[f.month] = f.label; });
      if (!year) {
        const { data: ex } = await sb.from("company_calendar").select("calendar_date, base_day_type, day_type").eq("source_year", draft.year);
        setExisting(new Map((ex ?? []).map((r: any) => [r.calendar_date, r.base_day_type ?? r.day_type])));
      }
      setYear(draft.year); setDays(merged); setLabels(lb);
      setImports(p => [...p, { id: importId, path: row?.image_path ?? null }]);
      const firstReview = [...merged.entries()].find(([, v]) => v.needs_review && v.reason !== "ไม่พบในรูป");
      setMonth(firstReview ? Number(firstReview[0].slice(5, 7)) : Number(draft.days.find((x: any) => x.reason !== "ไม่พบในรูป")?.date?.slice(5, 7) ?? 1));
    } catch (e) {
      setError((e as Error).message === "YEAR_MISMATCH" ? "❌ รูปนี้เป็นคนละปีกับรูปแรก" : errorText(e));
    } finally { setBusy(""); }
  }

  const stats = useMemo(() => {
    const per: { m: number; counted: number; label: number | null; review: number }[] = [];
    if (!year) return { per, total: 0, pending: 0, mismatch: 0 };
    for (let m = 1; m <= 12; m++) {
      let counted = 0, review = 0;
      for (let d = 1; d <= daysInMonth(year, m); d++) {
        const v = days.get(isoOf(year, m, d));
        if (!v || v.needs_review || !v.day_type) review++;
        else if (WORK.includes(v.day_type)) counted++;
      }
      per.push({ m, counted, label: labels[m] ?? null, review });
    }
    return {
      per, total: per.reduce((s, x) => s + x.counted, 0),
      pending: per.reduce((s, x) => s + x.review, 0),
      mismatch: per.filter(x => x.review === 0 && x.label !== null && x.label !== x.counted).length,
    };
  }, [days, labels, year]);

  const cells = useMemo(() => {
    const c = new Map<string, ReviewCell>();
    days.forEach((v, date) => {
      const L = v.day_type ? DAY_TYPE_LABEL[v.day_type] : null;
      const old = existing.get(date);
      c.set(date, {
        date, icon: L?.icon ?? "❔", label: L?.label ?? "ไม่ทราบ", color: L?.color ?? "#64748B",
        state: v.needs_review || !v.day_type ? "review" : !old ? "new" : old === v.day_type ? "same" : "changed",
        oldIcon: old ? DAY_TYPE_LABEL[old]?.icon : undefined, reason: v.reason,
      });
    });
    return c;
  }, [days, existing]);

  function pick(date: string, value: string) {
    setDays(p => new Map(p).set(date, { day_type: value, needs_review: false, reason: null }));
  }

  async function save() {
    if (!year || stats.pending || stats.mismatch) return;
    setBusy("กำลังบันทึก...");
    try {
      // base_day_type = ค่าจากปฏิทินบริษัท (qe-sync จะทับ day_type เฉพาะวันลา/อบรมเอง)
      const rows = [...days.entries()].map(([date, v]) => ({
        calendar_date: date, day_type: v.day_type, base_day_type: v.day_type, source_year: year, verified: true,
        import_id: imports[imports.length - 1]?.id ?? null,
      }));
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await sb.from("company_calendar").upsert(rows.slice(i, i + 200), { onConflict: "calendar_date" });
        if (error) throw new Error(error.message);
      }
      await sb.from("schedule_imports").update({ import_status: "saved", imported_at: new Date().toISOString(), draft_payload: null })
        .in("id", imports.map(x => x.id));
      setBusy("กำลังคำนวณเวลาว่าง...");
      await recompute(isoOf(year, 1, 1), isoOf(year, 12, 31), types, profiles);
      bump(); loadYears(); setSaved(true);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(""); }
  }

  async function finish(keep: boolean) {
    for (const x of imports) await finishImage(x.id, x.path, keep).catch(() => undefined);
    toast(keep ? "🔒 เก็บรูปแล้ว" : "🗑️ ลบรูปแล้ว");
    setYear(null); setDays(new Map()); setLabels({}); setImports([]); setExisting(new Map()); setSaved(false);
  }

  if (busy) return <Spinner text={busy} />;
  if (saved) return (
    <div className="flex flex-col gap-3 text-center">
      <p className="font-bold">✅ บันทึกปฏิทิน {year! + 543} แล้ว</p>
      <p className="text-sm text-slate-400">💡 ข้อมูลลา/อบรมจาก QE Tracker จะถูกใส่ทับอีกครั้งตอน 18:50</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => finish(false)} className="min-h-12 rounded-xl bg-violet-600 font-bold text-white">🗑️ ลบรูป</button>
        <button type="button" onClick={() => finish(true)} className="min-h-12 rounded-xl bg-slate-700 font-bold">🔒 เก็บรูป</button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {error && <p role="alert" className="text-sm font-semibold text-rose-400">{error}</p>}
      {!year && (
        <>
          <div className="flex flex-col gap-1.5">
            {years === null ? <Spinner /> : years.length === 0 ? <p className="text-sm">ยังไม่มีปฏิทิน</p> : years.map(y => (
              <div key={y.year} className="flex items-center justify-between rounded-xl bg-slate-700/50 px-3 py-2.5">
                <span className="font-semibold">📅 ปี {y.year + 543}</span>
                <span className="text-sm text-slate-400">ทำงาน {y.work} วัน · {y.n} วัน</span>
              </div>
            ))}
          </div>
          {isBenz ? (
            <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 font-bold text-white">
              📷 นำเข้าปฏิทินปีใหม่จากรูป
              <input type="file" accept="image/*" className="sr-only" onChange={e => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          ) : <p className="text-sm text-slate-400">Benz เป็นผู้นำเข้าปฏิทินบริษัท</p>}
          <p className="text-xs text-slate-500">💡 รูปทั้งปีอาจอ่านไม่ทัน ให้ครอปทีละ 2–3 เดือน แล้วกด ➕ เพิ่มรูป</p>
        </>
      )}

      {year && (
        <>
          <p className="font-bold">ปฏิทิน {year + 543} · วันทำงาน {stats.total} วัน</p>
          {existing.size > 0 && <p className="text-sm text-amber-300">มีข้อมูลปีนี้แล้ว · ช่องกรอบม่วง = ต่างจากเดิม</p>}
          <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-600 font-semibold">
            ➕ เพิ่มรูปเดือนอื่น
            <input type="file" accept="image/*" className="sr-only" onChange={e => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <div className="grid grid-cols-6 gap-1">
            {stats.per.map(p => {
              const bad = p.review > 0 || (p.label !== null && p.label !== p.counted);
              return (
                <button key={p.m} type="button" onClick={() => { setMonth(p.m); setSelected(null); }}
                  className={`min-h-12 rounded-lg text-xs ${month === p.m ? "ring-2 ring-violet-500" : ""} ${bad ? "bg-orange-500/25" : "bg-emerald-600/25"}`}>
                  {MONTH_SHORT[p.m - 1]}<br />{p.counted}{p.label !== null ? `/${p.label}` : ""}
                </button>
              );
            })}
          </div>
          <p className="text-sm font-semibold">{MONTH_TH[month - 1]}</p>
          <ReviewGrid year={year} month={month} cells={cells} selected={selected} onSelect={setSelected} options={DAY_OPTIONS} onPick={pick} />
          <PrimaryButton disabled={stats.pending > 0 || stats.mismatch > 0} onClick={save}>
            {stats.pending ? `เหลือต้องตรวจ ${stats.pending} วัน` : stats.mismatch ? `ยอดวันทำงานไม่ตรง ${stats.mismatch} เดือน` : "✅ ตรวจสอบและบันทึก"}
          </PrimaryButton>
        </>
      )}
    </div>
  );
}

// ---------- 🔤 คำเรียกเวร ----------
function MappingSection() {
  const { me, types, toast } = useApp();
  const [rows, setRows] = useState<any[] | null>(null);
  const [text, setText] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const load = () => sb.from("shift_code_mappings").select("id, raw_text, shift_type_code").order("shift_type_code")
    .then(({ data }) => setRows(data ?? []));
  useEffect(() => { load(); }, []);
  if (!rows) return <Spinner />;
  const canEdit = me.role === "wannika";

  async function add() {
    const t = text.trim();
    if (!t || !code) return;
    setSaving(true);
    const { error } = await sb.from("shift_code_mappings").insert({ raw_text: t.slice(0, 30), shift_type_code: code, created_by: me.id });
    setSaving(false);
    if (error) { toast(error.code === "23505" ? "⚠️ มีคำนี้แล้ว" : "❌ บันทึกไม่สำเร็จ"); return; }
    setText(""); setCode(""); load(); toast("บันทึกแล้ว ✅");
  }

  // จัดกลุ่มตามประเภทเวร
  const grouped = types.filter(t => !t.needs_confirm).map(t => ({ t, words: rows.filter(r => r.shift_type_code === t.code) })).filter(g => g.words.length);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-400">คำในแอปตารางเวรเดิม → ประเภทเวรของระบบ</p>
      <div className="flex flex-col gap-1.5">
        {grouped.map(({ t, words }) => (
          <div key={t.code} className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: t.color + "1f" }}>
            <span className="w-24 shrink-0 text-sm font-bold">{t.icon} {t.label_th}</span>
            <span className="flex flex-wrap gap-1">
              {words.map(w => <span key={w.id} className="rounded-md bg-slate-700/70 px-1.5 py-0.5 text-xs font-semibold">{w.raw_text}</span>)}
            </span>
          </div>
        ))}
      </div>
      {canEdit ? (
        <>
          <p className="mt-2 text-sm font-semibold">➕ เพิ่มคำใหม่</p>
          <input value={text} onChange={e => setText(e.target.value)} maxLength={30} placeholder="คำในแอปเดิม เช่น Eve"
            aria-label="คำในแอปเดิม" className="min-h-12 rounded-xl bg-slate-700 px-3" />
          <div className="grid grid-cols-2 gap-2">
            {types.filter(t => !t.needs_confirm).map(t => (
              <button key={t.code} type="button" onClick={() => setCode(t.code)} aria-pressed={code === t.code}
                className={`min-h-11 rounded-xl border-2 px-2 text-sm font-semibold ${code === t.code ? "" : "border-transparent bg-slate-700/60"}`}
                style={code === t.code ? { borderColor: t.color, background: t.color + "2e" } : undefined}>{t.icon} {t.label_th}</button>
            ))}
          </div>
          <PrimaryButton disabled={!text.trim() || !code || saving} onClick={add}>💾 บันทึกคำใหม่</PrimaryButton>
        </>
      ) : <p className="text-sm text-slate-400">Eaw เป็นผู้เพิ่มคำเรียกเวร</p>}
    </div>
  );
}

// ---------- 📜 ประวัติ ----------
const STATUS_TH: Record<string, string> = { sent: "✅ ส่งแล้ว", failed: "❌ ไม่สำเร็จ", retrying: "🔁 กำลังลองใหม่", pending: "⏳ รอส่ง", skipped: "⏸️ ปิดแจ้งเตือน" };

function HistorySection() {
  const { profiles, typeMap } = useApp();
  const [tab, setTab] = useState<"audit" | "notify">("audit");
  const [audit, setAudit] = useState<any[] | null>(null);
  const [logs, setLogs] = useState<any[] | null>(null);
  useEffect(() => {
    sb.from("audit_logs").select("*").in("table_name", ["shifts", "overtime", "shift_code_mappings"])
      .order("id", { ascending: false }).limit(50).then(({ data }) => setAudit(data ?? []));
    sb.from("notification_logs").select("*").order("created_at", { ascending: false }).limit(30).then(({ data }) => setLogs(data ?? []));
  }, []);

  const who = (id: string | null) => {
    const p = profiles.find(x => x.id === id);
    return p ? (p.role === "bulakorn" ? "Benz" : "Eaw") : "ระบบ";
  };
  const shiftName = (c?: string) => (c ? `${typeMap.get(c)?.icon ?? ""} ${typeMap.get(c)?.label_th ?? c}` : "—");
  const describe = (a: any): string => {
    const o = a.old_value ?? {}, n = a.new_value ?? {};
    if (a.table_name === "shifts") {
      const d = n.shift_date ?? o.shift_date;
      return `${a.action === "DELETE" ? "ลบ" : "แก้"}เวร Eaw ${d ? shortDate(d) : ""}: ${shiftName(o.shift_type)} → ${shiftName(n.shift_type)}`;
    }
    if (a.table_name === "overtime") {
      const d = n.work_date ?? o.work_date;
      if ((n.note ?? o.note) === "QE:auto") return `ซิงก์ QE ${d ? shortDate(d) : ""}`;
      if (a.action === "DELETE") return `ลบ OT ${d ? shortDate(d) : ""}`;
      return `OT ${d ? shortDate(d) : ""}: ถึง ${n.end_time ? String(n.end_time).slice(0, 5) : "ไม่ระบุ"}`;
    }
    if (a.table_name === "shift_code_mappings") return `คำเรียกเวร: ${n.raw_text ?? o.raw_text} → ${shiftName(n.shift_type_code ?? o.shift_type_code)}`;
    return `${a.table_name}: ${a.action}`;
  };
  const time = (t: string) => new Date(t).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-700/60 p-1" role="tablist">
        {([["audit", "✏️ การแก้ไข"], ["notify", "🔔 แจ้งเตือน"]] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`min-h-10 rounded-lg text-sm font-semibold ${tab === k ? "bg-slate-800 shadow" : "text-slate-400"}`}>{l}</button>
        ))}
      </div>
      {tab === "audit" && (!audit ? <Spinner /> : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {audit.length === 0 && <li className="text-slate-400">ยังไม่มีประวัติ</li>}
          {audit.map(a => (
            <li key={a.id} className="rounded-xl bg-slate-700/50 px-3 py-2">
              <span className="text-xs text-slate-400">{time(a.created_at)} · <b className="text-slate-200">{who(a.user_id)}</b></span><br />{describe(a)}
            </li>
          ))}
        </ul>
      ))}
      {tab === "notify" && (!logs ? <Spinner /> : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {logs.length === 0 && <li className="text-slate-400">ยังไม่เคยส่ง</li>}
          {logs.map(l => (
            <li key={l.id} className="rounded-xl bg-slate-700/50 px-3 py-2">
              📅 {shortDate(l.target_date)} · {STATUS_TH[l.status] ?? l.status}{l.attempt > 1 ? ` (ครั้งที่ ${l.attempt})` : ""}
              {l.error_message && <span className="block text-xs text-rose-300">{l.error_message}</span>}
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

// ---------- 💾 สำรองข้อมูล ----------
function BackupSection() {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const tables = ["shifts", "overtime", "company_calendar", "shift_code_mappings", "day_notes", "app_settings"];
      const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
      for (const t of tables) {
        const { data } = await sb.from(t).select("*");
        out[t] = (data ?? []).map((r: any) => (t === "app_settings" ? { ...r, line_group_id: undefined } : r));
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = `benz-eaw-backup-${todayBkk()}.json`; a.click();
      URL.revokeObjectURL(url);
      toast("⬇️ ดาวน์โหลดแล้ว");
    } catch { toast("❌ สำรองไม่สำเร็จ"); }
    setBusy(false);
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-400">ดาวน์โหลดเวร, OT, ปฏิทิน และหมายเหตุ เป็นไฟล์ JSON เก็บไว้</p>
      <PrimaryButton disabled={busy} onClick={download}>{busy ? "⏳ กำลังเตรียมไฟล์..." : "⬇️ ดาวน์โหลด JSON"}</PrimaryButton>
    </div>
  );
}

