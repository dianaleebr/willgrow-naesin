-- ============================================================
--  윌그로우 내신마스터 — 샘플 데이터 (01_schema.sql 실행 후 붙여넣기)
--  · 선생님 1명, 학생 2명, 출판사 목록, 샘플 유닛 1개(동아(윤정미) 중2 Lesson 1)
--  · ※ 샘플 대화문/본문은 저작권 문제가 없도록 새로 쓴 예시 문장입니다.
--       실제 교과서 자료는 선생님 화면 → 콘텐츠 관리 → JSON 업로드로 넣어 주세요.
-- ============================================================

-- 출판사 목록
insert into public.publishers(name, sort_order) values
 ('동아(윤정미)',1),('동아(이병민)',2),('천재(이재영)',3),('천재(정사열)',4),('능률(김성곤)',5),
 ('비상(김진완)',6),('미래엔(최연희)',7),('YBM(박준언)',8),('YBM(송미정)',9),('지학사',10)
on conflict (name) do nothing;

-- 계정 (아이디 / 초기 비밀번호) — 배포 후 반드시 비밀번호를 바꾸세요
select public.create_student_account('teacher', 'willgrow1!', '윌그로우 선생님', null, null, null, null, 'teacher');
select public.create_student_account('student1', '1234', '김민준', '거제중', 2, '중2A', (select id from public.publishers where name='동아(윤정미)'), 'student');
select public.create_student_account('student2', '1234', '이서연', '거제중', 2, '중2A', (select id from public.publishers where name='동아(윤정미)'), 'student');

