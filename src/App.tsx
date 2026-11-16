import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { sb, configOk } from "./lib/supabase";
import { loadProfiles, loadShiftTypes, type Profile, type ShiftType } from "./lib/data";
import ThemeButton from "./components/ThemeButton";
import { Ctx, Spinner, type Tab } from "./components/ui";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Calendar from "./pages/Calendar";
import Upload from "./pages/Upload";
import Settings from "./pages/Settings";
import DaySheet from "./components/DaySheet";

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: "home", icon: "🏠", label: "หน้าหลัก" },
  { key: "calendar", icon: "📅", label: "ปฏิทิน" },
  { key: "upload", icon: "📤", label: "อัปโหลดเวร" },
  { key: "settings", icon: "⚙️", label: "ตั้งค่า" },
];

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [types, setTypes] = useState<ShiftType[]>([]);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<Tab>("home");
  const [sheetDate, setSheetDate] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef<number>();

  useEffect(() => {
    if (!configOk) { setSession(null); return; }
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  useEffect(() => {
    if (!uid) { setProfiles(null); return; }
    Promise.all([loadProfiles(), loadShiftTypes()])
      .then(([p, t]) => { setProfiles(p); setTypes(t); setLoadError(""); })
      .catch(() => setProfiles(prev => { if (!prev) setLoadError("โหลดข้อมูลไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่"); return prev; }));
  }, [uid, version]);

  // Realtime: อีกคนบันทึก → หน้าจอนี้อัปเดตทันที
  useEffect(() => {
    if (!uid) return;
    const ch = sb.channel("bem-live");
    ["shifts", "overtime", "company_calendar", "match_results", "day_notes"].forEach(table =>
      ch.on("postgres_changes", { event: "*", schema: "public", table }, () => setVersion(v => v + 1)));
    ch.subscribe();
    return () => { sb.removeChannel(ch); };
  }, [uid]);

  // เปลี่ยนแท็บ → เลื่อนกลับบนสุด
  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(""), 3000);
  }, []);

  const me = profiles?.find(p => p.id === uid);
  const ctx = useMemo(() => me && profiles ? {
    me, profiles, types, typeMap: new Map(types.map(t => [t.code, t])),
    version, bump: () => setVersion(v => v + 1), openDay: setSheetDate, toast, goTab: setTab,
  } : null, [me, profiles, types, version, toast]);

  if (session === undefined) return <Spinner />;
  if (!session) return <Login />;
  if (loadError) return <Center text={loadError} />;
  if (!profiles) return <Spinner />;
  if (!ctx) return <Center text="บัญชีนี้ไม่มีสิทธิ์ใช้งาน" />;

  const isBenz = me!.role === "bulakorn";

  return (
    <Ctx.Provider value={ctx}>
      <div className="mx-auto flex min-h-full max-w-[960px] flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-slate-900/90 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur">
          <h1 className="flex items-center gap-2 text-lg font-extrabold">
            <span aria-hidden>💑</span>
            <span className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">Benz &amp; Eaw</span>
          </h1>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-semibold">
              {isBenz ? "👨‍💼 Benz" : "👩‍⚕️ Eaw"}
            </span>
            <ThemeButton />
          </div>
        </header>
        <main className="flex-1 px-3 pb-32 pt-1 sm:px-4">
          {tab === "home" && <Home />}
          {tab === "calendar" && <Calendar />}
          {tab === "upload" && <Upload />}
          {tab === "settings" && <Settings />}
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-700 bg-slate-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="เมนูหลัก">
          <div className="mx-auto grid max-w-[960px] grid-cols-4 gap-1 px-2 py-1.5">
            {TABS.map(t => {
              const active = tab === t.key;
              return (
                <button key={t.key} type="button" onClick={() => setTab(t.key)} aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs ${active ? "bg-violet-600/15 font-bold text-violet-300" : "text-slate-400"}`}>
                  <span className={`text-2xl ${active ? "" : "opacity-80"}`} aria-hidden>{t.icon}</span>{t.label}
                </button>
              );
            })}
          </div>
        </nav>
        {sheetDate && <DaySheet date={sheetDate} onClose={() => setSheetDate(null)} />}
        <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-28 z-40 flex justify-center px-4">
          {toastMsg && <div className="fade-in rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-900 shadow-lg">{toastMsg}</div>}
        </div>
      </div>
    </Ctx.Provider>
  );
}

function Center({ text }: { text: string }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-lg">{text}</p>
      <button type="button" className="rounded-xl bg-slate-700 px-4 py-3" onClick={() => sb.auth.signOut()}>🚪 ออกจากระบบ</button>
    </div>
  );
}
