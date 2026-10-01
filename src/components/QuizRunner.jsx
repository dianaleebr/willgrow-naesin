import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { recordAttempt, markHomeworkDone } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { TtsButton, RichText, plainText } from './ui.jsx';
import { speak } from '../lib/tts.js';

/**
 * 공용 퀴즈 실행기
 *  questions : api.js 의 *Questions() 가 만든 배열
 *  mode      : homework | class | retry
 *  homework  : { unitId, material, difficulty } — 완료 시 숙제 완료 처리
 *  onExit    : 결과화면에서 "돌아가기"
 */
// 중간 저장 (학생별·시험별, 이 기기 브라우저에 보관)
const saveKeyOf = (profile, title, homework) => `naesin-save:${profile?.id || 'anon'}:${homework ? `${homework.unitId}:${homework.material}:${homework.difficulty || ''}` : `t:${title}`}`;
const loadSave = (key) => { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v && Array.isArray(v.order) ? v : null; } catch { return null; } };
const writeSave = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } };
const clearSave = (key) => { try { localStorage.removeItem(key); } catch { /* ignore */ } };

export default function QuizRunner({ questions: initialQuestions, mode = 'homework', title, homework, onExit }) {
  const { profile } = useAuth();
  const saveKey = saveKeyOf(profile, title, homework);
  const [pending, setPending] = useState(() => {   // 저장된 진행이 있으면 이어서 풀지 물어봄
    const sv = loadSave(saveKey); if (!sv || !sv.order.length) return null;
    const keys = new Set(initialQuestions.map((q) => q.key));
    if (!sv.order.every((k) => keys.has(k)) || sv.idx >= sv.order.length) { clearSave(saveKey); return null; }
    return sv;
  });
  const [questions, setQuestions] = useState(initialQuestions);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState([]); // {q, correct, answer}
  const [phase, setPhase] = useState('answer'); // answer | feedback | done
  const [text, setText] = useState('');
  const [blanks, setBlanks] = useState([]);
  const [choice, setChoice] = useState(null);
  const [lastCorrect, setLastCorrect] = useState(null);
  const inputRef = useRef(null);
  const q = questions[idx];

  useEffect(() => {
    setText(''); setBlanks(q?.answers ? q.answers.map(() => '') : []); setChoice(null); setPhase('answer');
    setTimeout(() => inputRef.current?.focus(), 50);
    if (q?.speak) speak(q.speak);
  }, [idx, q]);

  useEffect(() => {
    if (phase === 'done' && homework && profile) {
      markHomeworkDone(profile.id, profile.class_name, homework.unitId, homework.material, homework.difficulty).catch(() => {});
    }
  }, [phase]); // eslint-disable-line

  const resume = () => {
    const byKey = new Map(initialQuestions.map((q) => [q.key, q]));
    const ordered = pending.order.map((k) => byKey.get(k));
    setQuestions(ordered);
    setResults(pending.results.map((r) => ({ q: byKey.get(r.key), correct: r.correct, answer: r.answer })).filter((r) => r.q));
    setIdx(pending.idx); setPending(null);
  };
  const restart = () => { clearSave(saveKey); setPending(null); };
  const saveAndExit = () => {
    // 지금 문제까지의 결과를 저장 (답을 쓰던 문제는 다시 품)
    const doneIdx = phase === 'feedback' ? idx + 1 : idx;
    if (doneIdx >= questions.length) { clearSave(saveKey); onExit?.(); return; }
    writeSave(saveKey, { order: questions.map((q) => q.key), idx: doneIdx, results: results.map((r) => ({ key: r.q.key, correct: r.correct, answer: r.answer })), title, savedAt: Date.now() });
    onExit?.();
  };

  if (!questions.length) return <div className="card soft center muted">풀 문제가 없습니다.</div>;
  if (pending) return (
    <div className="card stack center">
      <b>저장된 진행이 있어요</b>
      <div className="muted small">{title} · {pending.idx} / {pending.order.length}문제까지 풀었어요{pending.savedAt ? ` (${new Date(pending.savedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })})` : ''}</div>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn primary" onClick={resume}>이어서 풀기</button>
        <button className="btn" onClick={restart}>처음부터</button>
      </div>
    </div>
  );

  const submit = async () => {
    if (phase !== 'answer') return;
    let ans; let ok;
    if (q.kind === 'choice') { if (choice == null) return; ans = choice; ok = q.grade(choice); }
    else if (q.kind === 'blanks') { if (blanks.every((b) => !b.trim())) return; ans = blanks.join(' | '); ok = q.grade(blanks); }
    else { if (!text.trim()) return; ans = text; ok = q.grade(text); }
    setLastCorrect(ok); setPhase('feedback');
    setResults((r) => [...r, { q, correct: ok, answer: ans }]);
    recordAttempt(q, ok, ans, mode).catch((e) => console.warn('record fail', e));
  };
  const next = () => { if (idx + 1 < questions.length) setIdx(idx + 1); else { clearSave(saveKey); setPhase('done'); } };
  const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); phase === 'answer' ? submit() : next(); } };

  if (phase === 'done') return <ResultScreen title={title} results={results} mode={mode} onExit={onExit} homework={homework} />;

  const n = questions.length;
  const correctSoFar = results.filter((r) => r.correct).length;

  return (
    <div>
      <div className="quiz-top">
        <span>{title}</span>
        <span><b className="en">{idx + 1}</b> / {n} · <span className="green">✓{correctSoFar}</span> <span className="red">✗{results.length - correctSoFar}</span></span>
      </div>
      <div className="bar mb"><i style={{ width: `${(idx / n) * 100}%` }} /></div>
      {q.tag && <span className="badge">{q.tag}</span>}

      {q.kind === 'blanks' ? (
        <BlankPrompt q={q} values={blanks} setValues={setBlanks} disabled={phase !== 'answer'} onKey={onKey} inputRef={inputRef} />
      ) : (
        <>
          <QuestionText prompt={q.prompt} speak={q.speak} />
          {q.hint && <div className="quiz-hint">{q.hint}</div>}
        </>
      )}

      {q.kind === 'choice' && (
        <div className="choices">
          {(q.choices || []).map((c, i) => {
            const num = i + 1; let cls = 'choice';
            if (phase === 'answer' && choice === num) cls += ' selected';
            if (phase === 'feedback') { if (q.grade(num)) cls += ' correct'; else if (choice === num) cls += ' wrong'; }
            return <button key={i} type="button" className={cls} disabled={phase !== 'answer'} onClick={() => setChoice(num)}><span className="n">{num}</span><span><RichText text={c} /></span></button>;
          })}
        </div>
      )}
      {q.kind === 'text' && (
        <input ref={inputRef} className="input" style={{ fontSize: 18 }} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey}
          placeholder={q.placeholder || '답 입력'} disabled={phase !== 'answer'} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      )}

      {phase === 'feedback' && (
        <div className={`feedback ${lastCorrect ? 'ok' : 'no'}`}>
          <b>{lastCorrect ? '정답' : '오답'}</b>
          {!lastCorrect && <div className="mt" style={{ marginTop: 6 }}>정답: <b className="en">{q.kind === 'choice' ? `${q.answer}번 — ${plainText(q.choices?.[Number(q.answer) - 1] ?? '')}` : q.answer}</b></div>}
          {q.explanation && <div className="muted small" style={{ marginTop: 4 }}>{q.explanation}</div>}
          {!lastCorrect && q.passageKo && <PassageKo text={q.passageKo} />}
        </div>
      )}

      <div className="row mt" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" className="btn sm ghost" onClick={saveAndExit}>저장하고 나가기</button>
        {phase === 'answer'
          ? <button className="btn primary lg" onClick={submit}>확인</button>
          : <button className="btn primary lg" onClick={next} autoFocus>{idx + 1 < n ? '다음 →' : '결과 보기'}</button>}
      </div>
    </div>
  );
}

