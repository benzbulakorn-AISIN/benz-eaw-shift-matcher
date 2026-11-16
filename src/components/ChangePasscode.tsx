// ⚙️ เปลี่ยนรหัส 6 หลัก: กดรหัสใหม่ → กดซ้ำยืนยัน → บันทึกอัตโนมัติ (ไม่มีปุ่มเพิ่ม)
import { useState } from "react";
import { sb } from "../lib/supabase";
import PinPad from "./PinPad";
import { useApp } from "./ui";

type Step = "new" | "confirm" | "done";

function tooEasy(c: string): boolean {
  if (/^(\d)\1{5}$/.test(c)) return true;                       // 000000, 111111
  const up = "01234567890", down = "09876543210";
  return up.includes(c) || down.includes(c);                    // 123456, 654321
}

export default function ChangePasscode() {
  const { toast } = useApp();
  const [step, setStep] = useState<Step>("new");
  const [first, setFirst] = useState("");
  const [msg, setMsg] = useState("");

  async function onComplete(code: string): Promise<boolean> {
    if (step === "new") {
      if (tooEasy(code)) { setMsg("รหัสเดาง่ายเกินไป ลองรหัสอื่น"); return false; }
      setFirst(code); setMsg(""); setStep("confirm");
      return true;
    }
    if (code !== first) {
      setFirst(""); setStep("new"); setMsg("รหัสไม่ตรงกัน เริ่มใหม่อีกครั้ง");
      return false;
    }
    const { error } = await sb.auth.updateUser({ password: code });
    if (error) {
      setMsg(/different|same/i.test(error.message) ? "รหัสใหม่ต้องไม่ซ้ำรหัสเดิม"
        : /fetch|network/i.test(error.message) ? "📶 อินเทอร์เน็ตขัดข้อง" : "เปลี่ยนรหัสไม่สำเร็จ");
      setFirst(""); setStep("new");
      return false;
    }
    setStep("done"); toast("เปลี่ยนรหัสแล้ว ✅");
    return true;
  }

  if (step === "done") {
    return <p className="py-4 text-center font-semibold text-emerald-300">✅ เปลี่ยนรหัสเรียบร้อย ใช้รหัสใหม่ครั้งหน้า</p>;
  }

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <p className="font-semibold">{step === "new" ? "ใส่รหัสใหม่ 6 หลัก" : "ใส่รหัสใหม่อีกครั้ง"}</p>
      <p className="min-h-5 text-sm font-semibold text-rose-400" aria-live="assertive">{msg}</p>
      <PinPad resetKey={step} onComplete={onComplete} />
    </div>
  );
}
