// แถบแจ้งออฟไลน์ / ใช้ข้อมูลที่เก็บไว้
import { useOnline, cacheTime } from "../lib/special";

export default function OfflineBar({ cachedAt }: { cachedAt: number | null }) {
  const online = useOnline();
  if (online && !cachedAt) return null;
  return (
    <div role="status" className="flex items-center gap-2 rounded-2xl border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-300">
      <span aria-hidden>📶</span>
      <span>{online ? "ใช้ข้อมูลที่เก็บไว้" : "ออฟไลน์"}{cachedAt ? ` · ข้อมูลล่าสุด ${cacheTime(cachedAt)}` : ""}{!online ? " · บันทึกไม่ได้" : ""}</span>
    </div>
  );
}
