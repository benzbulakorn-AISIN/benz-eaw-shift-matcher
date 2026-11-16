// กล่องเทากะพริบระหว่างโหลด (แทน spinner) — รูปร่างเหมือนเนื้อหาจริง จอจึงไม่กระโดด
export function Bone({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-xl bg-slate-700/70 ${className}`} aria-hidden />;
}

function Shimmer() {
  return (
    <style>{`
      .skeleton { position: relative; overflow: hidden; }
      .skeleton::after { content: ""; position: absolute; inset: 0; transform: translateX(-100%);
        background: linear-gradient(90deg, transparent, rgb(255 255 255 / .08), transparent);
        animation: sk-shimmer 1.3s infinite; }
      html[data-theme="light"] .skeleton::after { background: linear-gradient(90deg, transparent, rgb(255 255 255 / .7), transparent); }
      @keyframes sk-shimmer { to { transform: translateX(100%); } }
      @media (prefers-reduced-motion: reduce) { .skeleton::after { animation: none; } }
    `}</style>
  );
}

export function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="กำลังโหลด">
      <Shimmer />
      <div className="rounded-2xl border border-slate-700 bg-slate-800 p-4">
        <Bone className="h-4 w-40" /><Bone className="mt-3 h-6 w-64" /><Bone className="mt-2 h-4 w-32" />
        <div className="mt-4 flex flex-col gap-2"><Bone className="h-5" /><Bone className="h-5" /><Bone className="h-5" /></div>
      </div>
      <div className="rounded-2xl border border-slate-700 bg-slate-800 p-4">
        <Bone className="h-4 w-44" /><Bone className="mt-3 h-10 w-52" /><Bone className="mt-2 h-5 w-40" />
        <div className="mt-4 flex flex-col gap-2"><Bone className="h-4" /><Bone className="h-4" /><Bone className="h-4" /></div>
      </div>
      <div className="grid grid-cols-7 gap-1.5">{Array.from({ length: 7 }).map((_, i) => <Bone key={i} className="h-20" />)}</div>
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="grid grid-cols-7 gap-1" role="status" aria-label="กำลังโหลด">
      <Shimmer />
      {Array.from({ length: 35 }).map((_, i) => <Bone key={i} className="h-[86px]" />)}
    </div>
  );
}

export function SheetSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="กำลังโหลด">
      <Shimmer />
      <Bone className="h-20" /><Bone className="h-24" /><Bone className="h-32" /><Bone className="h-12" />
    </div>
  );
}
