// สลับธีมมืด/สว่าง (จำค่าไว้ในเครื่อง)
export type Theme = "dark" | "light";

export function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "light" ? "#F1F5F9" : "#0F172A");
  try { localStorage.setItem("bem_theme", t); } catch { /* ignore */ }
}