// 기출/예상문제: "[지문] ...\n\n발문\n부가자료" 형태를 보기 좋게
function QuestionText({ prompt, speak }) {
  const p = String(prompt || '');
  if (!p.startsWith('[지문]') && !p.includes('\n')) {
    return <div className={`quiz-q ${/[A-Za-z]/.test(p) && !/[가-힣]/.test(p) ? 'en' : ''}`}><RichText text={p} /> {speak && <TtsButton text={speak} />}</div>;
  }
  let passage = null; let rest = p;
  if (p.startsWith('[지문]')) { const i = p.indexOf('\n\n'); passage = (i > 0 ? p.slice(4, i) : p.slice(4)).trim(); rest = i > 0 ? p.slice(i + 2) : ''; }
  const [stem, ...extra] = rest.split('\n');
  return (
    <div>
      {passage && <div className="card soft en" style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 10, whiteSpace: 'pre-wrap' }}><RichText text={passage} /></div>}
      <div className="quiz-q" style={{ fontSize: 18 }}><RichText text={stem} /></div>
      {extra.length > 0 && <div className="en" style={{ fontSize: 16, lineHeight: 1.6, margin: '4px 0 8px', whiteSpace: 'pre-wrap' }}><RichText text={extra.join('\n')} /></div>}
    </div>
  );
}

