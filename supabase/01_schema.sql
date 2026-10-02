-- ============================================================
--  윌그로우 내신마스터 — DB 스키마 (Supabase SQL Editor에 그대로 붙여넣기)
--  순서: 01_schema.sql → 02_seed.sql
-- ============================================================
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. 사용자 프로필 (auth.users 와 1:1)
-- ------------------------------------------------------------
create table if not exists public.publishers (
  id serial primary key,
  name text not null unique,          -- 예: 동아(윤정미)
  level text not null default '중' check (level in ('중','고')),   -- 중학교/고등학교 (화면 표시용)
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  login_id text not null unique,      -- 학생 아이디 (로그인용)
  name text not null,
  role text not null default 'student' check (role in ('student','teacher')),
  school text,
  grade int check (grade between 1 and 3),
  class_name text,                    -- 반
  publisher_id int references public.publishers(id) on delete set null,
  created_at timestamptz default now()
);

-- 전역 설정
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null
);
insert into public.app_settings(key, value) values ('resolve_streak', '1'::jsonb)
on conflict (key) do nothing;

-- ------------------------------------------------------------
-- 2. 콘텐츠: 출판사 → 학년 → 유닛 → 자료
-- ------------------------------------------------------------
create table if not exists public.units (
  id serial primary key,
  publisher_id int not null references public.publishers(id) on delete cascade,
  grade int not null check (grade between 1 and 3),
  unit_no int not null,
  title text,
  created_at timestamptz default now(),
  unique (publisher_id, grade, unit_no)
);

create table if not exists public.words (
  id serial primary key,
  unit_id int not null references public.units(id) on delete cascade,
  en text not null,
  ko text not null,                   -- 여러 뜻은 "," 또는 "/" 로 구분
  pos text,
  example text,
  category text,                      -- 예: 대화문 / 본문 (교재 어휘 목록 구분)
  sort_order int default 0
);

create table if not exists public.dialogues (
  id serial primary key,
  unit_id int not null references public.units(id) on delete cascade,
  title text not null,                -- 예: Listen & Talk 1 A
  sort_order int default 0
);

create table if not exists public.dialogue_lines (
  id serial primary key,
  dialogue_id int not null references public.dialogues(id) on delete cascade,
  speaker text,
  en text not null,
  ko text,
  sort_order int default 0
);

create table if not exists public.readings (
  id serial primary key,
  unit_id int not null references public.units(id) on delete cascade,
  title text,
  sort_order int default 0
);

create table if not exists public.reading_sentences (
  id serial primary key,
  reading_id int not null references public.readings(id) on delete cascade,
  en text not null,
  ko text,
  sort_order int default 0
);

-- 빈칸 문항 (대화문 빈칸 / 본문 빈칸 공용)
--  prompt   : 빈칸이 ___ 로 표시된 영어 문장 (상 난이도는 빈 문자열 = 문장 전체 영작)
--  answers  : 빈칸 순서대로 정답 배열. 각 원소는 "a / b" 처럼 복수 정답 가능
create table if not exists public.blank_items (
  id serial primary key,
  unit_id int not null references public.units(id) on delete cascade,
  source text not null check (source in ('dialogue','reading')),
  -- reading 전용 유형: low(단어 빈칸·자동) mid(어구 빈칸·자동) high(문장 영작·자동)
  --                  w2(우리말 빈칸) w3(영문 빈칸) w5(동사형) w6(어법 선택)  ← EXAM4YOU 워크북. dialogue 는 null
  difficulty text,
  dialogue_line_id int references public.dialogue_lines(id) on delete cascade,
  sentence_id int references public.reading_sentences(id) on delete cascade,
  prompt text not null,
  answers text[] not null,
  ko text,
  explanation text,                   -- 오답 시 보여줄 해설
  sort_order int default 0
);

create table if not exists public.exam_questions (
  id serial primary key,
  unit_id int not null references public.units(id) on delete cascade,
  school text,
  year int,
  term text,                          -- 예: 1학기 중간
  qtype text not null check (qtype in ('mc','essay')),
  question text not null,
  choices text[],                     -- 객관식 선택지
  answer text not null,               -- 객관식: 번호("3"), 서술형: 정답 ("a / b" 복수 가능)
  explanation text,
  passage_ko text,                    -- 지문/제시문 해석 (오답노트용)
  sort_order int default 0
);
alter table public.exam_questions add column if not exists passage_ko text;

