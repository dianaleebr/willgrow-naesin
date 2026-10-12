-- 학습 단계 순차 잠금: 단어장 → 단어테스트 → 대화문 → 대화문 빈칸 → 본문 → 본문분석 → 본문 빈칸시험 → 기출문제
-- reading_logs 를 모든 자료의 "완료" 기록으로 넓힘 (kind = 자료 키, event='check' & passed=true 가 완료)
alter table public.reading_logs drop constraint if exists reading_logs_kind_check;
alter table public.reading_logs add constraint reading_logs_kind_check
  check (kind in ('words','word_test','dialogue','dialogue_blank','reading','reading_analysis','reading_blank','exam'));

-- 내가 완료한 단계 목록 (유닛)
create or replace function public.my_unit_steps(p_unit_id int)
returns table (kind text, done_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.kind, max(l.created_at) from public.reading_logs l
  where l.student_id = auth.uid() and l.unit_id = p_unit_id and l.event = 'check' and l.passed
  group by l.kind;
$$;
notify pgrst, 'reload schema';
select 'unit steps ready' as result;
