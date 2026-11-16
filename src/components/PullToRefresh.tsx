// ดึงหน้าจอลงเพื่อรีเฟรช (ทำงานเมื่ออยู่บนสุดของหน้าเท่านั้น)
import { useRef, useState, type ReactNode, type TouchEvent } from "react";

const TRIGGER = 70;   // ดึงเกินกี่ px ถึงรีเฟรช
const MAX = 110;

export default function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<unknown> | void; children: ReactNode }) {
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);

  const onStart = (e: TouchEvent) => {
    if (busy || window.scrollY > 0 || document.querySelector('[role="dialog"]')) { startY.current = null; return; }
    startY.current = e.touches[0].clientY;
  };
  const onMove = (e: TouchEvent) => {
    if (startY.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0 || window.scrollY > 0) { setPull(0); return; }
    setPull(Math.min(MAX, dy * 0.5));   // แรงต้านแบบ iOS
  };
  const onEnd = async () => {
    if (startY.current === null) return;
    startY.current = null;
    if (pull >= TRIGGER) {
      setBusy(true); setPull(50);
      try { await onRefresh(); } finally { setBusy(false); setPull(0); }
    } else setPull(0);
  };

  const ready = pull >= TRIGGER;
  return (
    <div onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
      <div className="flex items-end justify-center overflow-hidden text-sm font-semibold text-slate-400"
        style={{ height: pull, transition: startY.current === null ? "height .25s ease" : "none" }} aria-live="polite">
        {pull > 10 && (
          <span className="flex items-center gap-2 pb-2">
            <span className={`inline-block text-lg ${busy ? "animate-spin" : ""}`}
              style={{ transform: busy ? undefined : `rotate(${ready ? 180 : pull * 2}deg)`, transition: "transform .15s" }} aria-hidden>
              {busy ? "⟳" : "↓"}
            </span>
            {busy ? "กำลังอัปเดต..." : ready ? "ปล่อยเพื่ออัปเดต" : "ดึงลงเพื่ออัปเดต"}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