function BlankPrompt({ q, values, setValues, disabled, onKey, inputRef }) {
  const full = !q.prompt; // 상: 문장 전체 영작
  const parts = useMemo(() => (q.prompt || '').split('___'), [q.prompt]);
  const set = (i, v) => setValues((arr) => arr.map((x, k) => (k === i ? v : x)));
  const koPrompt = /[가-힣]/.test(q.prompt || '');
  // 힌트: "해석 · 빈칸: 어떤 / 가장" 형태면 빈칸 힌트를 따로 보여줌
  const [hintMain, hintBlank] = String(q.hint || '').split(' · 빈칸: ');
  const width = (i) => { const len = (q.answers?.[i] || '').length; return Math.min(Math.max(90, len * 12 + 36), 360); };
  return (
    <div className="stack" style={{ gap: 12 }}>
      {q.hint && (
        <div className="card soft" style={{ padding: '10px 14px' }}>
          <div className="muted small" style={{ marginBottom: 2 }}>{full ? '다음 문장을 영어로 쓰세요' : (koPrompt ? '영어 문장' : '해석')}</div>
          <div className={koPrompt ? 'en' : ''} style={{ fontSize: 16, lineHeight: 1.6 }}>{hintMain}</div>
          {hintBlank && <div style={{ marginTop: 6, fontSize: 14, color: 'var(--red)' }}>빈칸 힌트: {hintBlank}</div>}
        </div>
      )}
      {full ? (
        <textarea ref={inputRef} className="input en" style={{ fontSize: 18 }} rows={2} value={values[0] || ''} onChange={(e) => set(0, e.target.value)}
          onKeyDown={onKey} placeholder="영어 문장 전체를 입력" disabled={disabled} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      ) : (
        <div className={`blank-line ${koPrompt ? '' : 'en'}`} style={{ lineHeight: 2.4, whiteSpace: 'pre-wrap', padding: '4px 0' }}>
          {parts.map((p, i) => (
            <span key={i}>{p}{i < parts.length - 1 && (
              <input ref={i === 0 ? inputRef : null} className="blank-input" style={{ width: width(i) }} value={values[i] || ''} onChange={(e) => set(i, e.target.value)} onKeyDown={onKey}
                disabled={disabled} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
            )}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ResultScreen({ title, results, mode, onExit, homework }) {
  const nav = useNavigate();
  const [retry, setRetry] = useState(null);
  const wrong = results.filter((r) => !r.correct);
  const score = results.length ? Math.round((results.length - wrong.length) / results.length * 100) : 0;
  if (retry) return <QuizRunner questions={retry} mode="retry" title={`${title} · 오답 다시 풀기`} onExit={onExit} />;
  return (
    <div className="stack">
      <div className="card center">
        <img src={`${import.meta.env.BASE_URL || '/'}w-symbol.png`} alt="" style={{ width: 48 }} />
        <div className="muted">{title}{mode === 'retry' ? ' (오답 재풀이)' : ''}</div>
        <div className={`score ${score >= 80 ? 'green' : 'red'}`}>{score}점</div>
        <div>{results.length}문제 중 <b className="green">{results.length - wrong.length}개 정답</b>, <b className="red">{wrong.length}개 오답</b></div>
        {wrong.length > 0 && <div className="muted small mt">틀린 문제는 오답노트에 자동 저장되었어요.</div>}
        {homework && <div className="badge green mt">숙제 완료 처리됨</div>}
      </div>
      <div className="row">
        {wrong.length > 0 && <button className="btn primary grow lg" onClick={() => setRetry(wrong.map((w) => w.q))}>틀린 문제만 바로 다시 풀기 ({wrong.length})</button>}
        <button className="btn grow lg" onClick={() => (onExit ? onExit() : nav(-1))}>돌아가기</button>
      </div>
      <div className="list result-list">
        {results.map((r, i) => (
          <div key={i} className={`item ${r.correct ? '' : 'wrong'}`}>
            <span className={r.correct ? "green" : "red"} style={{ fontWeight: 700, width: 18 }}>{r.correct ? "O" : "X"}</span>
            <div className="grow">
              <div className="en"><RichText text={r.q.display || r.q.prompt} /></div>
              {!r.correct && <div className="small"><span className="muted">내 답: </span><span className="red">{String(r.answer)}</span> <span className="muted">/ 정답: </span><b className="green">{r.q.kind === 'choice' ? `${r.q.answer}번` : r.q.answer}</b></div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 틀린 기출문제의 지문 해석 (오답노트에서도 사용)
export function PassageKo({ text, open: init = false }) {
  const [open, setOpen] = useState(init);
  if (!text) return null;
  return (
    <div className="passage-ko" style={{ marginTop: 8, borderTop: '1px dashed var(--line, #ddd)', paddingTop: 6 }}>
      <button type="button" className="btn sm ghost" onClick={() => setOpen((v) => !v)}>{open ? '지문 해석 닫기' : '지문 해석 보기'}</button>
      {open && <div className="small" style={{ marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{text}</div>}
    </div>
  );
}