-- ------------------------------------------------------------
-- 3. 학습 기록 / 오답노트
-- ------------------------------------------------------------
create table if not exists public.attempts (
  id bigserial primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  unit_id int references public.units(id) on delete cascade,
  item_type text not null check (item_type in ('word','dialogue_blank','reading_blank','exam')),
  item_id int not null,
  sub_mode text,                      -- word: ko2en / en2ko, reading_blank: low/mid/high
  is_correct boolean not null,
  student_answer text,
  mode text default 'homework',       -- homework | class | retry
  created_at timestamptz default now()
);
create index if not exists attempts_student_idx on public.attempts(student_id, item_type, item_id);
create index if not exists attempts_unit_idx on public.attempts(unit_id);

create table if not exists public.wrong_notes (
  id bigserial primary key,
  student_id uuid not null references public.profiles(id) on delete cascade,
  unit_id int references public.units(id) on delete cascade,
  item_type text not null,
  item_id int not null,
  sub_mode text,
  wrong_count int not null default 1,
  correct_streak int not null default 0,
  status text not null default 'open' check (status in ('open','resolved')),
  last_wrong_at timestamptz default now(),
  resolved_at timestamptz,
  memo text,                          -- 학생이 직접 쓴 오답 정리
  unique (student_id, item_type, item_id, sub_mode)
);
alter table public.wrong_notes add column if not exists memo text;
create index if not exists wrong_notes_student_idx on public.wrong_notes(student_id, status);

