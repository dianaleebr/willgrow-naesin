import { useEffect, useState } from 'react';
import { supabase, rpc } from '../../lib/supabase.js';
import { ITEM_TYPE_LABEL, DIFF_LABEL } from '../../lib/api.js';
import { useAsync, Loading, ErrorBox, RichText } from '../../components/ui.jsx';

/**
 * 오답 복습(틀린 이유 보기): 오답노트 항목을 한 문제씩 넘기며
 *  문제 전체 · 내가 쓴 답 · 정답 · 틀린 이유(해설) · 지문 전체 해석 · 내 오답 정리(메모) 를 보여준다.
 *  notes: wrong_notes 행 배열 (units 조인 포함)
 */
export default function WrongReview({ notes, onExit }) {
  const [i, setI] = useState(0);
  const st = useAsync(() => loadAll(notes), [notes]);
  useEffect(() => { window.scrollTo(0, 0); }, [i]);
  if (st.loading) return <Loading />; if (st.error) return <ErrorBox error={st.error} />;
  const items = st.data; const n = items.length; const it = items[i];
  if (!it) return <div className="card soft center muted">볼 오답이 없어요.</div>;
  const go = (d) => setI((k) => Math.min(Math.max(k + d, 0), n - 1));
  return (
    <div className="stack">
      <div className="quiz-top">
        <span>틀린 이유 보기</span>
        <span><b className="en">{i + 1}</b> / {n}</span>
      </div>
      <div className="bar"><i style={{ width: `${((i + 1) / n) * 100}%` }} /></div>
      <ReviewCard it={it} />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn" disabled={i === 0} onClick={() => go(-1)}>‹ 이전</button>
        <button className="btn ghost sm" onClick={onExit}>목록으로</button>
        {i + 1 < n ? <button className="btn primary" onClick={() => go(1)}>다음 ›</button> : <button className="btn primary" onClick={onExit}>끝내기</button>}
      </div>
    </div>
  );
}

// 오답노트 행들 → 복습 카드 데이터 (문항 본문 + 마지막으로 틀린 내 답)
async function loadAll(notes) {
  const byType = (t) => notes.filter((x) => x.item_type === t);
  const ids = (t) => byType(t).map((x) => x.item_id);
  const [words, blanks, exams, attempts] = await Promise.all([
    ids('word').length ? supabase.from('words').select('id, en, ko, pos, example').in('id', ids('word')).then(unwrap) : [],
    [...ids('dialogue_blank'), ...ids('reading_blank')].length ? supabase.from('blank_items').select('id, source, prompt, answers, ko, explanation, difficulty').in('id', [...ids('dialogue_blank'), ...ids('reading_blank')]).then(unwrap) : [],
    ids('exam').length ? supabase.from('exam_questions').select('id, question, choices, answer, explanation, qtype, passage_ko, school, year, term').in('id', ids('exam')).then(unwrap) : [],
    supabase.from('attempts').select('item_type, item_id, sub_mode, student_answer, created_at').eq('is_correct', false).in('item_id', notes.map((x) => x.item_id)).order('created_at', { ascending: false }).limit(2000).then(unwrap),
  ]);
  const myAns = new Map();
  for (const a of attempts) { const k = `${a.item_type}-${a.item_id}-${a.sub_mode || ''}`; if (!myAns.has(k)) myAns.set(k, a.student_answer); }
  const out = [];
  for (const nt of notes) {
    const key = `${nt.item_type}-${nt.item_id}-${nt.sub_mode || ''}`;
    const base = { note: nt, myAnswer: myAns.get(key) ?? myAns.get(`${nt.item_type}-${nt.item_id}-`) ?? null };
    if (nt.item_type === 'word') { const w = words.find((x) => x.id === nt.item_id); if (w) out.push({ ...base, kind: 'word', w }); continue; }
    if (nt.item_type === 'exam') { const q = exams.find((x) => x.id === nt.item_id); if (q) out.push({ ...base, kind: 'exam', q }); continue; }
    const b = blanks.find((x) => x.id === nt.item_id); if (b) out.push({ ...base, kind: 'blank', b });
  }
  return out;
}
const unwrap = ({ data, error }) => { if (error) throw new Error(error.message); return data || []; };

