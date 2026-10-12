-- 대화문·본문 "읽었는지" 확인: 열람 시간 기록 + 읽기 확인 문제 결과
create table if not exists public.reading_logs (
  id bigserial primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  unit_id int not null references public.units(id) on delete cascade,
  kind text not null check (kind in ('dialogue','reading')),
  event text not null check (event in ('view','check')),   -- view: 열람(머문 시간), check: 읽기 확인 문제 결과
  seconds int default 0,
  score int, total int, passed boolean,
  created_at timestamptz default now()
);
create index if not exists reading_logs_idx on public.reading_logs(student_id, unit_id, kind, event);
alter table public.reading_logs enable row level security;
drop policy if exists reading_logs_own on public.reading_logs;
create policy reading_logs_own on public.reading_logs for select to authenticated using (student_id = auth.uid() or public.is_teacher());
drop policy if exists reading_logs_insert on public.reading_logs;
create policy reading_logs_insert on public.reading_logs for insert to authenticated with check (student_id = auth.uid());

-- 학생이 기록 (열람 시간 또는 읽기 확인 결과)
create or replace function public.log_reading(p_unit_id int, p_kind text, p_event text, p_seconds int default 0, p_score int default null, p_total int default null, p_passed boolean default null)
returns void language sql security definer set search_path = public as $$
  insert into public.reading_logs(student_id, unit_id, kind, event, seconds, score, total, passed)
  select auth.uid(), p_unit_id, p_kind, p_event, greatest(coalesce(p_seconds,0),0), p_score, p_total, p_passed
  where auth.uid() is not null;
$$;

-- 내 상태 (학생 화면용): 유닛·종류별 통과 여부·누적 열람 시간
create or replace function public.my_reading_status(p_unit_id int)
returns table (kind text, passed boolean, best_score int, best_total int, seconds int, checks int)
language sql stable security definer set search_path = public as $$
  select k.kind,
    coalesce(bool_or(l.passed) filter (where l.event='check'), false),
    (select score from public.reading_logs x where x.student_id=auth.uid() and x.unit_id=p_unit_id and x.kind=k.kind and x.event='check' order by x.passed desc nulls last, x.score desc, x.created_at desc limit 1),
    (select total from public.reading_logs x where x.student_id=auth.uid() and x.unit_id=p_unit_id and x.kind=k.kind and x.event='check' order by x.passed desc nulls last, x.score desc, x.created_at desc limit 1),
    coalesce(sum(l.seconds) filter (where l.event='view'), 0)::int,
    count(*) filter (where l.event='check')::int
  from (values ('dialogue'),('reading')) k(kind)
  left join public.reading_logs l on l.kind = k.kind and l.unit_id = p_unit_id and l.student_id = auth.uid()
  group by k.kind;
$$;

-- 선생님 진도율: 시험범위 유닛별 대화문·본문 읽기 확인 통과 수 + 열람 시간
create or replace function public.range_reading(p_range_id int, p_student_id uuid default null)
returns table (
  student_id uuid,
  dialogue_total int, dialogue_passed int, dialogue_minutes int,
  reading_total int, reading_passed int, reading_minutes int,
  detail jsonb
)
language plpgsql stable security definer set search_path = public as $$
declare r public.exam_ranges%rowtype;
begin
  select * into r from public.exam_ranges where id = p_range_id;
  if r.id is null then return; end if;
  if not public.is_teacher() and (p_student_id is null or p_student_id <> auth.uid()) then p_student_id := auth.uid(); end if;
  return query
  with units_in as (select u.id, u.unit_no from public.exam_range_units eu join public.units u on u.id = eu.unit_id where eu.range_id = p_range_id),
  students as (
    select p.id from public.profiles p
    where p.role = 'student' and (p_student_id is null or p.id = p_student_id)
      and (p_student_id is not null or (p.school = r.school and p.grade = r.grade and p.level = r.level))
  ),
  d_units as (select distinct d.unit_id from public.dialogues d where d.unit_id in (select id from units_in)),
  r_units as (select distinct rd.unit_id from public.readings rd where rd.unit_id in (select id from units_in)),
  agg as (
    select l.student_id, l.unit_id, l.kind,
      bool_or(l.passed) filter (where l.event='check') as passed,
      coalesce(sum(l.seconds) filter (where l.event='view'),0) as secs,
      max(l.score) filter (where l.event='check') as best
    from public.reading_logs l where l.unit_id in (select id from units_in) group by l.student_id, l.unit_id, l.kind
  )
  select s.id,
    (select count(*) from d_units)::int,
    (select count(*) from agg a where a.student_id = s.id and a.kind='dialogue' and a.passed and a.unit_id in (select unit_id from d_units))::int,
    (select coalesce(sum(a.secs),0)/60 from agg a where a.student_id = s.id and a.kind='dialogue')::int,
    (select count(*) from r_units)::int,
    (select count(*) from agg a where a.student_id = s.id and a.kind='reading' and a.passed and a.unit_id in (select unit_id from r_units))::int,
    (select coalesce(sum(a.secs),0)/60 from agg a where a.student_id = s.id and a.kind='reading')::int,
    (select coalesce(jsonb_object_agg(u.unit_no, jsonb_build_object(
        'd', (select jsonb_build_object('passed', coalesce(a.passed,false), 'min', a.secs/60, 'best', a.best) from agg a where a.student_id=s.id and a.unit_id=u.id and a.kind='dialogue'),
        'r', (select jsonb_build_object('passed', coalesce(a.passed,false), 'min', a.secs/60, 'best', a.best) from agg a where a.student_id=s.id and a.unit_id=u.id and a.kind='reading')
      )), '{}'::jsonb) from units_in u)
  from students s;
end;
$$;
notify pgrst, 'reload schema';
select 'reading logs ready' as result;
