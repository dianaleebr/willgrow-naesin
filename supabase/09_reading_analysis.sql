-- 본문분석(내용정리 플러스 Sentence Structures) 저장 테이블 + import_unit 갱신
create table if not exists public.reading_analysis (
  unit_id int primary key references public.units(id) on delete cascade,
  data jsonb not null,                -- {paragraphs:[{no,title,sentences:[{no,en,ko,points:[{tag,text,flags,notes}],vocab}],grammar,summary,tf}]}
  updated_at timestamptz default now()
);
alter table public.reading_analysis enable row level security;
drop policy if exists reading_analysis_read on public.reading_analysis;
create policy reading_analysis_read on public.reading_analysis for select to authenticated using (public.can_view_unit(unit_id));
drop policy if exists reading_analysis_write on public.reading_analysis;
create policy reading_analysis_write on public.reading_analysis for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

create or replace function public.import_unit(p jsonb, p_replace boolean default true)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_pub int; v_unit int; v_dlg int; v_rd int; d jsonb; l jsonb; w jsonb; s jsonb; q jsonb; i int; j int;
begin
  if not public.is_teacher() then raise exception '선생님만 등록할 수 있습니다.'; end if;

  insert into public.publishers(name, level) values (p->>'publisher', coalesce(p->>'level','중')) on conflict (name) do nothing;
  select id into v_pub from public.publishers where name = p->>'publisher';

  insert into public.units(publisher_id, grade, unit_no, title)
  values (v_pub, (p->>'grade')::int, (p->>'unit')::int, p->>'unit_title')
  on conflict (publisher_id, grade, unit_no) do update set title = coalesce(excluded.title, public.units.title)
  returning id into v_unit;

  if p_replace then
    if p ? 'words' then delete from public.words where unit_id = v_unit; end if;
    if p ? 'dialogues' then delete from public.dialogues where unit_id = v_unit; delete from public.blank_items where unit_id = v_unit and source='dialogue'; end if;
    if p ? 'reading' then delete from public.readings where unit_id = v_unit; delete from public.blank_items where unit_id = v_unit and source='reading'; end if;
    if p ? 'exam_questions' then delete from public.exam_questions where unit_id = v_unit; end if;
  end if;

  i := 0;
  for w in select * from jsonb_array_elements(coalesce(p->'words','[]'::jsonb)) loop
    i := i + 1;
    insert into public.words(unit_id, en, ko, pos, example, category, sort_order, extra)
    values (v_unit, w->>'en', w->>'ko', w->>'pos', w->>'example', w->>'category', i, case when jsonb_typeof(w->'extra') = 'object' then w->'extra' else null end);
  end loop;

  i := 0;
  for d in select * from jsonb_array_elements(coalesce(p->'dialogues','[]'::jsonb)) loop
    i := i + 1;
    insert into public.dialogues(unit_id, title, sort_order) values (v_unit, d->>'title', i) returning id into v_dlg;
    j := 0;
    for l in select * from jsonb_array_elements(coalesce(d->'lines','[]'::jsonb)) loop
      j := j + 1;
      insert into public.dialogue_lines(dialogue_id, speaker, en, ko, sort_order)
      values (v_dlg, l->>'speaker', l->>'en', l->>'ko', j);
    end loop;
  end loop;

  if p ? 'reading' and p->'reading' is not null and jsonb_typeof(p->'reading') = 'object' then
    insert into public.readings(unit_id, title, sort_order) values (v_unit, p->'reading'->>'title', 1) returning id into v_rd;
    i := 0;
    for s in select * from jsonb_array_elements(coalesce(p->'reading'->'sentences','[]'::jsonb)) loop
      i := i + 1;
      insert into public.reading_sentences(reading_id, en, ko, sort_order) values (v_rd, s->>'en', s->>'ko', i);
    end loop;
  end if;

  -- 워크북형 빈칸 문항: [{difficulty, sentence_index(0부터), prompt, answers[], ko, explanation}]
  if p ? 'blanks' and jsonb_typeof(p->'blanks') = 'array' and jsonb_array_length(p->'blanks') > 0 then
    delete from public.blank_items where unit_id = v_unit and source = 'reading';
    i := 0;
    for q in select * from jsonb_array_elements(p->'blanks') loop
      i := i + 1;
      insert into public.blank_items(unit_id, source, difficulty, sentence_id, prompt, answers, ko, explanation, sort_order)
      values (v_unit, 'reading', q->>'difficulty',
        (select rs.id from public.reading_sentences rs where rs.reading_id = v_rd and rs.sort_order = (q->>'sentence_index')::int + 1),
        coalesce(q->>'prompt',''), array(select jsonb_array_elements_text(q->'answers')), q->>'ko', q->>'explanation', i);
    end loop;
  end if;

  -- 대화문 빈칸(핵심 표현): [{dialogue_index(0부터), line_index(0부터), prompt, answers[], ko, explanation}]
  if p ? 'dialogue_blanks' and jsonb_typeof(p->'dialogue_blanks') = 'array' and jsonb_array_length(p->'dialogue_blanks') > 0 then
    delete from public.blank_items where unit_id = v_unit and source = 'dialogue';
    i := 0;
    for q in select * from jsonb_array_elements(p->'dialogue_blanks') loop
      i := i + 1;
      insert into public.blank_items(unit_id, source, difficulty, dialogue_line_id, prompt, answers, ko, explanation, sort_order)
      select v_unit, 'dialogue', null, dl.id, coalesce(q->>'prompt',''), array(select jsonb_array_elements_text(q->'answers')), q->>'ko', q->>'explanation', i
        from public.dialogues dg join public.dialogue_lines dl on dl.dialogue_id = dg.id
       where dg.unit_id = v_unit and dg.sort_order = (q->>'dialogue_index')::int + 1 and dl.sort_order = (q->>'line_index')::int + 1;
    end loop;
  end if;

  i := 0;
  for q in select * from jsonb_array_elements(coalesce(p->'exam_questions','[]'::jsonb)) loop
    i := i + 1;
    insert into public.exam_questions(unit_id, school, year, term, qtype, question, choices, answer, explanation, passage_ko, sort_order)
    values (v_unit, q->>'school', nullif(q->>'year','')::int, q->>'term',
      case when q->>'type' in ('mc','객관식') then 'mc' else 'essay' end,
      q->>'question',
      case when q ? 'choices' and jsonb_typeof(q->'choices')='array' then array(select jsonb_array_elements_text(q->'choices')) else null end,
      q->>'answer', q->>'explanation', q->>'passage_ko', i);
  end loop;

  -- 본문분석 (문장별 구문·문법 해설): 유닛당 1행 jsonb
  if p ? 'analysis' and jsonb_typeof(p->'analysis') = 'object' then
    insert into public.reading_analysis(unit_id, data) values (v_unit, p->'analysis')
    on conflict (unit_id) do update set data = excluded.data, updated_at = now();
  end if;

  return v_unit;
end;
$$;

select 'reading analysis ready' as result;