-- ------------------------------------------------------------
-- 4. 시험범위 / 숙제 / 수업모드
-- ------------------------------------------------------------
create table if not exists public.exam_ranges (
  id serial primary key,
  title text not null,                -- 예: 거제중 2학년 1학기 중간
  school text not null,
  grade int not null,
  publisher_id int references public.publishers(id) on delete set null,
  exam_date date,
  include_words boolean default true,
  include_dialogue boolean default true,
  include_reading boolean default true,
  include_exam boolean default true,
  exam_years int[],                   -- null = 모든 연도
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table if not exists public.exam_range_units (
  range_id int not null references public.exam_ranges(id) on delete cascade,
  unit_id int not null references public.units(id) on delete cascade,
  primary key (range_id, unit_id)
);

create table if not exists public.homework (
  id serial primary key,
  class_name text not null,
  unit_id int not null references public.units(id) on delete cascade,
  material text not null,             -- words|word_test|dialogue|dialogue_blank|reading|reading_blank|exam
  difficulty text,
  due_date date not null,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table if not exists public.homework_completions (
  homework_id int not null references public.homework(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  completed_at timestamptz default now(),
  primary key (homework_id, student_id)
);

create table if not exists public.live_sessions (
  id serial primary key,
  class_name text not null,
  unit_id int not null references public.units(id) on delete cascade,
  material text not null,
  difficulty text,
  active boolean default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 5. 헬퍼 함수
-- ------------------------------------------------------------
-- 선생님 여부. Supabase SQL Editor(postgres 세션)에서 직접 실행할 때는 관리자로 취급.
create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher')
      or (auth.uid() is null and session_user in ('postgres','supabase_admin'));
$$;

create or replace function public.my_publisher() returns int
language sql stable security definer set search_path = public as $$
  select publisher_id from public.profiles where id = auth.uid();
$$;

create or replace function public.can_view_unit(p_unit_id int) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_teacher()
      or exists (select 1 from public.units u where u.id = p_unit_id and u.publisher_id = public.my_publisher());
$$;

-- ------------------------------------------------------------
-- 6. RLS
-- ------------------------------------------------------------
alter table public.publishers enable row level security;
alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.units enable row level security;
alter table public.words enable row level security;
alter table public.dialogues enable row level security;
alter table public.dialogue_lines enable row level security;
alter table public.readings enable row level security;
alter table public.reading_sentences enable row level security;
alter table public.blank_items enable row level security;
alter table public.exam_questions enable row level security;
alter table public.attempts enable row level security;
alter table public.wrong_notes enable row level security;
alter table public.exam_ranges enable row level security;
alter table public.exam_range_units enable row level security;
alter table public.homework enable row level security;
alter table public.homework_completions enable row level security;
alter table public.live_sessions enable row level security;

-- 로그인 필수. 익명(anon)은 아무것도 못 봄.
drop policy if exists pub_read on public.publishers;
create policy pub_read on public.publishers for select to authenticated using (true);
drop policy if exists pub_write on public.publishers;
create policy pub_write on public.publishers for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for select to authenticated using (id = auth.uid() or public.is_teacher());
drop policy if exists profiles_teacher_write on public.profiles;
create policy profiles_teacher_write on public.profiles for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
drop policy if exists profiles_teacher_delete on public.profiles;
create policy profiles_teacher_delete on public.profiles for delete to authenticated using (public.is_teacher());

drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings for select to authenticated using (true);
drop policy if exists settings_write on public.app_settings;
create policy settings_write on public.app_settings for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

-- 콘텐츠: 학생은 내 출판사 유닛만, 선생님은 전부. 쓰기는 선생님만.
drop policy if exists units_read on public.units;
create policy units_read on public.units for select to authenticated using (public.is_teacher() or publisher_id = public.my_publisher());
drop policy if exists units_write on public.units;
create policy units_write on public.units for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists words_read on public.words;
create policy words_read on public.words for select to authenticated using (public.can_view_unit(unit_id));
drop policy if exists words_write on public.words;
create policy words_write on public.words for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists dialogues_read on public.dialogues;
create policy dialogues_read on public.dialogues for select to authenticated using (public.can_view_unit(unit_id));
drop policy if exists dialogues_write on public.dialogues;
create policy dialogues_write on public.dialogues for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists dlines_read on public.dialogue_lines;
create policy dlines_read on public.dialogue_lines for select to authenticated
  using (exists (select 1 from public.dialogues d where d.id = dialogue_id and public.can_view_unit(d.unit_id)));
drop policy if exists dlines_write on public.dialogue_lines;
create policy dlines_write on public.dialogue_lines for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists readings_read on public.readings;
create policy readings_read on public.readings for select to authenticated using (public.can_view_unit(unit_id));
drop policy if exists readings_write on public.readings;
create policy readings_write on public.readings for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists rsent_read on public.reading_sentences;
create policy rsent_read on public.reading_sentences for select to authenticated
  using (exists (select 1 from public.readings r where r.id = reading_id and public.can_view_unit(r.unit_id)));
drop policy if exists rsent_write on public.reading_sentences;
create policy rsent_write on public.reading_sentences for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists blanks_read on public.blank_items;
create policy blanks_read on public.blank_items for select to authenticated using (public.can_view_unit(unit_id));
drop policy if exists blanks_write on public.blank_items;
create policy blanks_write on public.blank_items for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists exam_read on public.exam_questions;
create policy exam_read on public.exam_questions for select to authenticated using (public.can_view_unit(unit_id));
drop policy if exists exam_write on public.exam_questions;
create policy exam_write on public.exam_questions for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

-- 기록: 학생은 본인 것만, 선생님은 전부 조회
drop policy if exists attempts_read on public.attempts;
create policy attempts_read on public.attempts for select to authenticated using (student_id = auth.uid() or public.is_teacher());
drop policy if exists attempts_insert on public.attempts;
create policy attempts_insert on public.attempts for insert to authenticated with check (student_id = auth.uid());

drop policy if exists wn_read on public.wrong_notes;
create policy wn_read on public.wrong_notes for select to authenticated using (student_id = auth.uid() or public.is_teacher());
drop policy if exists wn_delete on public.wrong_notes;
create policy wn_delete on public.wrong_notes for delete to authenticated using (student_id = auth.uid() or public.is_teacher());

-- 시험범위/숙제/수업모드: 모두 조회, 선생님만 쓰기
drop policy if exists ranges_read on public.exam_ranges;
create policy ranges_read on public.exam_ranges for select to authenticated using (true);
drop policy if exists ranges_write on public.exam_ranges;
create policy ranges_write on public.exam_ranges for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
drop policy if exists rangeunits_read on public.exam_range_units;
create policy rangeunits_read on public.exam_range_units for select to authenticated using (true);
drop policy if exists rangeunits_write on public.exam_range_units;
create policy rangeunits_write on public.exam_range_units for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists hw_read on public.homework;
create policy hw_read on public.homework for select to authenticated using (true);
drop policy if exists hw_write on public.homework;
create policy hw_write on public.homework for all to authenticated using (public.is_teacher()) with check (public.is_teacher());
drop policy if exists hwc_read on public.homework_completions;
create policy hwc_read on public.homework_completions for select to authenticated using (student_id = auth.uid() or public.is_teacher());
drop policy if exists hwc_insert on public.homework_completions;
create policy hwc_insert on public.homework_completions for insert to authenticated with check (student_id = auth.uid());

drop policy if exists live_read on public.live_sessions;
create policy live_read on public.live_sessions for select to authenticated using (true);
drop policy if exists live_write on public.live_sessions;
create policy live_write on public.live_sessions for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

-- ------------------------------------------------------------
-- 7. 계정 관리 RPC (선생님 전용) — auth.users 에 직접 생성
--    학생 아이디는 내부적으로  <아이디>@student.willgrow  이메일로 저장됨
-- ------------------------------------------------------------
create or replace function public.login_email(p_login_id text) returns text
language sql immutable as $$
  select lower(trim(p_login_id)) || '@student.willgrow';
$$;

create or replace function public.create_student_account(
  p_login_id text, p_password text, p_name text,
  p_school text default null, p_grade int default null, p_class_name text default null,
  p_publisher_id int default null, p_role text default 'student'
) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := public.login_email(p_login_id);
begin
  if not public.is_teacher() then
    raise exception '선생님만 계정을 만들 수 있습니다.';
  end if;
  if length(coalesce(p_password,'')) < 4 then
    raise exception '비밀번호는 4자 이상이어야 합니다. (%)', p_login_id;
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception '이미 있는 아이디입니다: %', p_login_id;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', p_name, 'login_id', lower(trim(p_login_id))),
    now(), now(), '', '', '', '', '', '', '', '', false, false
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.profiles (id, login_id, name, role, school, grade, class_name, publisher_id)
  values (v_id, lower(trim(p_login_id)), p_name, coalesce(p_role,'student'), p_school, p_grade, p_class_name, p_publisher_id);

  return v_id;
end;
$$;

-- 일괄 생성: [{login_id,password,name,school,grade,class_name,publisher}] (publisher 는 이름)
create or replace function public.bulk_create_students(p_rows jsonb)
returns table(login_id text, ok boolean, message text)
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  r jsonb;
  v_pub int;
begin
  if not public.is_teacher() then
    raise exception '선생님만 계정을 만들 수 있습니다.';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      v_pub := null;
      if coalesce(r->>'publisher','') <> '' then
        insert into public.publishers(name) values (r->>'publisher') on conflict (name) do nothing;
        select id into v_pub from public.publishers where name = r->>'publisher';
      end if;
      perform public.create_student_account(
        r->>'login_id', r->>'password', r->>'name', r->>'school',
        nullif(r->>'grade','')::int, r->>'class_name', v_pub, coalesce(nullif(r->>'role',''),'student'));
      login_id := r->>'login_id'; ok := true; message := '생성됨';
      return next;
    exception when others then
      login_id := r->>'login_id'; ok := false; message := sqlerrm;
      return next;
    end;
  end loop;
end;
$$;

create or replace function public.reset_student_password(p_user_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not public.is_teacher() then
    raise exception '선생님만 비밀번호를 바꿀 수 있습니다.';
  end if;
  if length(coalesce(p_password,'')) < 4 then
    raise exception '비밀번호는 4자 이상이어야 합니다.';
  end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
  where id = p_user_id;
end;
$$;

create or replace function public.delete_student_account(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_teacher() then
    raise exception '선생님만 삭제할 수 있습니다.';
  end if;
  if p_user_id = auth.uid() then
    raise exception '자기 자신은 삭제할 수 없습니다.';
  end if;
  delete from auth.users where id = p_user_id;   -- profiles 는 cascade
end;
$$;

-- ------------------------------------------------------------
-- 8. 풀이 기록 + 오답노트 갱신 RPC (학생이 호출)
-- ------------------------------------------------------------
create or replace function public.record_attempt(
  p_item_type text, p_item_id int, p_unit_id int, p_is_correct boolean,
  p_answer text default null, p_mode text default 'homework', p_sub_mode text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_streak_needed int := coalesce((select (value)::int from public.app_settings where key = 'resolve_streak'), 1);
  v_sub text := coalesce(p_sub_mode, '');
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;

  insert into public.attempts(student_id, unit_id, item_type, item_id, sub_mode, is_correct, student_answer, mode)
  values (auth.uid(), p_unit_id, p_item_type, p_item_id, v_sub, p_is_correct, p_answer, p_mode);

  if not p_is_correct then
    insert into public.wrong_notes(student_id, unit_id, item_type, item_id, sub_mode, wrong_count, correct_streak, status, last_wrong_at, resolved_at)
    values (auth.uid(), p_unit_id, p_item_type, p_item_id, v_sub, 1, 0, 'open', now(), null)
    on conflict (student_id, item_type, item_id, sub_mode) do update
      set wrong_count = public.wrong_notes.wrong_count + 1,
          correct_streak = 0, status = 'open', last_wrong_at = now(), resolved_at = null;
  else
    update public.wrong_notes
      set correct_streak = correct_streak + 1,
          status = case when correct_streak + 1 >= v_streak_needed then 'resolved' else status end,
          resolved_at = case when correct_streak + 1 >= v_streak_needed then now() else resolved_at end
    where student_id = auth.uid() and item_type = p_item_type and item_id = p_item_id and sub_mode = v_sub
      and status = 'open';
  end if;
end;
$$;

-- ------------------------------------------------------------
-- 9. 진도율 계산
--    범위(exam_range) 기준, 학생별 4개 항목 %
-- ------------------------------------------------------------
create or replace function public.pct(p_done bigint, p_total bigint) returns numeric
language sql immutable as $$
  select case when coalesce(p_total,0) = 0 then 0 else round(p_done::numeric * 100 / p_total, 0) end;
$$;

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
      and (p_student_id is not null or (p.school = r.school and p.grade = r.grade))
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

-- 반 전체 많이 틀린 문항 TOP N (선생님)
create or replace function public.top_wrong_items(p_class_name text default null, p_school text default null, p_limit int default 10)
returns table (item_type text, item_id int, sub_mode text, unit_id int, unit_label text, prompt text, answer text, student_count int, wrong_total int)
language sql stable security definer set search_path = public as $$
  select wn.item_type, wn.item_id, wn.sub_mode, wn.unit_id,
    (select pb.name || ' 중' || u.grade || ' L' || u.unit_no from public.units u join public.publishers pb on pb.id = u.publisher_id where u.id = wn.unit_id),
    case wn.item_type
      when 'word' then (select w.en || ' — ' || w.ko from public.words w where w.id = wn.item_id)
      when 'exam' then (select left(q.question, 80) from public.exam_questions q where q.id = wn.item_id)
      else (select coalesce(nullif(b.prompt,''), '[영작] ' || coalesce(b.ko,'')) from public.blank_items b where b.id = wn.item_id)
    end,
    case wn.item_type
      when 'word' then (select w.ko from public.words w where w.id = wn.item_id)
      when 'exam' then (select q.answer from public.exam_questions q where q.id = wn.item_id)
      else (select array_to_string(b.answers, ' | ') from public.blank_items b where b.id = wn.item_id)
    end,
    count(distinct wn.student_id)::int,
    sum(wn.wrong_count)::int
  from public.wrong_notes wn
  join public.profiles p on p.id = wn.student_id
  where public.is_teacher()
    and (p_class_name is null or p.class_name = p_class_name)
    and (p_school is null or p.school = p_school)
  group by wn.item_type, wn.item_id, wn.sub_mode, wn.unit_id
  order by sum(wn.wrong_count) desc, count(distinct wn.student_id) desc
  limit p_limit;
$$;

-- ------------------------------------------------------------
-- 10. 유닛 JSON 일괄 등록 (선생님) — 요구사항 9번 형식
-- ------------------------------------------------------------
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
    insert into public.words(unit_id, en, ko, pos, example, category, sort_order)
    values (v_unit, w->>'en', w->>'ko', w->>'pos', w->>'example', w->>'category', i);
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

  return v_unit;
end;
$$;

-- ------------------------------------------------------------
-- 11. 내 프로필 (앱 시작 시 호출)
-- ------------------------------------------------------------
create or replace function public.me() returns json
language sql stable security definer set search_path = public as $$
  select row_to_json(t) from (
    select p.*, pb.name as publisher_name from public.profiles p left join public.publishers pb on pb.id = p.publisher_id
    where p.id = auth.uid()) t;
$$;

grant usage on schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ------------------------------------------------------------
-- 12. 빈칸 문항 자동 생성 (선생님)
--     source='dialogue' : 대사마다 핵심 단어 1개 빈칸
--     source='reading'  : 문장마다 low(단어 1개) / mid(어구 2~3단어) / high(문장 전체 영작) 3종
-- ------------------------------------------------------------
create or replace function public.make_blank(p_en text, p_level text, out prompt text, out answers text[])
language plpgsql immutable as $$
declare
  toks text[] := regexp_split_to_array(trim(p_en), '\s+');
  n int := coalesce(array_length(toks,1),0);
  stop text[] := array['the','a','an','and','or','but','is','are','was','were','be','been','am','do','does','did','to','of','in','on','at','for','with','from','by','as','it','its','this','that','these','those','i','you','he','she','we','they','me','him','her','us','them','my','your','his','our','their','so','if','then','than','not','no','yes','can','will','would','should','could','have','has','had','what','which','who','how','when','where','why','there','here','very','just','too','also','about','into','out','up','down','over','some','any','all','more','most','much','many','one','two','oh','hi','hello','ok','okay','yeah','let','lets','get','got','go','went','like','really','well','thanks','thank','sure','right','know','think','see','say','said','ill','im','its','dont','doesnt','cant','isnt','arent'];
  best int := 0; bestlen int := 0; i int; clean text; startk int; endk int; ans text := '';
begin
  if p_level = 'high' or n = 0 then
    prompt := ''; answers := array[trim(p_en)]; return;
  end if;
  for i in 1..n loop
    clean := lower(regexp_replace(toks[i], '[^A-Za-z]', '', 'g'));
    if clean <> '' and not (clean = any(stop)) and length(clean) > bestlen then
      best := i; bestlen := length(clean);
    end if;
  end loop;
  if best = 0 then best := greatest(1, n); end if;
  startk := best; endk := best;
  if p_level = 'mid' then
    -- 핵심 단어를 포함한 2~3단어 어구
    if best >= 2 then startk := best - 1; end if;
    if best < n then endk := best + 1; end if;
    if endk - startk + 1 > 3 then endk := startk + 2; end if;
  end if;
  for i in startk..endk loop
    ans := ans || case when i > startk then ' ' else '' end || regexp_replace(toks[i], '^[^A-Za-z0-9'']+|[^A-Za-z0-9'']+$', '', 'g');
  end loop;
  answers := array[ans];
  -- 프롬프트: 선택 구간을 ___ 로, 앞뒤 문장부호는 유지
  prompt := '';
  for i in 1..n loop
    if i = startk then
      prompt := prompt || (regexp_match(toks[i], '^([^A-Za-z0-9'']*)'))[1] || '___';
    end if;
    if i = endk then
      prompt := prompt || coalesce((regexp_match(toks[i], '([^A-Za-z0-9'']*)$'))[1], '');
    end if;
    if i < startk or i > endk then
      prompt := prompt || toks[i];
    end if;
    if i < n and (i < startk or i >= endk) then prompt := prompt || ' '; end if;
  end loop;
end;
$$;

create or replace function public.generate_blanks(p_unit_id int, p_source text, p_replace boolean default true)
returns int
language plpgsql security definer set search_path = public as $$
declare
  cnt int := 0; rec record; lv text; mb record;
begin
  if not public.is_teacher() then raise exception '선생님만 생성할 수 있습니다.'; end if;
  if p_replace then delete from public.blank_items where unit_id = p_unit_id and source = p_source; end if;

  if p_source = 'dialogue' then
    for rec in
      select dl.id, dl.en, dl.ko, d.sort_order ds, dl.sort_order ls
      from public.dialogue_lines dl join public.dialogues d on d.id = dl.dialogue_id
      where d.unit_id = p_unit_id order by d.sort_order, dl.sort_order
    loop
      if array_length(regexp_split_to_array(trim(rec.en), '\s+'),1) < 3 then continue; end if;
      select * into mb from public.make_blank(rec.en, 'low');
      insert into public.blank_items(unit_id, source, difficulty, dialogue_line_id, prompt, answers, ko, sort_order)
      values (p_unit_id, 'dialogue', null, rec.id, mb.prompt, mb.answers, rec.ko, rec.ds*1000 + rec.ls);
      cnt := cnt + 1;
    end loop;
  else
    for rec in
      select rs.id, rs.en, rs.ko, rs.sort_order
      from public.reading_sentences rs join public.readings r on r.id = rs.reading_id
      where r.unit_id = p_unit_id order by r.sort_order, rs.sort_order
    loop
      foreach lv in array array['low','mid','high'] loop
        select * into mb from public.make_blank(rec.en, lv);
        insert into public.blank_items(unit_id, source, difficulty, sentence_id, prompt, answers, ko, sort_order)
        values (p_unit_id, 'reading', lv, rec.id, mb.prompt, mb.answers, rec.ko, rec.sort_order);
        cnt := cnt + 1;
      end loop;
    end loop;
  end if;
  return cnt;
end;
$$;

grant execute on all functions in schema public to authenticated;

-- 오답노트 학생 메모
create or replace function public.set_wrong_note_memo(p_id bigint, p_memo text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.wrong_notes set memo = nullif(trim(p_memo), '') where id = p_id and student_id = auth.uid();
end;
$$;
grant execute on function public.set_wrong_note_memo(bigint, text) to authenticated;