function ReviewCard({ it }) {
  const { note } = it;
  const u = note.units;
  const label = `${ITEM_TYPE_LABEL[note.item_type]}${note.item_type === 'reading_blank' && note.sub_mode ? ` · ${DIFF_LABEL[note.sub_mode] || note.sub_mode}` : ''}${note.item_type === 'word' && note.sub_mode ? ` · ${note.sub_mode === 'ko2en' ? '한→영' : '영→한'}` : ''}`;
  return (
    <div className="stack">
      <div className="row"><span className="badge">{label}</span>{u && <span className="muted small">중{u.grade} L{u.unit_no}{u.title ? ` ${u.title}` : ''}</span>}<span className="red small" style={{ marginLeft: 'auto' }}>{note.wrong_count}회 틀림</span></div>
      {it.kind === 'exam' && <ExamBody it={it} />}
      {it.kind === 'blank' && <BlankBody it={it} />}
      {it.kind === 'word' && <WordBody it={it} />}
      <Memo note={note} />
    </div>
  );
}

function Section({ title, color, children }) {
  return (
    <div className="card" style={{ padding: '12px 14px', borderLeft: `4px solid ${color || 'var(--line, #ddd)'}` }}>
      <div className="muted small" style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function ExamBody({ it }) {
  const { q, myAnswer } = it;
  const hasPassage = q.question.startsWith('[지문]') && q.question.includes('\n\n');
  const passage = hasPassage ? q.question.slice(4, q.question.indexOf('\n\n')).trim() : '';
  const rest = hasPassage ? q.question.slice(q.question.indexOf('\n\n') + 2) : q.question;
  const [stem, ...extra] = rest.split('\n');
  const tag = [q.school, q.year, q.term].filter(Boolean).join(' ');
  const correct = q.qtype === 'mc' ? `${q.answer}번 — ${plain(q.choices?.[Number(q.answer) - 1] ?? '')}` : q.answer;
  const mine = myAnswer == null ? null : (q.qtype === 'mc' ? `${myAnswer}번 — ${plain(q.choices?.[Number(myAnswer) - 1] ?? '')}` : myAnswer);
  return (
    <>
      {tag && <div className="muted small">{tag}</div>}
      {passage && <div className="card soft en" style={{ fontSize: 15, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}><RichText text={passage} /></div>}
      <div className="quiz-q" style={{ fontSize: 18 }}><RichText text={stem} /></div>
      {extra.length > 0 && <div className="en" style={{ fontSize: 15, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}><RichText text={extra.join('\n')} /></div>}
      {q.qtype === 'mc' && q.choices && (
        <div className="choices">
          {q.choices.map((c, k) => { const num = k + 1; let cls = 'choice'; if (String(num) === String(q.answer)) cls += ' correct'; else if (myAnswer != null && String(num) === String(myAnswer)) cls += ' wrong'; return <div key={k} className={cls}><span className="n">{num}</span><span><RichText text={c} /></span></div>; })}
        </div>
      )}
      <Section title="내가 쓴 답 → 정답" color="var(--red)">
        <div>{mine != null ? <span className="red en" style={{ textDecoration: 'line-through' }}>{mine}</span> : <span className="muted">(기록 없음)</span>} <span className="muted">→</span> <b className="green en" style={{ whiteSpace: 'pre-wrap' }}>{correct}</b></div>
      </Section>
      <Section title="틀린 이유 (해설)" color="var(--green)">
        {q.explanation ? <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{q.explanation}</div> : <div className="muted">해설이 없는 문제예요. 정답과 지문 해석을 보고 이유를 직접 정리해 보세요.</div>}
      </Section>
      {q.passage_ko && (
        <Section title="지문 전체 해석" color="var(--blue, #3b82f6)">
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{q.passage_ko}</div>
        </Section>
      )}
    </>
  );
}

function BlankBody({ it }) {
  const { b, myAnswer } = it;
  let k = 0;
  const filled = b.prompt ? b.prompt.replace(/___/g, () => `[${b.answers[k++] ?? ''}]`) : b.answers[0];
  const [hintMain, hintBlank] = String(b.ko || '').split(' · 빈칸: ');
  const korean = /[가-힣]/.test(b.prompt || '');
  return (
    <>
      <div className={`card soft ${korean ? '' : 'en'}`} style={{ fontSize: 16, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{b.prompt || `[영작] ${b.ko}`}</div>
      <Section title="내가 쓴 답 → 정답" color="var(--red)">
        <div>{myAnswer ? <span className="red en" style={{ textDecoration: 'line-through' }}>{myAnswer}</span> : <span className="muted">(기록 없음)</span>} <span className="muted">→</span> <b className="green en">{b.answers.join(' / ')}</b></div>
        <div className="en small" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{filled}</div>
      </Section>
      <Section title="틀린 이유 (해설)" color="var(--green)">
        {b.explanation ? <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{b.explanation}</div> : <div className="muted">해설이 없는 문항이에요. 아래 해석과 정답 문장을 비교해 보세요.</div>}
        {hintBlank && <div className="small" style={{ marginTop: 4, color: 'var(--red)' }}>빈칸 힌트: {hintBlank}</div>}
      </Section>
      {hintMain && !korean && (
        <Section title="문장 해석" color="var(--blue, #3b82f6)">
          <div style={{ lineHeight: 1.7 }}>{hintMain}</div>
        </Section>
      )}
    </>
  );
}

function WordBody({ it }) {
  const { w, myAnswer, note } = it;
  const ko2en = note.sub_mode === 'ko2en';
  return (
    <>
      <div className="card soft" style={{ fontSize: 20, fontWeight: 700 }}>{ko2en ? w.ko : <span className="en">{w.en}</span>}{w.pos && <span className="muted small" style={{ marginLeft: 8, fontWeight: 400 }}>{w.pos}</span>}</div>
      <Section title="내가 쓴 답 → 정답" color="var(--red)">
        <div>{myAnswer ? <span className="red en" style={{ textDecoration: 'line-through' }}>{myAnswer}</span> : <span className="muted">(기록 없음)</span>} <span className="muted">→</span> <b className="green en">{ko2en ? w.en : w.ko}</b></div>
      </Section>
      <Section title="단어 정리" color="var(--green)">
        <div><b className="en">{w.en}</b> — {w.ko}</div>
        {w.example && <div className="en small muted" style={{ marginTop: 4 }}>{w.example}</div>}
      </Section>
    </>
  );
}

// 학생이 직접 쓰는 오답 정리 (서버 저장)
function Memo({ note }) {
  const [v, setV] = useState(note.memo || '');
  const [saved, setSaved] = useState(null);
  useEffect(() => { setV(note.memo || ''); setSaved(null); }, [note.id]);
  const save = async () => {
    try { await rpc('set_wrong_note_memo', { p_id: note.id, p_memo: v }); note.memo = v; setSaved('저장됨'); }
    catch (e) { setSaved('저장 실패: ' + e.message); }
  };
  return (
    <Section title="내 오답노트 (왜 틀렸는지, 외울 것 적기)" color="var(--yellow, #f59e0b)">
      <textarea className="input" rows={3} value={v} onChange={(e) => { setV(e.target.value); setSaved(null); }} placeholder="예) 주어가 3인칭 단수라서 동사에 -s 붙여야 함 / 'spill the beans' = 비밀을 말하다" />
      <div className="row" style={{ marginTop: 6, alignItems: 'center' }}>
        <button className="btn sm primary" onClick={save} disabled={v === (note.memo || '')}>메모 저장</button>
        {saved && <span className={`small ${saved.startsWith('저장됨') ? 'green' : 'red'}`}>{saved}</span>}
      </div>
    </Section>
  );
}

const plain = (s) => String(s || '').replace(/<\/?u>/g, '');
