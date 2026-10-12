import { supabase, rpc, unwrap } from './supabase.js';
import { gradeText, gradeMeaning, matchMeaning, gradeChoice, gradeBlanks } from './grading.js';

export const MATERIALS = [
  { key: 'words', label: '단어장', desc: '영어·뜻·품사·예문·발음' },
  { key: 'word_test', label: '단어테스트', desc: '한→영 / 영→한' },
  { key: 'dialogue', label: '대화문', desc: '원문 + 해석' },
  { key: 'dialogue_blank', label: '대화문 빈칸', desc: '핵심 표현 채우기' },
  { key: 'reading', label: '본문', desc: '문장별 해석 + 듣기' },
  { key: 'reading_analysis', label: '본문분석', desc: '문장별 문법·구문 해설로 복습' },
  { key: 'reading_blank', label: '본문 빈칸시험', desc: '우리말·영문·동사형·어법' },
  { key: 'exam', label: '기출문제', desc: '객관식 + 서술형' },
];
// 학습 순서(위 순서대로 잠금 해제). 각 단계 완료 조건:
//  단어장: "학습 완료" 버튼 · 단어테스트: 테스트 1회 완료 · 대화문/본문: 읽기 확인 통과 · 대화문 빈칸/본문 빈칸: 1회 완료 · 본문분석: 마지막 단락 "학습 완료"
export const STEP_ORDER = MATERIALS.map((m) => m.key);
export const STEP_DONE_HINT = { words: '단어장을 끝까지 보고 "단어장 학습 완료"를 누르면', word_test: '단어테스트를 한 번 끝내면', dialogue: '대화문 읽기 확인을 통과하면', dialogue_blank: '대화문 빈칸을 한 번 끝내면', reading: '본문 읽기 확인을 통과하면', reading_analysis: '본문분석 마지막 단락에서 "학습 완료"를 누르면', reading_blank: '본문 빈칸시험을 한 번 끝내면', exam: '' };
export const myUnitSteps = (unitId) => rpc('my_unit_steps', { p_unit_id: unitId }).then((rows) => new Set((rows || []).map((r) => r.kind)));
export const markStepDone = (unitId, kind, extra = {}) => rpc('log_reading', { p_unit_id: unitId, p_kind: kind, p_event: 'check', p_seconds: 0, p_score: extra.score ?? null, p_total: extra.total ?? null, p_passed: true });
// 어떤 단계가 열렸는지: 앞 단계가 모두 완료돼야 열림 (선생님은 전부)
export const stepUnlocked = (key, done, isTeacher = false) => { if (isTeacher) return true; const i = STEP_ORDER.indexOf(key); return STEP_ORDER.slice(0, i).every((k) => done.has(k)); };

export const materialLabel = (k) => MATERIALS.find((m) => m.key === k)?.label || k;
export const DIFF_LABEL = { w2: '우리말 빈칸', w3: '영문 빈칸', w5: '동사형 연습', w6: '어법 선택', low: '단어 빈칸', mid: '어구 빈칸', high: '문장 영작' };
export const DIFF_DESC = { w2: '영어 문장을 보고 우리말 해석의 빈칸을 채워요', w3: '우리말 해석을 보고 영어 빈칸을 채워요', w5: '괄호 안 동사를 알맞은 형태로 고쳐 써요', w6: '[ ] 안에서 어법에 맞는 것을 골라 써요', low: '문장마다 핵심 단어 1개를 채워요', mid: '2~3단어 어구를 채워요', high: '해석을 보고 문장 전체를 영어로 써요' };
export const DIFF_ORDER = ['w2', 'w3', 'w5', 'w6', 'low', 'mid', 'high'];
export const ITEM_TYPE_LABEL = { word: '단어', dialogue_blank: '대화문 빈칸', reading_blank: '본문 빈칸', exam: '기출·예상문제' };

export const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const today = () => new Date().toISOString().slice(0, 10);
export const dday = (dateStr) => { if (!dateStr) return null; const d = new Date(dateStr + 'T00:00:00'); const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((d - t) / 86400000); };

