-- 기출/예상문제 제출 기록: 한 번 풀기를 끝낼 때마다 1행 (1차 75점, 2차 80점 …)
create table if not exists public.exam_sessions (
  id bigserial primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  unit_id int not null references public.units(id) on delete cascade,
  term text,                          -- 회차 (PRE-STEP / 예상문제 1회 …), 전체면 null
  qtype text,                         -- mc | essay | null(전체)
  total int not null, correct int not null,
  score int not null,                 -- 100점 만점 환산
  attempt_no int not null,            -- 같은 유닛·회차·유형에서 몇 번째 제출인지
  created_at timestamptz default now()
);
create index if not exists exam_sessions_idx on public.exam_sessions(student_id, unit_id, term, qtype);
alter table public.exam_sessions enable row level security;
drop policy if exists exam_sessions_read on public.exam_sessions;
create policy exam_sessions_read on public.exam_sessions for select to authenticated using (student_id = auth.uid() or public.is_teacher());

create or replace function public.record_exam_session(p_unit_id int, p_term text, p_qtype text, p_total int, p_correct int)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null or p_total <= 0 then return null; end if;
  select coalesce(max(attempt_no), 0) + 1 into n from public.exam_sessions
   where student_id = auth.uid() and unit_id = p_unit_id and coalesce(term,'') = coalesce(p_term,'') and coalesce(qtype,'') = coalesce(p_qtype,'');
  insert into public.exam_sessions(student_id, unit_id, term, qtype, total, correct, score, attempt_no)
  values (auth.uid(), p_unit_id, p_term, p_qtype, p_total, p_correct, round(p_correct::numeric / p_total * 100)::int, n);
  return n;
end;
$$;
notify pgrst, 'reload schema';
select 'exam sessions ready' as result;