-- 샘플 유닛 (요구사항 9번 JSON 형식 그대로)
select public.import_unit($json$
{
  "publisher": "동아(윤정미)",
  "grade": 2,
  "unit": 1,
  "unit_title": "Suit Your Taste!",
  "words": [
    {"en": "taste", "ko": "취향, 맛", "pos": "n.", "example": "Everyone has a different taste in music."},
    {"en": "suit", "ko": "~에 맞다, 어울리다", "pos": "v.", "example": "This color suits you well."},
    {"en": "favorite", "ko": "가장 좋아하는", "pos": "adj.", "example": "Pizza is my favorite food."},
    {"en": "prefer", "ko": "~을 더 좋아하다", "pos": "v.", "example": "I prefer tea to coffee."},
    {"en": "flavor", "ko": "맛, 풍미", "pos": "n.", "example": "Which flavor of ice cream do you like?"},
    {"en": "spicy", "ko": "매운", "pos": "adj.", "example": "Korean food is often spicy."},
    {"en": "sour", "ko": "신, 시큼한", "pos": "adj.", "example": "The lemon was too sour."},
    {"en": "recipe", "ko": "조리법, 요리법", "pos": "n.", "example": "My grandmother gave me her recipe."},
    {"en": "ingredient", "ko": "재료", "pos": "n.", "example": "Mix all the ingredients in a bowl."},
    {"en": "culture", "ko": "문화", "pos": "n.", "example": "Food is an important part of culture."},
    {"en": "traditional", "ko": "전통적인", "pos": "adj.", "example": "We ate a traditional Korean meal."},
    {"en": "share", "ko": "나누다, 공유하다", "pos": "v.", "example": "Let's share this cake."},
    {"en": "similar", "ko": "비슷한", "pos": "adj.", "example": "Our tastes are quite similar."},
    {"en": "different", "ko": "다른", "pos": "adj.", "example": "People have different tastes."},
    {"en": "healthy", "ko": "건강한, 건강에 좋은", "pos": "adj.", "example": "Vegetables are healthy."},
    {"en": "order", "ko": "주문하다 / 순서", "pos": "v./n.", "example": "I'd like to order a salad."},
    {"en": "delicious", "ko": "맛있는", "pos": "adj.", "example": "The soup was delicious."},
    {"en": "try", "ko": "시도하다, 먹어 보다", "pos": "v.", "example": "You should try this dish."},
    {"en": "popular", "ko": "인기 있는", "pos": "adj.", "example": "Fried chicken is popular in Korea."},
    {"en": "explain", "ko": "설명하다", "pos": "v.", "example": "Can you explain the rules?"}
  ],
  "dialogues": [
    {"title": "Listen & Talk 1 A", "lines": [
      {"speaker": "G", "en": "What is your favorite food, Minho?", "ko": "민호야, 가장 좋아하는 음식이 뭐야?"},
      {"speaker": "B", "en": "I love spicy food. How about you?", "ko": "나는 매운 음식을 좋아해. 너는?"},
      {"speaker": "G", "en": "I prefer sweet things like cake.", "ko": "나는 케이크 같은 단 것을 더 좋아해."},
      {"speaker": "B", "en": "Then let's share a cake after lunch.", "ko": "그럼 점심 먹고 케이크를 나눠 먹자."}
    ]},
    {"title": "Listen & Talk 2 A", "lines": [
      {"speaker": "B", "en": "Which flavor do you want to try?", "ko": "어떤 맛을 먹어 보고 싶어?"},
      {"speaker": "G", "en": "I want to try the strawberry flavor.", "ko": "나는 딸기 맛을 먹어 보고 싶어."},
      {"speaker": "B", "en": "That one is really popular here.", "ko": "그건 여기서 정말 인기가 많아."},
      {"speaker": "G", "en": "Great! Can you explain how to order?", "ko": "좋아! 어떻게 주문하는지 설명해 줄래?"}
    ]}
  ],
  "reading": {"title": "Different Tastes, One Table", "sentences": [
    {"en": "Everyone has a different taste in food.", "ko": "모든 사람은 음식에 대한 취향이 다르다."},
    {"en": "Some people love spicy dishes, while others prefer sweet ones.", "ko": "어떤 사람들은 매운 요리를 좋아하고, 다른 사람들은 단 것을 더 좋아한다."},
    {"en": "In my family, we often cook together on weekends.", "ko": "우리 가족은 주말에 자주 함께 요리를 한다."},
    {"en": "My mother uses a traditional recipe from my grandmother.", "ko": "어머니는 할머니에게서 받은 전통 조리법을 사용하신다."},
    {"en": "My brother likes to add new ingredients to every dish.", "ko": "내 남동생은 모든 요리에 새로운 재료를 넣는 것을 좋아한다."},
    {"en": "Sometimes the food is sour, and sometimes it is too salty.", "ko": "때로는 음식이 시고, 때로는 너무 짜다."},
    {"en": "But we always share the meal and talk about the flavors.", "ko": "하지만 우리는 항상 식사를 나누며 맛에 대해 이야기한다."},
    {"en": "Food is an important part of our culture.", "ko": "음식은 우리 문화의 중요한 부분이다."},
    {"en": "It brings people with similar and different tastes together.", "ko": "음식은 비슷한 취향과 다른 취향을 가진 사람들을 한자리에 모은다."},
    {"en": "So try a new dish today and explain why you like it.", "ko": "그러니 오늘 새로운 요리를 먹어 보고 왜 좋아하는지 설명해 보자."}
  ]},
  "exam_questions": [
    {"school": "거제중", "year": 2025, "term": "1학기 중간", "type": "mc",
     "question": "다음 중 단어와 뜻이 잘못 짝지어진 것은?",
     "choices": ["taste - 취향", "spicy - 매운", "recipe - 재료", "share - 나누다", "similar - 비슷한"],
     "answer": "3", "explanation": "recipe는 '조리법'이고, '재료'는 ingredient입니다."},
    {"school": "거제중", "year": 2025, "term": "1학기 중간", "type": "mc",
     "question": "빈칸에 알맞은 말은?  I ______ tea to coffee.",
     "choices": ["prefer", "share", "order", "explain", "try"],
     "answer": "1", "explanation": "prefer A to B: B보다 A를 더 좋아하다"},
    {"school": "거제중", "year": 2025, "term": "1학기 중간", "type": "mc",
     "question": "본문의 내용과 일치하지 않는 것은?",
     "choices": ["가족은 주말에 함께 요리한다.", "어머니는 전통 조리법을 사용한다.", "남동생은 새로운 재료 넣기를 좋아한다.", "음식은 항상 완벽한 맛이 난다.", "가족은 식사를 나누며 맛에 대해 이야기한다."],
     "answer": "4", "explanation": "본문에서 음식이 시거나 짤 때도 있다고 했습니다."},
    {"school": "거제중", "year": 2024, "term": "1학기 중간", "type": "mc",
     "question": "다음 대화의 빈칸에 알맞은 것은?  A: ______ flavor do you want to try?  B: Strawberry, please.",
     "choices": ["Who", "Which", "Where", "When", "Why"],
     "answer": "2", "explanation": "여러 맛 중 어느 것을 고르는지 물으므로 Which가 알맞습니다."},
    {"school": "거제중", "year": 2024, "term": "1학기 중간", "type": "essay",
     "question": "우리말에 맞게 영작하시오: 모든 사람은 음식에 대한 취향이 다르다. (taste 사용)",
     "answer": "Everyone has a different taste in food. / Everybody has a different taste in food.",
     "explanation": "have a taste in ~: ~에 대한 취향이 있다"},
    {"school": "거제중", "year": 2025, "term": "1학기 중간", "type": "essay",
     "question": "빈칸에 알맞은 단어를 쓰시오 (ㅅ으로 시작): The lemon was too ______.",
     "answer": "sour", "explanation": "sour: 신, 시큼한"},
    {"school": "거제중", "year": 2025, "term": "1학기 중간", "type": "essay",
     "question": "다음 문장을 우리말로 해석하시오: Food is an important part of our culture.",
     "answer": "음식은 우리 문화의 중요한 부분이다. / 음식은 우리 문화의 중요한 일부이다.",
     "explanation": "part of ~: ~의 일부"}
  ]
}
$json$::jsonb);

-- 빈칸 문항 자동 생성
select public.generate_blanks((select id from public.units where unit_no=1 and grade=2 and publisher_id=(select id from public.publishers where name='동아(윤정미)')), 'dialogue');
select public.generate_blanks((select id from public.units where unit_no=1 and grade=2 and publisher_id=(select id from public.publishers where name='동아(윤정미)')), 'reading');

-- 시험범위 예시: 거제중 2학년 1학기 중간 (Lesson 1, 기출 2024·2025)
insert into public.exam_ranges(title, school, grade, publisher_id, exam_date, exam_years, created_by)
values ('거제중 2학년 1학기 중간', '거제중', 2, (select id from public.publishers where name='동아(윤정미)'),
        current_date + 21, array[2024,2025], (select id from public.profiles where login_id='teacher'));
insert into public.exam_range_units(range_id, unit_id)
select r.id, u.id from public.exam_ranges r, public.units u
where r.title='거제중 2학년 1학기 중간' and u.unit_no=1 and u.grade=2 and u.publisher_id=r.publisher_id;

-- 숙제 예시: 중2A 반, 단어테스트, 3일 후 마감
insert into public.homework(class_name, unit_id, material, due_date, note, created_by)
values ('중2A', (select id from public.units where unit_no=1 and grade=2 and publisher_id=(select id from public.publishers where name='동아(윤정미)')),
        'word_test', current_date + 3, 'Lesson 1 단어 한→영 20문항', (select id from public.profiles where login_id='teacher'));