// ---------- 콘텐츠 조회 ----------
export const listPublishers = () => supabase.from('publishers').select('*').order('sort_order').order('id').then(unwrap);
export const listUnits = (publisherId, grade) => {
  let q = supabase.from('units').select('*, publishers(name, level)').order('grade').order('unit_no');
  if (publisherId) q = q.eq('publisher_id', publisherId);
  if (grade) q = q.eq('grade', grade);
  return q.then(unwrap);
};
export const getUnit = (id) => supabase.from('units').select('*, publishers(name, level)').eq('id', id).single().then(unwrap);
export const listWords = (unitId) => supabase.from('words').select('*').eq('unit_id', unitId).order('sort_order').order('id').then(unwrap);
export const listDialogues = (unitId) => supabase.from('dialogues').select('*, dialogue_lines(*)').eq('unit_id', unitId).order('sort_order').then(unwrap)
  .then((ds) => ds.map((d) => ({ ...d, dialogue_lines: [...(d.dialogue_lines || [])].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id) })));
export const getReading = (unitId) => supabase.from('readings').select('*, reading_sentences(*)').eq('unit_id', unitId).order('sort_order').limit(1).then(unwrap).then((rows) => rows?.[0] || null)
  .then((r) => (r ? { ...r, reading_sentences: [...(r.reading_sentences || [])].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id) } : null));
export const listBlanks = (unitId, source, difficulty) => {
  let q = supabase.from('blank_items').select('*').eq('unit_id', unitId).eq('source', source).order('sort_order').order('id');
  if (difficulty) q = q.eq('difficulty', difficulty);
  return q.then(unwrap);
};
export const getAnalysis = (unitId) => supabase.from('reading_analysis').select('data').eq('unit_id', unitId).maybeSingle().then(({ data, error }) => { if (error) throw new Error(error.message); return data?.data || null; });
export const listExam = (unitId) => supabase.from('exam_questions').select('*').eq('unit_id', unitId).order('year').order('sort_order').order('id').then(unwrap);

// ---------- 기록 ----------
export const recordAttempt = (q, isCorrect, answer, mode) =>
  rpc('record_attempt', { p_item_type: q.item_type, p_item_id: q.item_id, p_unit_id: q.unit_id, p_is_correct: isCorrect, p_answer: answer == null ? null : String(answer), p_mode: mode, p_sub_mode: q.sub_mode || null });

export const listWrongNotes = (status = 'open', { itemType, unitId } = {}) => {
  let q = supabase.from('wrong_notes').select('*, units(unit_no, grade, title, publishers(name, level))').eq('status', status).order('wrong_count', { ascending: false }).order('last_wrong_at', { ascending: false });
  if (itemType) q = q.eq('item_type', itemType);
  if (unitId) q = q.eq('unit_id', unitId);
  return q.then(unwrap);
};
export const countOpenWrong = () => supabase.from('wrong_notes').select('id', { count: 'exact', head: true }).eq('status', 'open').then(({ count, error }) => { if (error) throw new Error(error.message); return count || 0; });

export const myRanges = (profile) => supabase.from('exam_ranges').select('*, exam_range_units(unit_id)').eq('school', profile.school || '').eq('grade', profile.grade || 0).eq('level', profile.level || '중').order('exam_date').then(unwrap);
export const rangeProgress = (rangeId, studentId = null) => rpc('range_progress', { p_range_id: rangeId, p_student_id: studentId });

