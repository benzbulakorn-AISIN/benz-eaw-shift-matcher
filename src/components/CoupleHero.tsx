// 💑 การ์ดรูปคู่บนหน้าหลัก + นับถอยหลังถึงเวลาว่างตรงกันครั้งถัดไป
// - แตะ 📷 มุมขวาบนเพื่อเปลี่ยนรูป · ปุ่ม ↕ เลื่อนตำแหน่งรูปขึ้น/ลง
// - รูปเก็บแบบ Private (Signed URL หมดอายุ 1 ชม.) · ทั้ง Benz และ Eaw เปลี่ยนได้
import { useEffect, useState } from "react";
import { sb } from "../lib/supabase";
import { resizeImage } from "../lib/data";
import type { DayInfo } from "../lib/data";
import { minToTime } from "../lib/matching";
import { useApp } from "./ui";
import { nowMinBkk, dur } from "./TodayTimeline";

type Photo = { path: string | null; pos: number; url: string | null };

function countdown(days: DayInfo[], now: number): { big: string; small: string } {
  const [today, tomorrow] = days;
  const t = today?.result;
  if (t && t.level !== "incomplete") {
    const cur = t.windows.find(w => now >= w.s && now < w.e);
    if (cur) return { big: "ตอนนี้อยู่ด้วยกันได้ 💕", small: `ว่างตรงกันถึง ${minToTime(cur.e)} น. · เหลือ ${dur(cur.e - now)}` };
    const next = t.windows.filter(w => w.s > now).sort((a, b) => a.s - b.s)[0];
    if (next) return { big: `อีก ${dur(next.s - now)} จะได้เจอกัน 💕`, small: `วันนี้ ${minToTime(next.s)}–${minToTime(next.e)} น.` };
  }
  const r = tomorrow?.result;
  if (r && r.level !== "incomplete" && r.windows.length) {
    const w = r.windows[0];
    return { big: `อีก ${dur(1440 - now + w.s)} จะได้เจอกัน 💕`, small: `พรุ่งนี้ ${minToTime(w.s)}–${minToTime(w.e)} น.` };
  }
  return { big: "คิดถึงกันนะ 💕", small: "ดูวันว่างที่ใกล้ที่สุดในปฏิทิน" };
}

export default function CoupleHero({ days }: { days: DayInfo[] }) {
  const { toast, version } = useApp();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(nowMinBkk());

  useEffect(() => {
    const t = window.setInterval(() => setNow(nowMinBkk()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await sb.from("app_settings").select("couple_photo_path, couple_photo_pos").eq("id", 1).single();
      const path = (data?.couple_photo_path as string | null) ?? null;
      let url: string | null = null;
      if (path) {
        const { data: s } = await sb.storage.from("private-images").createSignedUrl(path, 3600);
        url = s?.signedUrl ?? null;
      }
      setPhoto({ path, pos: Number(data?.couple_photo_pos ?? 35), url });
    })().catch(() => setPhoto({ path: null, pos: 35, url: null }));
  }, [version]);

  async function onFile(file: File | undefined) {
    if (!file || !photo) return;
    if (!navigator.onLine) { toast("📶 ออฟไลน์อยู่"); return; }
    setBusy(true);
    try {
      const blob = await resizeImage(file, 1600);
      const path = `shared/couple-${Date.now()}.jpg`;
      const { error } = await sb.storage.from("private-images").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      const { error: e2 } = await sb.from("app_settings").update({ couple_photo_path: path, couple_photo_pos: 35 }).eq("id", 1);
      if (e2) throw e2;
      if (photo.path) await sb.storage.from("private-images").remove([photo.path]).catch(() => undefined);
      const { data: s } = await sb.storage.from("private-images").createSignedUrl(path, 3600);
      setPhoto({ path, pos: 35, url: s?.signedUrl ?? null });
      toast("📷 เปลี่ยนรูปแล้ว");
    } catch (e) {
      const m = (e as { message?: string })?.message ?? "";
      toast(/row-level|policy|security/i.test(m) ? "🔒 ยังไม่มีสิทธิ์ (รัน SQL 015 ก่อน)" : "❌ อัปโหลดรูปไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  async function shiftPos() {
    if (!photo?.path) return;
    const pos = (photo.pos + 15) % 105;   // 0 → 15 → … → 90 → 0
    setPhoto({ ...photo, pos });
    await sb.from("app_settings").update({ couple_photo_pos: pos }).eq("id", 1);
  }

  const cd = countdown(days, now);
  const hasImg = !!photo?.url;

  return (
    <section className="card fade-in relative h-48 overflow-hidden rounded-3xl border border-slate-700 bg-gradient-to-br from-violet-600 via-fuchsia-500 to-pink-500 sm:h-56">
      {hasImg && (
        <img src={photo!.url!} alt="รูปคู่ Benz & Eaw" className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: `50% ${photo!.pos}%` }} />
      )}
      {/* ไล่เงาด้านล่างให้อ่านตัวหนังสือชัด */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" aria-hidden />

      <div className="absolute right-3 top-3 flex gap-2">
        {hasImg && (
          <button type="button" onClick={shiftPos} aria-label="เลื่อนตำแหน่งรูป"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur">↕</button>
        )}
        <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white backdrop-blur" aria-label="เปลี่ยนรูปคู่">
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : "📷"}
          <input type="file" accept="image/*" className="sr-only" disabled={busy}
            onChange={e => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>

      {!hasImg && photo && (
        <div className="absolute inset-x-0 top-8 text-center text-white/90">
          <p className="text-5xl" aria-hidden>💑</p>
          <p className="mt-1 text-sm font-semibold">แตะ 📷 เพื่อใส่รูปคู่</p>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 p-4 text-white" aria-live="polite">
        <p className="text-xs font-bold tracking-wide opacity-90">💑 BENZ &amp; EAW</p>
        <p className="text-2xl font-extrabold leading-tight drop-shadow">{cd.big}</p>
        <p className="text-sm font-semibold opacity-90 drop-shadow">{cd.small}</p>
      </div>
    </section>
  );
}
