import { useState } from "react";
import { applyTheme, currentTheme, type Theme } from "../lib/theme";

// ปุ่มสลับธีม (ใช้ทั้งหน้า Login และในแอป)
export default function ThemeButton() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" onClick={() => { applyTheme(next); setTheme(next); }}
      aria-label={next === "light" ? "เปลี่ยนเป็นธีมสว่าง" : "เปลี่ยนเป็นธีมมืด"}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-lg">
      <span aria-hidden>{theme === "dark" ? "☀️" : "🌙"}</span>
    </button>
  );
}

