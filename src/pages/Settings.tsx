// ⚙️ ตั้งค่า: แต่ละหัวข้อเปิด/ปิดได้ และมีปุ่มบันทึกไม่เกิน 1 ปุ่ม
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { sb } from "../lib/supabase";
import { loadSettingsRow, recompute, uploadAndOcr, finishImage, errorText } from "../lib/data";
import { MONTH_SHORT, MONTH_TH, daysInMonth, isoOf, shortDate, todayBkk } from "../lib/dateBkk";
import { minToTime } from "../lib/matching";
import { useApp, Card, PrimaryButton, Spinner, DAY_TYPE_LABEL, timeOptions } from "../components/ui";
import ReviewGrid, { type ReviewCell } from "../components/ReviewGrid";
import ChangePasscode from "../components/ChangePasscode";
export default function Settings() {
  const { me } = useApp();
  return (
    <div className="flex flex-col gap-3">
      <Section icon="🔔" title="แจ้งเตือน LINE"><LineSection /></Section>
      <Section icon="⏰" title="เวลาที่สนใจ"><FocusSection /></Section>
      <Section icon="🗓️" title="ปฏิทิน SA"><CalendarSection /></Section>
      <Section icon="🔤" title="คำเรียกเวร"><MappingSection /></Section>
      <Section icon="📜" title="ประวัติ"><HistorySection /></Section>
      <Section icon="💾" title="สำรองข้อมูล"><BackupSection /></Section>
      <Section icon="🔑" title="เปลี่ยนรหัส 6 หลัก"><ChangePasscode /></Section>
      <button type="button" onClick={() => sb.auth.signOut()} className="min-h-12 rounded-xl bg-slate-800 font-semibold">
        🚪 ออกจากระบบ ({me.role === "bulakorn" ? "Benz" : "Eaw"})
      </button>
    </div>
  );
}

function Section({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-800/90">
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className="flex min-h-14 w-full items-center justify-between px-4 text-left font-bold">
        <span>{icon} {title}</span><span aria-hidden>{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="border-t border-slate-700 p-4">{children}</div>}
    </section>
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
    sb.from("notification_logs").select("target_date, status, sent_at, error_message")
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
    <div className="flex flex-col gap-3">
      <label className="flex min-h-12 items-center justify-between">
        <span>แจ้งเตือนทุกวัน 19:00 น.</span>
        <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="h-6 w-6" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-slate-400">ส่งไปที่</span>
        <select value={target} onChange={e => setTarget(e.target.value)} className="min-h-12 rounded-lg bg-slate-700 px-3">
          <option value="group">👥 กลุ่ม LINE</option>
          <option value="personal">👤 LINE ส่วนตัว</option>
        </select>
      </label>
      <p className="text-sm">กลุ่ม LINE: {row.line_group_id ? "✅ เชื่อมแล้ว" : "❌ ยังไม่เชื่อม (เชิญบอทเข้ากลุ่ม)"}</p>
      <p className="text-sm text-slate-400">
        ล่าสุด: {last ? `${shortDate(last.target_date)} · ${last.status === "sent" ? "✅ ส่งแล้ว" : last.status === "failed" ? "❌ ไม่สำเร็จ" : last.status}` : "ยังไม่เคยส่ง"}
      </p>
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
      const fw = r.focus_windows as any[];
      const a = fw.find(x => x.key === r.workday_focus_key), b = fw.find(x => x.key === (r.dayoff_focus_key ?? "day_off"));
      if (a) setW({ s: a.s, e: a.e });
      if (b) setD({ s: b.s, e: b.e });
    }).catch(() => setRow({}));
  }, []);

  if (!row) return <Spinner />;
  const invalid = w.s >= w.e || d.s >= d.e;

  async function save() {
    setSaving(true);
    const keyW = row.workday_focus_key ?? "after_work", keyD = row.dayoff_focus_key ?? "day_off";
    const fw = (row.focus_windows as any[]).map(x => x.key === keyW ? { ...x, ...w } : x.key === keyD ? { ...x, ...d } : x);
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
      <select value={v.s} onChange={e => set({ ...v, s: Number(e.target.value) })} className="min-h-12 flex-1 rounded-lg bg-slate-700 px-2">
        {timeOptions(0, 1410).map(m => <option key={m} value={m}>{minToTime(m)}</option>)}
      </select>–
      <select value={v.e} onChange={e => set({ ...v, e: Number(e.target.value) })} className="min-h-12 flex-1 rounded-lg bg-slate-700 px-2">
        {timeOptions(30, 1440).map(m => <option key={m} value={m}>{minToTime(m)}</option>)}
      </select>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-400">💼 วันที่ Benz ทำงาน</p><Pick v={w} set={setW} />
      <p className="text-sm text-slate-400">🏖️ วันที่ Benz หยุด</p><Pick v={d} set={setD} />
      {invalid && <p role="alert" className="text-sm text-rose-400">เวลาสิ้นสุดต้องหลังเวลาเริ่ม</p>}
      <PrimaryButton disabled={invalid || saving} onClick={save}>{saving ? "⏳ กำลังคำนวณ..." : "💾 บันทึก"}</PrimaryButton>
    </div>
  );
}

