// วันที่ทั้งหมดคำนวณตามเวลา Asia/Bangkok
const TZ = "Asia/Bangkok";

export function todayBkk(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const pad2 = (n: number) => String(n).padStart(2, "0");
export const isoOf = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export function dowOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = อาทิตย์
}
export function monthRange(y: number, m: number): [string, string] {
  return [isoOf(y, m, 1), isoOf(y, m, daysInMonth(y, m))];
}

export const MONTH_TH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
export const MONTH_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
export const DOW_TH = ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"];
export const DOW_SHORT = ["อา","จ","อ","พ","พฤ","ศ","ส"];

export function thaiDate(iso: string, withDow = false): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${withDow ? `วัน${DOW_TH[dowOf(iso)]}ที่ ` : ""}${d} ${MONTH_TH[m - 1]} ${y + 543}`;
}
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${DOW_SHORT[dowOf(iso)]}. ${d} ${MONTH_SHORT[m - 1]} ${y + 543}`;
}
