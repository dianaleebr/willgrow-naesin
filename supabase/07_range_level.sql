-- 시험범위에 중/고 구분 추가 + 진도율 대상 학생 매칭에 level 반영
alter table public.exam_ranges add column if not exists level text not null default '중' check (level in ('중','고'));
update public.exam_ranges r set level = pub.level from public.publishers pub where r.publisher_id = pub.id and pub.level = '고' and r.level <> '고';

create or replace function public.range_progress(p_range_id int, p_student_id uuid default null)
returns table (
  student_id uuid, name text, school text, grade int, class_name text,
  word_total int, word_done int, word_pct numeric,
  dialogue_total int, dialogue_done int, dialogue_pct numeric,
  reading_total int, reading_done int, reading_pct numeric,
  reading_by_diff jsonb,
  exam_total int, exam_done int, exam_pct numeric, exam_correct int, exam_accuracy numeric,
  open_wrong int
)
language plpgsql stable security definer set search_path = public as $$
declare
  r public.exam_ranges%rowtype;
begin
  select * into r from public.exam_ranges where id = p_range_id;
  if r.id is null then return; end if;
  if not public.is_teacher() and (p_student_id is null or p_student_id <> auth.uid()) then
    p_student_id := auth.uid();
  end if;

  return query
  with units_in as (select unit_id from public.exam_range_units where range_id = p_range_id),
  students as (
    select p.id, p.name, p.school, p.grade, p.class_name from public.profiles p
    where p.role = 'student'
      and (p_student_id is null or p.id = p_student_id)
      and (p_student_id is not null or (p.school = r.school and p.grade = r.grade and p.level = r.level))
  ),
  w_items as (select w.id from public.words w where r.include_words and w.unit_id in (select unit_id from units_in)),
  d_items as (select b.id from public.blank_items b where r.include_dialogue and b.source='dialogue' and b.unit_id in (select unit_id from units_in)),
  r_items as (select b.id, b.difficulty from public.blank_items b where r.include_reading and b.source='reading' and b.unit_id in (select unit_id from units_in)),
  e_items as (select q.id from public.exam_questions q where r.include_exam and q.unit_id in (select unit_id from units_in)
                and (r.exam_years is null or q.year = any(r.exam_years))),
  correct_once as (
    select distinct a.student_id, a.item_type, a.item_id from public.attempts a where a.is_correct
  ),
  attempted as (
    select distinct a.student_id, a.item_type, a.item_id from public.attempts a
  )
  select s.id, s.name, s.school, s.grade, s.class_name,
    (select count(*) from w_items)::int,
    (select count(*) from w_items w join correct_once c on c.item_type='word' and c.item_id=w.id and c.student_id=s.id)::int,
    pct((select count(*) from w_items w join correct_once c on c.item_type='word' and c.item_id=w.id and c.student_id=s.id),(select count(*) from w_items)),
    (select count(*) from d_items)::int,
    (select count(*) from d_items d join correct_once c on c.item_type='dialogue_blank' and c.item_id=d.id and c.student_id=s.id)::int,
    pct((select count(*) from d_items d join correct_once c on c.item_type='dialogue_blank' and c.item_id=d.id and c.student_id=s.id),(select count(*) from d_items)),
    (select count(*) from r_items)::int,
    (select count(*) from r_items x join correct_once c on c.item_type='reading_blank' and c.item_id=x.id and c.student_id=s.id)::int,
    pct((select count(*) from r_items x join correct_once c on c.item_type='reading_blank' and c.item_id=x.id and c.student_id=s.id),(select count(*) from r_items)),
    (select coalesce(jsonb_object_agg(d.difficulty, jsonb_build_object('total', d.total, 'done', d.done, 'pct', pct(d.done, d.total))), '{}'::jsonb)
       from (select x.difficulty, count(*) total,
                    count(c.item_id) done
             from r_items x left join correct_once c on c.item_type='reading_blank' and c.item_id=x.id and c.student_id=s.id
             group by x.difficulty) d),
    (select count(*) from e_items)::int,
    (select count(*) from e_items e join attempted t on t.item_type='exam' and t.item_id=e.id and t.student_id=s.id)::int,
    pct((select count(*) from e_items e join attempted t on t.item_type='exam' and t.item_id=e.id and t.student_id=s.id),(select count(*) from e_items)),
    (select count(*) from e_items e join correct_once c on c.item_type='exam' and c.item_id=e.id and c.student_id=s.id)::int,
    pct((select count(*) from e_items e join correct_once c on c.item_type='exam' and c.item_id=e.id and c.student_id=s.id),
        (select count(*) from e_items e join attempted t on t.item_type='exam' and t.item_id=e.id and t.student_id=s.id)),
    (select count(*) from public.wrong_notes wn where wn.student_id = s.id and wn.status='open')::int
  from students s
  order by s.school, s.grade, s.class_name, s.name;
end;
$$;
select 'range level ready' as result;
