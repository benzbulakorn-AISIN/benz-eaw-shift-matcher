// หน้า Login แบบ iPhone Passcode: แตะเลือกคน → กดรหัส 6 หลัก → เข้าอัตโนมัติ
import { useEffect, useState } from "react";
import { sb, configOk, LOGIN_EMAILS } from "../lib/supabase";
import PinPad from "../components/PinPad";
import ThemeButton from "../components/ThemeButton";

type Who = "bulakorn" | "wannika";
const PEOPLE: { key: Who; icon: string; name: string }[] = [
  { key: "bulakorn", icon: "👨‍💼", name: "Benz" },
  { key: "wannika", icon: "👩‍⚕️", name: "Eaw" },
];
const MAX_TRIES = 5;
const LOCK_MS = 30_000;

type LockState = { fails: number; until: number };
const lockKey = (w: Who) => `bem_lock_${w}`;
function readLock(w: Who): LockState {
  try {
    const v = JSON.parse(localStorage.getItem(lockKey(w)) ?? "");
    if (Number.isFinite(v?.fails) && Number.isFinite(v?.until)) return v;
  } catch { /* ignore */ }
  return { fails: 0, until: 0 };
}
function writeLock(w: Who, s: LockState) {
  try { localStorage.setItem(lockKey(w), JSON.stringify(s)); } catch { /* ignore */ }
}

export default function Login() {
  const [who, setWho] = useState<Who>(() => (localStorage.getItem("bem_last_who") as Who) === "wannika" ? "wannika" : "bulakorn");
  const [lock, setLock] = useState<LockState>(() => readLock(who));
  const [now, setNow] = useState(Date.now());
  const [msg, setMsg] = useState("");
  const person = PEOPLE.find(p => p.key === who)!;

  useEffect(() => { setLock(readLock(who)); setMsg(""); }, [who]);

  // นับถอยหลังตอนถูกล็อก
  const locked = lock.until > now;
  useEffect(() => {
    if (lock.until <= Date.now()) return;
    const t = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= lock.until) {
        const cleared = { fails: 0, until: 0 };
        writeLock(who, cleared); setLock(cleared); setMsg("");
        window.clearInterval(t);
      }
    }, 250);
    return () => window.clearInterval(t);
  }, [lock.until, who]);
  const secondsLeft = Math.max(0, Math.ceil((lock.until - now) / 1000));

  async function tryLogin(code: string): Promise<boolean> {
    const email = LOGIN_EMAILS[who];
    if (!email) { setMsg("⚙️ ยังไม่ได้ตั้งค่าอีเมลของระบบ"); return false; }
    if (readLock(who).until > Date.now()) return false;
    setMsg("");
    const { error } = await sb.auth.signInWithPassword({ email, password: code });
    if (!error) {
      localStorage.setItem("bem_last_who", who);
      writeLock(who, { fails: 0, until: 0 });
      return true;
    }
    if (/fetch|network/i.test(error.message)) { setMsg("📶 อินเทอร์เน็ตขัดข้อง ลองใหม่"); return false; }
    if (error.status === 429) { setMsg("⏳ ลองบ่อยเกินไป รอสักครู่"); return false; }
    const fails = readLock(who).fails + 1;
    const next: LockState = fails >= MAX_TRIES ? { fails, until: Date.now() + LOCK_MS } : { fails, until: 0 };
    writeLock(who, next); setLock(next); setNow(Date.now());
    setMsg(fails >= MAX_TRIES ? "" : `รหัสไม่ถูกต้อง (เหลือ ${MAX_TRIES - fails} ครั้ง)`);
    return false;
  }

  if (!configOk) return <p className="p-6 text-center">⚙️ ยังไม่ได้ตั้งค่า Supabase ใน GitHub Variables</p>;

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center gap-6 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(4rem+env(safe-area-inset-top))]">
      <div className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))]"><ThemeButton /></div>

      <p className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-lg font-extrabold text-transparent">💑 Benz &amp; Eaw</p>

      {/* เลือกคน */}
      <div className="flex gap-8" role="radiogroup" aria-label="เลือกผู้ใช้">
        {PEOPLE.map(p => {
          const on = p.key === who;
          return (
            <button key={p.key} type="button" role="radio" aria-checked={on} onClick={() => setWho(p.key)}
              className={`flex touch-manipulation flex-col items-center gap-1.5 transition ${on ? "" : "opacity-45"}`}>
              <span className={`flex h-20 w-20 items-center justify-center rounded-full text-[44px] transition ${
                on ? "bg-gradient-to-br from-violet-500 to-pink-500 shadow-lg shadow-violet-900/30 ring-4 ring-violet-400/40" : "bg-slate-700"}`}>
                {p.icon}
              </span>
              <span className={`text-sm font-bold ${on ? "text-slate-100" : "text-slate-400"}`}>{p.name}</span>
            </button>
          );
        })}
      </div>

      <div className="text-center">
        <p className="text-lg font-semibold text-slate-100">ใส่รหัสของ {person.name}</p>
        <p className={`mt-1 min-h-6 text-sm font-semibold ${locked ? "text-orange-300" : "text-rose-400"}`} aria-live="assertive">
          {locked ? `🔒 ลองใหม่ได้ใน ${secondsLeft} วินาที` : msg}
        </p>
      </div>

      <div className={locked ? "pointer-events-none opacity-40" : ""}>
        <PinPad resetKey={who} disabled={locked} onComplete={tryLogin} />
      </div>
    </div>
  );
}