export const myHomework = (className) => supabase.from('homework').select('*, units(unit_no, grade, title, publishers(name, level)), homework_completions(student_id)').eq('class_name', className || '').gte('due_date', today()).order('due_date').then(unwrap);
export const markHomeworkDone = async (studentId, className, unitId, material, difficulty) => {
  if (!className) return;
  const hws = await supabase.from('homework').select('id, difficulty').eq('class_name', className).eq('unit_id', unitId).eq('material', material).gte('due_date', today()).then(unwrap);
  const rows = hws.filter((h) => !h.difficulty || h.difficulty === difficulty).map((h) => ({ homework_id: h.id, student_id: studentId }));
  if (rows.length) await supabase.from('homework_completions').upsert(rows, { onConflict: 'homework_id,student_id', ignoreDuplicates: true });
};
export const liveForClass = (className) => supabase.from('live_sessions').select('*, units(unit_no, grade, title, publishers(name, level))').eq('class_name', className || '').eq('active', true).order('created_at', { ascending: false }).limit(1).then(unwrap).then((r) => r?.[0] || null);

// ---------- 문제 만들기 (QuizRunner 공용 형식) ----------
//  { key, item_type, item_id, unit_id, sub_mode, kind:'text'|'choice'|'blanks', prompt, hint, choices, answers, answer, explanation, grade(fn) }
export const WORD_MODE_LABEL = { ko2en: '한→영', en2ko: '영→한', syn: '유의어', ant: '반의어', sense: '다의어' };
export const wordExtra = (w) => (w && w.extra && typeof w.extra === 'object') ? { senses: w.extra.senses || [], syn: w.extra.syn || [], ant: w.extra.ant || [] } : { senses: [], syn: [], ant: [] };
export const hasRelation = (w) => { const x = wordExtra(w); return x.syn.length > 0 || x.ant.length > 0; };
export const hasSenses = (w) => wordExtra(w).senses.length >= 2;
const underlineWord = (sentence, en) => {
  const base = en.replace(/[^A-Za-z]/g, ' ').trim().split(/\s+/)[0] || en;
  const stem = (base.length > 4 ? base.slice(0, -1) : base).replace(/[^A-Za-z]/g, '');
  const re = new RegExp('\\b(' + stem + '[A-Za-z]*)', 'i');
  return re.test(sentence) ? sentence.replace(re, '<u>$1</u>') : sentence;
};
// mode: ko2en | en2ko | syn | ant | sense (유의어·반의어·다의어는 extra 가 있는 단어만 문제가 됨)
export function wordQuestions(words, unitId, mode /* ko2en | en2ko | syn | ant | sense | rel(=syn+ant) */) {
  const out = [];
  for (const w of words) {
    const x = wordExtra(w);
    if (mode === 'ko2en') out.push({ key: `word-${w.id}-ko2en`, item_type: 'word', item_id: w.id, unit_id: unitId, sub_mode: 'ko2en', kind: 'text', prompt: w.ko, hint: w.pos, answer: w.en, placeholder: '영어 단어 입력', grade: (a) => gradeText(a, w.en), display: `${w.en} — ${w.ko}` });
    else if (mode === 'en2ko') out.push({ key: `word-${w.id}-en2ko`, item_type: 'word', item_id: w.id, unit_id: unitId, sub_mode: 'en2ko', kind: 'text', prompt: w.en, hint: null, pos: w.pos, speak: w.en, answer: w.ko, placeholder: '뜻 입력 (하나만 써도 됨)', grade: (a) => gradeMeaning(a, w.ko), match: (a) => matchMeaning(a, w.ko), display: `${w.en} — ${w.ko}` });
    else if (mode === 'syn' || mode === 'ant' || mode === 'rel') {
      for (const t of (mode === 'rel' ? ['syn', 'ant'] : [mode])) {
        const list = x[t]; if (!list.length) continue;
        const sense = list[0].sense || w.ko; const ens = list.map((r) => r.en);
        const label = t === 'syn' ? '유의어' : '반의어';
        out.push({ key: `word-${w.id}-${t}`, item_type: 'word', item_id: w.id, unit_id: unitId, sub_mode: t, kind: 'text', prompt: `${w.en}\n${sense} — 이 뜻의 ${label}는?`, hint: null, speak: w.en, answer: list.map((r) => r.en + (r.ko ? ` (${r.ko})` : '')).join(' / '), placeholder: `${label} 영어 입력 (하나만 써도 됨)`, grade: (a) => gradeText(a, ens.join('/')), display: `${w.en} ${label}: ${ens.join(', ')}`, tag: label });
      }
    } else if (mode === 'sense') {
      x.senses.forEach((sn, i) => { if (!sn.ex_en) return;
        out.push({ key: `word-${w.id}-sense-${i}`, item_type: 'word', item_id: w.id, unit_id: unitId, sub_mode: 'sense', kind: 'text', prompt: `${underlineWord(sn.ex_en, w.en)}\n밑줄 친 ${w.en} 의 뜻은? (이 문장에서)`, hint: null, pos: sn.pos, speak: sn.ex_en, answer: sn.ko, explanation: sn.ex_ko ? `해석: ${sn.ex_ko}` : null, placeholder: '뜻 입력', grade: (a) => gradeMeaning(a, sn.ko), match: (a) => matchMeaning(a, sn.ko), display: `${w.en} (${sn.pos || ''}) — ${sn.ko}`, tag: '다의어' });
      });
    }
  }
  return out;
}
export function blankQuestions(items, unitId, source /* dialogue | reading */) {
  return items.map((b) => ({
    key: `${source}-${b.id}`, item_type: source === 'dialogue' ? 'dialogue_blank' : 'reading_blank', item_id: b.id, unit_id: unitId,
    sub_mode: b.difficulty || null, kind: 'blanks', prompt: b.prompt, hint: b.ko, answers: b.answers, explanation: b.explanation || null,
    answer: b.answers.join(' | '), grade: (arr) => gradeBlanks(arr, b.answers), display: b.prompt ? (() => { let i = 0; return b.prompt.replace(/___/g, () => `[${b.answers[i++] ?? ''}]`); })() : b.answers[0],
  }));
}
export function examQuestions(qs, unitId) {
  return qs.map((q) => ({
    key: `exam-${q.id}`, item_type: 'exam', item_id: q.id, unit_id: unitId, sub_mode: q.qtype,
    kind: q.qtype === 'mc' ? 'choice' : 'text', prompt: q.question, choices: q.choices, answer: q.answer, explanation: q.explanation, passageKo: q.passage_ko || null,
    tag: [q.school, q.year, q.term].filter(Boolean).join(' '), placeholder: '답 입력',
    grade: (a) => (q.qtype === 'mc' ? gradeChoice(a, q.answer) : gradeText(a, q.answer)), display: q.question.replace(/<\/?u>/g, '').slice(0, 60),
  }));
}

