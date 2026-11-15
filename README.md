# 💑 Benz & Eaw Shift Matcher

เว็บแอปส่วนตัว (PWA) เปรียบเทียบตารางงาน Bulakorn กับตารางเวร Wannika และแจ้ง LINE ทุกวัน 19:00 น.

- หน้าเว็บ: https://benzbulakorn-aisin.github.io/benz-eaw-shift-matcher/
- Build อัตโนมัติด้วย GitHub Actions (`.github/workflows/deploy.yml`)
- ค่าตั้งค่าหน้าเว็บอยู่ใน GitHub → Settings → Secrets and variables → Actions → Variables
- ความลับทั้งหมดอยู่ใน Supabase → Edge Functions → Secrets เท่านั้น
- ระบบไม่ได้ Sync กับแอปตารางเวรเดิม (แอปเดิมไม่มี API) ใช้การอัปโหลด Screenshot แทน
