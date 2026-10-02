// 채점 규칙 (요구사항 5번) — 모든 주관식·서술형·빈칸 공통
//  - 대소문자 무시, 문장부호 무시, 앞뒤 공백 제거, 연속 공백 하나로
//  - 축약형 = 원형  (don't = do not, I'm = I am ...)
//  - 정답 여러 개: "/" 로 구분
//  - 한글 답: 띄어쓰기 무시, 복수 뜻 중 하나만 맞아도 정답
//  - 철자 오류는 오답

import { KO_SYNONYM_GROUPS } from './ko_synonyms.js';

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

// 같은 뜻의 표현은 같은 꼴로 (Can you ~? = Could you ~? = Would you ~? 등). 정규화·축약형 복원 뒤에 적용
const EQUIV = [
  [/\b(could|would|will) you\b/g, 'can you'],
  [/\b(could|may) i\b/g, 'can i'],
  [/\b(could|may) we\b/g, 'can we'],
  [/\bwould you like to\b/g, 'do you want to'],
  [/\bwould you like\b/g, 'do you want'],
  [/\b(i|we|you|they) would like to\b/g, '$1 want to'],
  [/\b(i|we|you|they) would like\b/g, '$1 want'],
  [/\b(he|she|it) would like to\b/g, '$1 wants to'],
  [/\b(am|is|are) going to\b/g, 'will'],
  [/\b(have|has) to\b/g, 'must'],
  [/\b(have|has) got to\b/g, 'must'],
  [/\bwhat about\b/g, 'how about'],
  [/\b(lots of|a lot of|plenty of)\b/g, 'many'],
  [/\bthanks\b/g, 'thank you'],
  [/\b(yeah|yep|yes)\b/g, 'yes'],
  [/\b(okay|ok|alright|all right)\b/g, 'ok'],
  [/\bdue to\b/g, 'because of'],
  [/\bin order to\b/g, 'to'],
  [/\b(gonna)\b/g, 'will'],
  [/\bwanna\b/g, 'want to'],
];
export function canonEn(t) {
  let u = t;
  for (const [re, rep] of EQUIV) u = u.replace(re, rep);
  return u.replace(/\s+/g, ' ').trim();
}

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
  if (answers.some((a) => (korean ? normalizeKo(a) : normalizeEn(a)) === stu)) return true;
  // 영어: 같은 뜻의 표현 (Can you = Could you, be going to = will ...) 은 정답
  if (!korean) { const c = canonEn(stu); return answers.some((a) => canonEn(normalizeEn(a)) === c); }
  return false;
}

// ---------- 영→한 (뜻 쓰기) 느슨한 채점 ----------
// 규칙: 정확히 같으면 정답. 아니면 품사(서술형/부사/명사) 가 같고 뜻이 비슷하면(같은 어간 또는 유의어 묶음) 정답 인정 + 정확한 뜻 표시.
//   예) refuse 정답 "~을 거부하다" 에 "거절하다" → 정답 인정, "정확한 뜻: ~을 거부하다" 표시
//       "거절" (명사형) → 품사가 다르므로 오답
const stripParen = (s) => String(s ?? '').replace(/\([^)]*\)/g, '');
const PRED_END = ['스러운', '스럽다', '시키다', '당하다', '로운', '롭다', '하다', '되다', '하는', '되는', '한', '된', '운', '은', '는', '다'];
const ADV_END = ['적으로', '스레', '롭게', '하게', '되게', '히', '게'];
const N_SYL = ['른', '큰', '쁜', '픈', '센', '린', '진', '친', '싼', '짠', '먼', '흰', '긴', '난', '푼', '뜬', '잔', '찬', '단'];
// 어간 + 품사 부류 ('pred' 동사·형용사 | 'adv' 부사 | 'noun' 그 외)
export function koStem(norm) {
  let s = norm;
  for (const e of ADV_END) if (s.length > e.length + 1 && s.endsWith(e)) return [s.slice(0, -e.length).replace(/적$/, ''), 'adv'];
  for (const e of PRED_END) {
    const min = e === '다' || e === '한' || e === '은' || e === '는' ? 1 : 2;
    if (s.length - e.length >= min && s.endsWith(e)) { s = s.slice(0, -e.length).replace(/적$/, ''); return [s, 'pred']; }
  }
  const last = s[s.length - 1];
  if (s.length >= 2 && N_SYL.includes(last)) {   // 다른→다르, 큰→크 (받침 ㄴ 제거)
    const code = last.charCodeAt(0) - 0xac00; const jong = code % 28;
    if (jong === 4) return [s.slice(0, -1) + String.fromCharCode(0xac00 + code - 4), 'pred'];
  }
  return [s.replace(/적$/, ''), 'noun'];
}
let SYN_MAP = null;
function synGroupOf(stem) {
  if (!SYN_MAP) {
    SYN_MAP = new Map();
    const add = (k, gi) => { if (!SYN_MAP.has(k)) SYN_MAP.set(k, new Set()); SYN_MAP.get(k).add(gi); };
    KO_SYNONYM_GROUPS.forEach((g, gi) => g.forEach((w) => { const n = normalizeKo(w); add(n, gi); add(koStem(n)[0], gi); add(n.replace(/(하|되)$/, ''), gi); }));
  }
  return SYN_MAP.get(stem) || null;
}

// 결과: { ok, exact, matched } — matched = 인정된 교과서 뜻 (정확히 표시용)
export function matchMeaning(studentAnswer, koMeaning) {
  const stu = normalizeKo(stripParen(studentAnswer));
  if (!stu) return { ok: false, exact: false, matched: null };
  const meanings = splitAnswers(koMeaning, { korean: true });
  for (const m of meanings) {
    const n = normalizeKo(m); const core = normalizeKo(stripParen(m));
    if (n === stu || core === stu) return { ok: true, exact: true, matched: m };
  }
  const [ss, cs] = koStem(stu);
  for (const m of meanings) {
    const core = normalizeKo(stripParen(m)); if (!core) continue;
    const [sm, cm] = koStem(core);
    if (cs !== cm) continue;                       // 품사가 다르면 인정 안 함
    if (ss === sm) return { ok: true, exact: false, matched: m };
    const ga = synGroupOf(ss), gb = synGroupOf(sm);
    if (ga && gb && [...ga].some((g) => gb.has(g))) return { ok: true, exact: false, matched: m };
  }
  return { ok: false, exact: false, matched: null };
}
export function gradeMeaning(studentAnswer, koMeaning) { return matchMeaning(studentAnswer, koMeaning).ok; }

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