// 오답노트 항목들 → 문제로 복원
export async function questionsFromWrongNotes(notes) {
  const byType = (t) => notes.filter((n) => n.item_type === t);
  const out = [];
  const wIds = byType('word').map((n) => n.item_id);
  if (wIds.length) {
    const words = await supabase.from('words').select('*').in('id', wIds).then(unwrap);
    for (const n of byType('word')) { const w = words.find((x) => x.id === n.item_id); if (w) out.push(...wordQuestions([w], w.unit_id, n.sub_mode || 'ko2en')); }
  }
  const bIds = [...byType('dialogue_blank'), ...byType('reading_blank')].map((n) => n.item_id);
  if (bIds.length) {
    const blanks = await supabase.from('blank_items').select('*').in('id', bIds).then(unwrap);
    for (const b of blanks) out.push(...blankQuestions([b], b.unit_id, b.source));
  }
  const eIds = byType('exam').map((n) => n.item_id);
  if (eIds.length) {
    const qs = await supabase.from('exam_questions').select('*').in('id', eIds).then(unwrap);
    for (const q of qs) out.push(...examQuestions([q], q.unit_id));
  }
  // 오답노트 순서 유지
  const order = new Map(notes.map((n, i) => [`${n.item_type}-${n.item_id}-${n.sub_mode || ''}`, i]));
  const keyOf = (q) => `${q.item_type}-${q.item_id}-${q.sub_mode || ''}`;
  return out.sort((a, b) => (order.get(keyOf(a)) ?? 0) - (order.get(keyOf(b)) ?? 0));
}

