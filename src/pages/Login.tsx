import { useState, type FormEvent } from "react";
import { sb, configOk, LOGIN_EMAILS } from "../lib/supabase";
import { PrimaryButton } from "../components/ui";
import ThemeButton from "../components/ThemeButton";

type Who = "bulakorn" | "wannika";
const PEOPLE: { key: Who; icon: string; name: string }[] = [
  { key: "bulakorn", icon: "👨‍💼", name: "Benz" },
  { key: "wannika", icon: "👩‍⚕️", name: "Eaw" },
];

export default function Login() {
  const [who, setWho] = useState<Who>(() => (localStorage.getItem("bem_last_who") as Who) || "bulakorn");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const email = LOGIN_EMAILS[who];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email) { setError("ยังไม่ได้ตั้งค่าอีเมลของระบบ"); return; }
    if (password.length < 6) { setError("รหัสผ่านอย่างน้อย 6 ตัว"); return; }
    setBusy(true); setError("");
    const { error } = await sb.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(/fetch|network/i.test(error.message) ? "📶 อินเทอร์เน็ตขัดข้อง" : "รหัสผ่านไม่ถูกต้อง");
    else localStorage.setItem("bem_last_who", who);
  }

  if (!configOk) return <p className="p-6 text-center">⚙️ ยังไม่ได้ตั้งค่า Supabase ใน GitHub Variables</p>;

  return (
    <div className="relative min-h-full">
      <div className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top))]"><ThemeButton /></div>
      <form onSubmit={submit} className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-5 p-6">
        <div className="text-center">
          <div className="text-5xl" aria-hidden>💑</div>
          <h1 className="mt-2 bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-3xl font-extrabold text-transparent">Benz &amp; Eaw</h1>
          <p className="text-slate-400">Shift Matcher</p>
        </div>
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="เลือกผู้ใช้">
          {PEOPLE.map(p => (
            <button key={p.key} type="button" role="radio" aria-checked={who === p.key} onClick={() => { setWho(p.key); setError(""); }}
              className={`card flex min-h-24 flex-col items-center justify-center rounded-2xl border-2 text-lg font-bold ${who === p.key ? "border-violet-500 bg-violet-600/20" : "border-slate-700 bg-slate-800"}`}>
              <span className="text-4xl" aria-hidden>{p.icon}</span>{p.name}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-400">อีเมล</span>
          <input type="email" name="email" autoComplete="username" value={email} readOnly
            className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-slate-300" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-400">รหัสผ่าน</span>
          <div className="flex gap-2">
            <input type={show ? "text" : "password"} name="password" autoComplete="current-password" value={password}
              onChange={e => setPassword(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3" />
            <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? "ซ่อนรหัส" : "แสดงรหัส"}
              className="w-12 rounded-xl border border-slate-700 bg-slate-800">{show ? "🙈" : "👁️"}</button>
          </div>
        </label>
        {error && <p role="alert" className="text-center font-semibold text-rose-400">{error}</p>}
        <PrimaryButton type="submit" disabled={busy}>{busy ? "⏳ กำลังเข้า..." : "🔓 เข้าสู่ระบบ"}</PrimaryButton>
      </form>
    </div>
  );
}