// ---------- 🗓️ ปฏิทิน SA ----------
type CalDay = { day_type: string | null; needs_review: boolean; reason: string | null };
const DAY_OPTIONS = Object.entries(DAY_TYPE_LABEL).map(([value, x]) => ({ value, icon: x.icon, label: x.label }));
const WORK = ["workday", "saturday_workday"];

function CalendarSection() {
  const { me, types, profiles, toast, bump } = useApp();
  const [years, setYears] = useState<{ year: number; n: number }[] | null>(null);
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

  const loadYears = () => sb.from("company_calendar").select("source_year").then(({ data }) => {
    const c: Record<number, number> = {};
    (data ?? []).forEach((r: any) => (c[r.source_year] = (c[r.source_year] ?? 0) + 1));
    setYears(Object.entries(c).map(([y, n]) => ({ year: Number(y), n })).sort((a, b) => b.year - a.year));
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
      (draft.monthFlags ?? []).forEach((f: any) => { if (f.label >= 0) lb[f.month] = f.label; });
      if (!year) {
        const { data: ex } = await sb.from("company_calendar").select("calendar_date, day_type").eq("source_year", draft.year);
        setExisting(new Map((ex ?? []).map((r: any) => [r.calendar_date, r.day_type])));
      }
      setYear(draft.year); setDays(merged); setLabels(lb);
      setImports(p => [...p, { id: importId, path: row?.image_path ?? null }]);
      const firstReview = [...merged.entries()].find(([, v]) => v.needs_review && v.reason !== "ไม่พบในรูป");
      setMonth(firstReview ? Number(firstReview[0].slice(5, 7)) : Number(draft.days[0]?.date?.slice(5, 7) ?? 1));
    } catch (e) {
      setError((e as Error).message === "YEAR_MISMATCH" ? "❌ รูปนี้เป็นคนละปีกับรูปแรก" : errorText(e));
    } finally { setBusy(""); }
  }

  const stats = useMemo(() => {
    const per: { m: number; counted: number; label: number | null; review: number }[] = [];
    if (!year) return { per, total: 0, labelTotal: 0, pending: 0 };
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
      labelTotal: per.reduce((s, x) => s + (x.label ?? 0), 0),
      pending: per.reduce((s, x) => s + x.review, 0),
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
    if (!year || stats.pending) return;
    setBusy("กำลังบันทึก...");
    try {
      const rows = [...days.entries()].map(([date, v]) => ({
        calendar_date: date, day_type: v.day_type, source_year: year, verified: true, import_id: imports[imports.length - 1]?.id ?? null,
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
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => finish(false)} className="min-h-12 rounded-xl bg-violet-600 font-bold">🗑️ ลบรูป</button>
        <button type="button" onClick={() => finish(true)} className="min-h-12 rounded-xl bg-slate-700 font-bold">🔒 เก็บรูป</button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {error && <p role="alert" className="text-sm font-semibold text-rose-400">{error}</p>}
      {!year && (
        <>
          <p className="text-sm">ปีที่มีแล้ว: {years === null ? "..." : years.length ? years.map(y => `${y.year + 543} (${y.n} วัน)`).join(", ") : "ยังไม่มี"}</p>
          {isBenz ? (
            <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl bg-violet-600 font-bold">
              📷 นำเข้าปฏิทินปีใหม่
              <input type="file" accept="image/*" className="sr-only" onChange={e => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          ) : <p className="text-sm text-slate-400">Benz เป็นผู้นำเข้าปฏิทินบริษัท</p>}
        </>
      )}

      {year && (
        <>
          <p className="font-bold">ปฏิทิน {year + 543} · วันทำงาน {stats.total}{stats.labelTotal ? ` / ${stats.labelTotal}` : ""} วัน
            {stats.labelTotal > 0 && (stats.total === stats.labelTotal ? " ✅" : " ⚠️")}</p>
          {existing.size > 0 && <p className="text-sm text-amber-300">มีข้อมูลปีนี้แล้ว · ช่องกรอบม่วง = ต่างจากเดิม</p>}
          <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl bg-slate-700 font-semibold">
            ➕ เพิ่มรูปอีกครึ่งปี
            <input type="file" accept="image/*" className="sr-only" onChange={e => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <div className="grid grid-cols-6 gap-1">
            {stats.per.map(p => {
              const bad = p.review > 0 || (p.label !== null && p.label !== p.counted);
              return (
                <button key={p.m} type="button" onClick={() => { setMonth(p.m); setSelected(null); }}
                  className={`min-h-12 rounded-lg text-xs ${month === p.m ? "ring-2 ring-white" : ""} ${bad ? "bg-orange-500/30 text-orange-100" : "bg-emerald-600/25"}`}>
                  {MONTH_SHORT[p.m - 1]}<br />{p.counted}{p.label !== null ? `/${p.label}` : ""}
                </button>
              );
            })}
          </div>
          <p className="text-sm font-semibold">{MONTH_TH[month - 1]}</p>
          <ReviewGrid year={year} month={month} cells={cells} selected={selected} onSelect={setSelected} options={DAY_OPTIONS} onPick={pick} />
          <PrimaryButton disabled={stats.pending > 0} onClick={save}>
            {stats.pending ? `เหลือต้องตรวจ ${stats.pending} วัน` : "✅ ตรวจสอบและบันทึก"}
          </PrimaryButton>
        </>
      )}
    </div>
  );
}

// ---------- 🔤 คำเรียกเวร ----------
function MappingSection() {
  const { me, types, typeMap, toast } = useApp();
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

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-2">
        {rows.map(r => {
          const t = typeMap.get(r.shift_type_code);
          return <li key={r.id} className="rounded-lg px-2 py-1 text-sm" style={{ background: (t?.color ?? "#64748B") + "33" }}>
            {r.raw_text} → {t?.icon} {t?.label_th ?? r.shift_type_code}</li>;
        })}
      </ul>
      {canEdit ? (
        <>
          <div className="flex gap-2">
            <input value={text} onChange={e => setText(e.target.value)} maxLength={30} placeholder="คำในแอปเดิม"
              aria-label="คำในแอปเดิม" className="min-h-12 min-w-0 flex-1 rounded-lg bg-slate-700 px-3" />
            <select value={code} onChange={e => setCode(e.target.value)} aria-label="ประเภทเวร" className="min-h-12 flex-1 rounded-lg bg-slate-700 px-2">
              <option value="">— เวร —</option>
              {types.filter(t => !t.needs_confirm).map(t => <option key={t.code} value={t.code}>{t.icon} {t.label_th}</option>)}
            </select>
          </div>
          <PrimaryButton disabled={!text.trim() || !code || saving} onClick={add}>💾 บันทึกคำใหม่</PrimaryButton>
        </>
      ) : <p className="text-sm text-slate-400">Eaw เป็นผู้แก้คำเรียกเวร</p>}
    </div>
  );
}

// ---------- 📜 ประวัติ ----------
const TABLE_TH: Record<string, string> = {
  shifts: "เวร", overtime: "OT", company_calendar: "ปฏิทิน", shift_code_mappings: "คำเรียกเวร", app_settings: "ตั้งค่า",
};
const STATUS_TH: Record<string, string> = { sent: "✅ ส่งแล้ว", failed: "❌ ไม่สำเร็จ", retrying: "🔁 กำลังลองใหม่", pending: "⏳ รอส่ง", skipped: "⏸️ ปิดแจ้งเตือน" };

function HistorySection() {
  const { profiles, typeMap } = useApp();
  const [tab, setTab] = useState<"audit" | "notify">("audit");
  const [audit, setAudit] = useState<any[] | null>(null);
  const [logs, setLogs] = useState<any[] | null>(null);
  useEffect(() => {
    sb.from("audit_logs").select("*").order("id", { ascending: false }).limit(50).then(({ data }) => setAudit(data ?? []));
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
      return `${a.action === "DELETE" ? "ลบ" : "แก้"}เวร ${d ? shortDate(d) : ""}: ${shiftName(o.shift_type)} → ${shiftName(n.shift_type)}`;
    }
    if (a.table_name === "overtime") {
      const d = n.work_date ?? o.work_date;
      if (a.action === "DELETE") return `ลบ OT ${d ? shortDate(d) : ""}`;
      return `OT ${d ? shortDate(d) : ""}: ถึง ${n.end_time ? String(n.end_time).slice(0, 5) : "ไม่ระบุ"}`;
    }
    if (a.table_name === "company_calendar") {
      const d = n.calendar_date ?? o.calendar_date;
      return `ปฏิทิน ${d ? shortDate(d) : ""}: ${DAY_TYPE_LABEL[o.day_type]?.label ?? "—"} → ${DAY_TYPE_LABEL[n.day_type]?.label ?? "—"}`;
    }
    if (a.table_name === "shift_code_mappings") return `คำเรียกเวร: ${n.raw_text ?? o.raw_text} → ${shiftName(n.shift_type_code ?? o.shift_type_code)}`;
    return `${TABLE_TH[a.table_name] ?? a.table_name}: ${a.action}`;
  };
  const time = (t: string) => new Date(t).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "audit"} onClick={() => setTab("audit")}
          className={`min-h-12 rounded-lg ${tab === "audit" ? "bg-violet-600" : "bg-slate-700"}`}>✏️ การแก้ไข</button>
        <button type="button" role="tab" aria-selected={tab === "notify"} onClick={() => setTab("notify")}
          className={`min-h-12 rounded-lg ${tab === "notify" ? "bg-violet-600" : "bg-slate-700"}`}>🔔 แจ้งเตือน</button>
      </div>
      {tab === "audit" && (!audit ? <Spinner /> : (
        <ul className="flex flex-col gap-2 text-sm">
          {audit.length === 0 && <li>ยังไม่มีประวัติ</li>}
          {audit.map(a => <li key={a.id} className="rounded-lg bg-slate-700/50 px-3 py-2">🕐 {time(a.created_at)} · <b>{who(a.user_id)}</b> {describe(a)}</li>)}
        </ul>
      ))}
      {tab === "notify" && (!logs ? <Spinner /> : (
        <ul className="flex flex-col gap-2 text-sm">
          {logs.length === 0 && <li>ยังไม่เคยส่ง</li>}
          {logs.map(l => (
            <li key={l.id} className="rounded-lg bg-slate-700/50 px-3 py-2">
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
    } catch { toast("❌ สำรองไม่สำเร็จ"); }
    setBusy(false);
  }
  return <Card className="!p-0 !border-0 !bg-transparent"><PrimaryButton disabled={busy} onClick={download}>⬇️ ดาวน์โหลด JSON</PrimaryButton></Card>;
}