// ---------- 읽기 확인 (대화문·본문을 읽었는지) ----------
export const logReading = (unitId, kind, event, { seconds = 0, score = null, total = null, passed = null } = {}) =>
  rpc('log_reading', { p_unit_id: unitId, p_kind: kind, p_event: event, p_seconds: Math.round(seconds), p_score: score, p_total: total, p_passed: passed });
export const myReadingStatus = (unitId) => rpc('my_reading_status', { p_unit_id: unitId }).then((rows) => Object.fromEntries((rows || []).map((r) => [r.kind, r])));
export const rangeReading = (rangeId, studentId = null) => rpc('range_reading', { p_range_id: rangeId, p_student_id: studentId });
export const READ_CHECK_N = 5;            // 읽기 확인 문항 수
export const readCheckPass = (score, total) => total === 0 || score >= Math.ceil(total * 0.8);   // 80% 이상 통과
// 읽기 확인 문제 만들기: tf = [{q,a}] (본문분석 T/F), blanks = blank_items (빈칸 → 4지선다)
export function buildReadCheck({ tf = [], blanks = [] }, n = READ_CHECK_N) {
  const out = [];
  for (const t of shuffle(tf)) out.push({ kind: 'tf', prompt: t.q, choices: ['T  (본문 내용과 일치)', 'F  (일치하지 않음)'], answer: t.a === 'T' ? 0 : 1 });
  const pool = blanks.filter((b) => b.prompt && b.answers?.length);
  const allAns = [...new Set(pool.flatMap((b) => b.answers))];
  const wc = (x) => x.trim().split(/\s+/).length;
  for (const b of shuffle(pool)) {
    // 빈칸이 여러 개면 하나만 남기고 나머지는 채워서 보여줌
    const keep = Math.floor(Math.random() * b.answers.length); const correct = b.answers[keep]; let k = 0;
    const prompt = b.prompt.replace(/___/g, () => (k++ === keep ? '______' : b.answers[k - 1] ?? ''));
    const same = allAns.filter((a) => a !== correct && !b.answers.includes(a) && wc(a) === wc(correct));
    const other = allAns.filter((a) => a !== correct && !b.answers.includes(a) && wc(a) !== wc(correct));
    const dis = [...shuffle(same), ...shuffle(other)].slice(0, 3);   // 단어 수가 같은 것을 먼저 고름
    if (dis.length < 2) continue;
    const choices = shuffle([correct, ...dis]);
    out.push({ kind: 'blank', prompt, choices, answer: choices.indexOf(correct) });
  }
  // T/F 와 빈칸을 섞되 T/F 우선
  const tfs = out.filter((q) => q.kind === 'tf'), bls = out.filter((q) => q.kind === 'blank');
  return [...tfs.slice(0, n), ...bls].slice(0, n);
}

// ---------- 기출 제출 기록 (1차 75점, 2차 80점 …) ----------
export const recordExamSession = (unitId, term, qtype, total, correct) => rpc('record_exam_session', { p_unit_id: unitId, p_term: term || null, p_qtype: qtype || null, p_total: total, p_correct: correct });
export const myExamSessions = (unitId) => supabase.from('exam_sessions').select('*').eq('unit_id', unitId).order('created_at').then(unwrap);
export const examSessionsOf = (studentId) => supabase.from('exam_sessions').select('*, units(unit_no, grade, title, publishers(name, level))').eq('student_id', studentId).order('created_at').then(unwrap);
export const examSessionsForRange = (rangeId) => supabase.from('exam_range_units').select('unit_id').eq('range_id', rangeId).then(unwrap)
  .then((us) => us.length ? supabase.from('exam_sessions').select('student_id, unit_id, term, qtype, score, attempt_no, created_at').in('unit_id', us.map((u) => u.unit_id)).order('created_at').then(unwrap) : []);
export const ordinal = (n) => `${n}차`;
export const termShort = (t) => String(t || '').replace(/^예상문제\s*/, '') || '전체';

// ---------- CSV ----------
export function downloadCsv(filename, rows) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
