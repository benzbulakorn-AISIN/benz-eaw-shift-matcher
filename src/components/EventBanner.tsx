// 🎉 แบนเนอร์วันพิเศษที่ใกล้ถึง (หน้าหลัก) — แสดงรายการที่อยู่ในช่วงเตือนของแต่ละรายการ
import { upcomingEvents, occLabel, daysText, type SpecialEvent } from "../lib/special";
import { shortDate } from "../lib/dateBkk";
import { useApp } from "./ui";

export default function EventBanner({ today, events }: { today: string; events: SpecialEvent[] }) {
  const { openDay, goTab } = useApp();
  const list = upcomingEvents(today, events).slice(0, 3);
  if (!list.length) return null;
  const hero = list[0];
  return (
    <div className="card fade-in overflow-hidden rounded-2xl border border-pink-400/50 bg-gradient-to-r from-pink-500/20 via-fuchsia-500/15 to-violet-500/20">
      <button type="button" onClick={() => openDay(hero.date)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="text-4xl" aria-hidden>{hero.ev.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-extrabold leading-tight">
            {hero.days === 0 ? `${occLabel(hero)} 🎉` : `${daysText(hero.days)} · ${occLabel(hero)}`}
          </span>
          <span className="block truncate text-sm font-semibold text-slate-300">
            {shortDate(hero.date)}{hero.ev.note ? ` · ${hero.ev.note}` : ""}
          </span>
        </span>
      </button>
      {list.length > 1 && (
        <div className="flex flex-col border-t border-pink-400/30">
          {list.slice(1).map(o => (
            <button key={o.ev.id} type="button" onClick={() => openDay(o.date)} className="flex items-center gap-2 px-4 py-2 text-left text-sm">
              <span aria-hidden>{o.ev.icon}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{occLabel(o)}</span>
              <span className="shrink-0 font-bold text-pink-300">{daysText(o.days)}</span>
            </button>
          ))}
        </div>
      )}
      <button type="button" onClick={() => goTab("settings")} className="w-full border-t border-pink-400/30 py-1.5 text-xs font-semibold text-slate-400">
        จัดการวันพิเศษ ›
      </button>
    </div>
  );
}
