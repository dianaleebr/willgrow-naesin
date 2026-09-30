// 채점 규칙 (요구사항 5번) — 모든 주관식·서술형·빈칸 공통
//  - 대소문자 무시, 문장부호 무시, 앞뒤 공백 제거, 연속 공백 하나로
//  - 축약형 = 원형  (don't = do not, I'm = I am ...)
//  - 정답 여러 개: "/" 로 구분
//  - 한글 답: 띄어쓰기 무시, 복수 뜻 중 하나만 맞아도 정답
//  - 철자 오류는 오답

const PUNCT_RE = /[.,!?;:'"’‘“”…()\[\]{}]/g;
const HYPHEN_RE = /[-–—]/g;   // 하이픈은 공백으로 (well-known = well known)

// 축약형 → 원형 (정규화된 소문자·문장부호 제거 상태에서 적용되므로 아포스트로피 없는 형태로 매칭)
const CONTRACTIONS = [
  [/\bcannot\b/g, 'can not'],
  [/\bcant\b/g, 'can not'],
  [/\bwont\b/g, 'will not'],
  [/\bshant\b/g, 'shall not'],
  [/\b(do|does|did|is|are|was|were|has|have|had|could|would|should|must|need|might|can)nt\b/g, '$1 not'],
  [/\bim\b/g, 'i am'],
  [/\b(you|we|they)re\b/g, '$1 are'],
  [/\b(he|she|it|that|there|here|what|who|where|when|how)s\b/g, '$1 is'],   // it's / he's → is (has 는 문맥상 드묾)
  [/\b(i|you|we|they|he|she|it|that|there|what|who)ll\b/g, '$1 will'],
  [/\b(i|you|we|they|he|she|it|that|there|what|who)d\b/g, '$1 would'],
  [/\b(i|you|we|they|could|would|should|must|might)ve\b/g, '$1 have'],
  [/\blets\b/g, 'let us'],
];

export function normalizeEn(s) {
  if (s == null) return '';
  let t = String(s).toLowerCase().replace(HYPHEN_RE, ' ').replace(PUNCT_RE, '');
  t = t.replace(/\s+/g, ' ').trim();
  for (const [re, rep] of CONTRACTIONS) t = t.replace(re, rep);
  return t.replace(/\s+/g, ' ').trim();
}

export function normalizeKo(s) {
  if (s == null) return '';
  // "~을 더 좋아하다" 의 "~을/~를/~에" 같은 앞 조사 표시는 제거
  return String(s).toLowerCase()
    .replace(/~\s*(을|를|이|가|에게|에|의|와|과|으로|로)?/g, '')
    .replace(HYPHEN_RE, '').replace(PUNCT_RE, '').replace(/[\s~]/g, '').trim();
}

const hasHangul = (s) => /[가-힣]/.test(s || '');

// 정답 문자열을 복수 정답 배열로. 한글 뜻은 "/" 와 "," 모두 구분자로 취급
export function splitAnswers(answer, { korean = false } = {}) {
  const raw = Array.isArray(answer) ? answer.join('/') : String(answer ?? '');
  const parts = raw.split(korean ? /[\/,、]/ : /\//).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : [raw.trim()];
}

// 주관식 채점. answer 는 "a / b" 형태 가능. 한글 정답이면 한글 규칙 적용.
export function gradeText(studentAnswer, answer) {
  const korean = hasHangul(Array.isArray(answer) ? answer.join('') : String(answer ?? ''));
  const stu = korean ? normalizeKo(studentAnswer) : normalizeEn(studentAnswer);
  if (!stu) return false;
  const answers = splitAnswers(answer, { korean });
  return answers.some((a) => (korean ? normalizeKo(a) : normalizeEn(a)) === stu);
}

// 영→한 (뜻 쓰기): 뜻이 "취향, 맛" 처럼 여러 개면 하나만 맞아도 정답
export function gradeMeaning(studentAnswer, koMeaning) {
  const stu = normalizeKo(studentAnswer);
  if (!stu) return false;
  return splitAnswers(koMeaning, { korean: true }).some((m) => {
    const n = normalizeKo(m);
    // "~을 더 좋아하다" 처럼 조사·물결 제거 후 비교, 괄호 안 보조 설명은 제거
    const core = n.replace(/\(.*?\)/g, '');
    return n === stu || core === stu;
  });
}

// 한→영 (영어 쓰기): 영어 규칙
export function gradeWordEn(studentAnswer, en) {
  return gradeText(studentAnswer, en);
}

// 객관식: 번호 비교 (1-based)
const CIRCLED = { '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5', '⑥': '6', '⑦': '7', '⑧': '8' };
const toNum = (v) => String(v ?? '').trim().replace(/[①-⑧]/g, (c) => CIRCLED[c]).replace(/[^0-9]/g, '');
export function gradeChoice(studentChoice, answer) {
  const a = toNum(answer);
  const s = toNum(studentChoice);
  return a !== '' && a === s;
}

// 빈칸 문항: answers 배열(빈칸 순서대로), 학생 답 배열. 모두 맞아야 정답
export function gradeBlanks(studentAnswers, answers) {
  if (!Array.isArray(answers) || !answers.length) return false;
  return answers.every((ans, i) => gradeText(studentAnswers?.[i], ans));
}
