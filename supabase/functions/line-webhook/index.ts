// รับ Webhook จาก LINE → บันทึก Group ID เมื่อบอทถูกเชิญเข้ากลุ่ม (Deploy แล้ว — เก็บไว้เป็นสำเนา)
import { createClient } from "npm:@supabase/supabase-js@2";

const SECRET = Deno.env.get("LINE_CHANNEL_SECRET") ?? "";
const TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const enc = new TextEncoder();

async function validSignature(body: string, sig: string | null): Promise<boolean> {
  if (!sig || !SECRET) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

const lineApi = (path: string, body?: unknown) =>
  fetch(`https://api.line.me/v2/bot/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
const reply = (replyToken: string, text: string) =>
  lineApi("message/reply", { replyToken, messages: [{ type: "text", text }] });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get("x-line-signature")))) return new Response("invalid signature", { status: 401 });
  const { events = [] } = JSON.parse(raw || "{}");
  for (const ev of events) {
    if (ev.source?.type !== "group") continue;
    const gid: string = ev.source.groupId;
    const { data: st } = await sb.from("app_settings").select("line_group_id").eq("id", 1).single();
    if (ev.type === "join") {
      if (!st?.line_group_id) {
        await sb.from("app_settings").update({ line_group_id: gid, line_group_linked_at: new Date().toISOString() }).eq("id", 1);
        await reply(ev.replyToken, "✅ เชื่อมกลุ่มเรียบร้อย\n📅 จะแจ้งตารางพรุ่งนี้ทุกวัน 19:00 น.");
      } else if (st.line_group_id !== gid) {
        await reply(ev.replyToken, "⚠️ บอทนี้ใช้กับกลุ่มอื่นแล้ว");
        await lineApi(`group/${gid}/leave`);
      }
    }
    if (ev.type === "leave" && st?.line_group_id === gid) {
      await sb.from("app_settings").update({ line_group_id: null, line_group_linked_at: null }).eq("id", 1);
    }
  }
  return new Response("ok");
});
