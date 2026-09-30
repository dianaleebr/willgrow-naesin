# 윌그로우 내신마스터 (WILLGROW 내신마스터)

윌그로우거제캠퍼스어학원 중등부 내신대비 웹앱. React + Vite + Supabase(Auth·Postgres·RLS).

## 배포까지 4단계 (약 20분)

### 1. Supabase 프로젝트 만들기 (무료)
1. https://supabase.com 가입 → **New project** (Region: Northeast Asia (Seoul), 비밀번호는 아무거나 기록해 두기)
2. 왼쪽 메뉴 **SQL Editor** → `supabase/01_schema.sql` 내용 전체 붙여넣고 **Run**
3. 이어서 `supabase/02_seed.sql` 붙여넣고 **Run** → 선생님 1명·학생 2명·샘플 유닛이 생성됨
4. **Authentication → Providers → Email** 에서 **Confirm email 을 OFF** 로 (학생은 이메일이 없으므로)
5. **Project Settings → API** 에서 `Project URL` 과 `anon public` 키 복사

> 샘플 계정: 선생님 `teacher` / `willgrow1!` , 학생 `student1`, `student2` / `1234`  
> 배포 후 반드시 "학생 계정" 화면에서 비밀번호를 바꾸세요.

### 2. 코드 올리기 (GitHub)
1. GitHub 에 새 저장소 `willgrow-naesin` 생성 (Public — 무료 Pages 조건)
   - 교과서 본문·기출은 **DB에만** 들어가고 코드에는 없으므로 공개 저장소여도 괜찮습니다.
2. 이 폴더를 그대로 push
3. 저장소 **Settings → Pages → Source: GitHub Actions**
4. **Settings → Secrets and variables → Actions** 에 아래 2개 등록
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public 키
5. push 하면 자동 배포 → `https://<계정>.github.io/willgrow-naesin/`

### 3. 앱 허브에 카드 연결
기존 허브(`index.html`)의 `<!-- APP LIST -->` 블록에 위 주소로 링크 카드를 추가하면 됩니다. (앱은 별도 주소로 독립 배포)

### 4. 실제 자료 넣기 (EXAM4YOU 변환본)
> ⚠ `content/` 폴더는 교과서 저작권 자료라 `.gitignore` 로 GitHub 업로드에서 제외되어 있습니다. PC에만 보관하고 앱(DB)에만 올리세요.

선생님 로그인 → **콘텐츠** → **JSON 일괄 업로드** → `content/bundles/` 의 파일을 하나씩 올리기
- `동아(윤정미)_전체8과.json` (중1) · `동아(이병민)_전체9과.json` (중2, Special Lesson 포함) · `능률(민병천)공통영어2_전체6과.json` (고1, Special Lesson 1·2 포함)
- 각 유닛에 단어장(예문 포함)·대화문(해석)·본문(문장별 해석)·본문 빈칸 4종(우리말 빈칸 / 영문 빈칸 / 동사형 / 어법 선택, 오답 해설 포함)이 들어 있습니다.
- 업로드 시 "빈칸 자동 생성"을 켜 두면 대화문 빈칸도 함께 만들어집니다. (본문 빈칸은 워크북형이 있으므로 자동 생성으로 덮어쓰지 않음)
- 기출문제 탭에는 EXAM4YOU **예상문제(PRE-STEP·1회·2회, 고등은 1~4회)** 1,981문항이 정답·해설과 함께 들어 있습니다 (학교명 "EXAM4YOU 예상", 학기 칸에 회차). 실제 학교 기출은 같은 탭에서 직접 추가하세요.
- 예상문제 변환: `python3 tools/exam_to_json.py txt content` (교사용 .hwp 를 txt/ 로 추출한 뒤 실행) — 밑줄·굵은 글씨 같은 서식은 텍스트로 옮기면서 사라지므로 "밑줄 친 부분" 문항은 유닛 편집에서 확인이 필요할 수 있습니다.

#### 새 자료를 추가로 변환하려면 (EXAM4YOU 한글 파일 → JSON)
```bash
# 1) EXAM4YOU에서 받은 .hwp 파일들을 한 폴더(raw/)에 모음 (WORD TEST, 내용정리 플러스, 본문, 본문10단계 워크북 2·3·5·6)
# 2) 텍스트 추출
for f in raw/*.hwp; do python3 tools/hwp_text.py "$f" > "txt/$(basename "${f%.hwp}").json"; done
# 3) 앱 JSON 변환 (content/ 에 유닛별 파일 생성)
python3 tools/exam4you_to_json.py txt content
```
`tools/ko_fill.json` 은 자동 추출에서 빠진 대화문 해석을 보충하는 파일입니다.

## 로컬 실행
```bash
cp .env.example .env.local   # URL, anon key 입력
npm install
npm run dev                  # http://localhost:5173
npm test                     # 채점 규칙 테스트
```

## 구조
```
supabase/01_schema.sql   테이블·RLS·RPC(계정 생성/비밀번호 초기화/풀이 기록/진도율/JSON 등록/빈칸 생성)
supabase/02_seed.sql     샘플 데이터 (저작권 없는 예시 문장)
src/lib/grading.js       채점 규칙 (+ grading.test.js)
src/components/QuizRunner.jsx  단어테스트·빈칸·기출·오답재풀이 공용 퀴즈 화면
src/pages/student/       홈(시험범위·진도율·숙제·수업모드), 유닛, 7종 자료, 오답노트
src/pages/teacher/       진도율 대시보드, 학생 계정, 콘텐츠 관리, 시험범위, 숙제·수업, 오답 분석, 설정
```

## 보안 메모
- 학생 아이디는 내부적으로 `아이디@student.willgrow` 이메일로 저장됩니다 (학생은 이메일이 필요 없음).
- 모든 콘텐츠 테이블은 RLS로 보호: 로그인 안 하면 아무것도 못 보고, 학생은 **자기 출판사 유닛 + 자기 기록**만, 쓰기는 선생님만.
- `anon` 키는 공개용 키이며 RLS 때문에 그 자체로는 데이터에 접근할 수 없습니다. **service_role 키는 절대 코드에 넣지 마세요.**
- 계정 생성/비밀번호 초기화는 `SECURITY DEFINER` 함수로 처리되며 선생님 역할만 호출 가능합니다.
