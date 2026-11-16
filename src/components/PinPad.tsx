// แป้นรหัส 6 หลักแบบ iPhone Passcode (ใช้ทั้งหน้า Login และเปลี่ยนรหัส)
import { useEffect, useRef, useState } from "react";

const LETTERS: Record<string, string> = {
  "2": "ABC", "3": "DEF", "4": "GHI", "5": "JKL", "6": "MNO", "7": "PQRS", "8": "TUV", "9": "WXYZ",
};

type Props = {
  length?: number;
  disabled?: boolean;
  /** เปลี่ยนค่านี้เพื่อล้างรหัสที่กดค้างไว้ (เช่น ตอนสลับผู้ใช้) */
  resetKey?: string | number;
  /** คืน true = ผ่าน, false = ผิด (จุดสั่นแล้วล้าง) */
  onComplete: (code: string) => Promise<boolean>;
};

export default function PinPad({ length = 6, disabled = false, resetKey, onComplete }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const codeRef = useRef("");
  const blocked = disabled || busy || shake;

  useEffect(() => { codeRef.current = ""; setCode(""); }, [resetKey]);

  async function submit(full: string) {
    setBusy(true);
    let ok = false;
    try { ok = await onComplete(full); } catch { ok = false; }
    setBusy(false);
    if (ok) { codeRef.current = ""; setCode(""); return; }
    setShake(true);
    try { navigator.vibrate?.(180); } catch { /* iPhone ไม่รองรับ */ }
    window.setTimeout(() => { setShake(false); codeRef.current = ""; setCode(""); }, 480);
  }

  function press(d: string) {
    if (blocked || codeRef.current.length >= length) return;
    const next = codeRef.current + d;
    codeRef.current = next;
    setCode(next);
    if (next.length === length) void submit(next);
  }

  function back() {
    if (blocked) return;
    codeRef.current = codeRef.current.slice(0, -1);
    setCode(codeRef.current);
  }

  // รองรับคีย์บอร์ดจริง (คอมพิวเตอร์)
  const handlers = useRef({ press, back });
  handlers.current = { press, back };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); handlers.current.press(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); handlers.current.back(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const Key = ({ d }: { d: string }) => (
    <button type="button" onClick={() => press(d)} disabled={blocked} aria-label={d}
      className="pin-key mx-auto flex h-[76px] w-[76px] touch-manipulation select-none flex-col items-center justify-center rounded-full bg-slate-700/70 text-slate-50 disabled:opacity-50">
      <span className="text-[32px] font-normal leading-none">{d}</span>
      <span className="mt-0.5 h-3 text-[9px] font-bold tracking-[0.2em] text-slate-400">{LETTERS[d] ?? ""}</span>
    </button>
  );

  return (
    <div className="flex flex-col items-center gap-8">
      <style>{`
        .pin-key { transition: background-color .12s ease, transform .08s ease; }
        .pin-key:active:not(:disabled) { background: var(--color-slate-500); transform: scale(.94); }
        .pin-shake { animation: pin-shake .45s ease; }
        @keyframes pin-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-14px)} 40%{transform:translateX(11px)} 60%{transform:translateX(-8px)} 80%{transform:translateX(5px)} }
        @media (prefers-reduced-motion: reduce) { .pin-shake { animation: none; } }
      `}</style>

      {/* จุด 6 จุด */}
      <div className={`flex gap-4 ${shake ? "pin-shake" : ""} ${busy ? "animate-pulse" : ""}`}
        role="status" aria-live="polite" aria-label={`ใส่แล้ว ${code.length} จาก ${length} หลัก`}>
        {Array.from({ length }).map((_, i) => (
          <span key={i} className={`h-3.5 w-3.5 rounded-full border-2 transition-colors ${
            shake ? "border-rose-500 bg-rose-500" : i < code.length ? "border-slate-100 bg-slate-100" : "border-slate-400"}`} />
        ))}
      </div>

      {/* แป้นตัวเลข 3x4 */}
      <div className="grid grid-cols-3 gap-x-6 gap-y-4">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(d => <Key key={d} d={d} />)}
        <span aria-hidden />
        <Key d="0" />
        <button type="button" onClick={back} disabled={blocked || code.length === 0} aria-label="ลบ"
          className="mx-auto flex h-[76px] w-[76px] touch-manipulation items-center justify-center rounded-full text-lg font-semibold text-slate-200 disabled:opacity-30">
          ⌫
        </button>
      </div>
    </div>
  );
}
