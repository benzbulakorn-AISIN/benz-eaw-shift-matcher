-- ============================================================
-- 008_day_notes_and_checks.sql
-- 1) ตารางหมายเหตุรายวัน (ของใครของมัน, ทั้งคู่อ่านได้)
-- 2) สร้างฟังก์ชันจาก 005 ซ้ำแบบปลอดภัย (กรณียังไม่ได้รัน 005)
-- รันซ้ำได้ ไม่เสียหาย
-- ============================================================
create table if not exists public.day_notes (
  user_id    uuid not null references public.users(id) on delete cascade,
  note_date  date not null,
  note       text not null check (char_length(note) between 1 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, note_date)
);
alter table public.day_notes enable row level security;

drop policy if exists "notes_read_members" on public.day_notes;
create policy "notes_read_members" on public.day_notes for select to authenticated
  using ((select public.is_member()));
drop policy if exists "notes_write_owner" on public.day_notes;
create policy "notes_write_owner" on public.day_notes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

do $$ begin
  alter publication supabase_realtime add table public.day_notes;
exception when duplicate_object then null; end $$;

-- ---------- จาก 005 (ปลอดภัยถ้ารันซ้ำ) ----------
alter table public.app_settings add column if not exists ot_unknown_end time not null default '20:00';

create or replace function public.min_to_time(m integer)
returns time language sql immutable as $$
  select case when m is null then null
              when m >= 1440 then '24:00'::time
              else make_time(m / 60, m % 60, 0) end;
$$;

create or replace function public.save_shift_import(p_import_id uuid, p_rows jsonb)
returns integer
language plpgsql security invoker set search_path = public as $$
declare
  imp public.schedule_imports; r jsonb; t public.shift_types; d date;
  s_min integer; e_max integer; n integer := 0;
begin
  select * into imp from public.schedule_imports
  where id = p_import_id and user_id = auth.uid() and import_status in ('ocr_done', 'reviewing');
  if imp.id is null then raise exception 'IMPORT_NOT_FOUND'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'INVALID_ROWS'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    d := (r->>'date')::date;
    if extract(month from d) <> imp.month or extract(year from d) <> imp.year then
      raise exception 'DATE_OUT_OF_MONTH %', d;
    end if;
    select * into t from public.shift_types where code = r->>'shift_type';
    if t.code is null or t.needs_confirm then raise exception 'UNCONFIRMED_DAY %', d; end if;

    select min((x->>'s')::int), max((x->>'e')::int) into s_min, e_max
    from jsonb_array_elements(t.busy_segments) x;

    insert into public.shifts (user_id, shift_date, shift_type, start_time, end_time,
      crosses_midnight, busy_segments, source, ocr_confidence, raw_text, import_id, verified)
    values (auth.uid(), d, t.code, public.min_to_time(s_min), public.min_to_time(e_max),
      false, t.busy_segments, 'ocr',
      least(greatest(coalesce((r->>'confidence')::numeric, 0), 0), 1),
      left(r->>'raw_text', 30), p_import_id, true)
    on conflict (user_id, shift_date) do update set
      shift_type = excluded.shift_type, start_time = excluded.start_time, end_time = excluded.end_time,
      busy_segments = excluded.busy_segments, source = 'ocr', ocr_confidence = excluded.ocr_confidence,
      raw_text = excluded.raw_text, import_id = excluded.import_id, verified = true
    where public.shifts.shift_type is distinct from excluded.shift_type;
    n := n + 1;
  end loop;

  update public.schedule_imports set import_status = 'saved', imported_at = now(), draft_payload = null
  where id = p_import_id;
  return n;
end $$;

revoke all on function public.save_shift_import(uuid, jsonb) from public, anon;
grant execute on function public.save_shift_import(uuid, jsonb) to authenticated;

-- ตรวจ: ต้องได้ 3 แถว (day_notes, min_to_time, save_shift_import)
select 'day_notes' as item from information_schema.tables where table_name = 'day_notes'
union all select proname from pg_proc where proname in ('min_to_time', 'save_shift_import');
