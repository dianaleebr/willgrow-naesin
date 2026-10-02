import { useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { getUnit, listWords, listDialogues, getReading, listBlanks, listExam, wordQuestions, blankQuestions, examQuestions, shuffle, DIFF_LABEL, DIFF_DESC, DIFF_ORDER, listWrongNotes, questionsFromWrongNotes } from '../../lib/api.js';
import { useAsync, Loading, ErrorBox, Empty, TtsButton, Toggle, gradeLabel } from '../../components/ui.jsx';
import QuizRunner from '../../components/QuizRunner.jsx';

function Head({ unit, title }) {
  return <div className="mb"><div className="muted small">{unit?.publishers?.name} · {gradeLabel(unit)} · {unit?.unit_no >= 90 ? '' : `Lesson ${unit?.unit_no} `}{unit?.title}</div><h1>{title}</h1></div>;
}
const useMode = () => { const [sp] = useSearchParams(); return sp.get('mode') === 'class' ? 'class' : 'homework'; };

// ① 단어장
export function Words() {
  const { unitId } = useParams();
  const st = useAsync(async () => ({ unit: await getUnit(unitId), words: await listWords(unitId) }), [unitId]);
  const [hide, setHide] = useState('none');
  if (st.loading) return <Loading />; if (st.error) return <ErrorBox error={st.error} />;
  const { unit, words } = st.data;
  return (
    <div>
      <Head unit={unit} title="단어장" />
      <div className="row between mb"><span className="muted">{words.length}개</span>
        <Toggle value={hide} onChange={setHide} options={[{ value: 'none', label: '모두 보기' }, { value: 'ko', label: '뜻 가리기' }, { value: 'en', label: '영어 가리기' }]} /></div>
      {words.length === 0 && <Empty>등록된 단어가 없어요.</Empty>}
      {words.map((w) => (
        <div key={w.id} className="word-row">
          <div>
            <div className="en">{hide === 'en' ? <Blur>{w.en}</Blur> : w.en}<span className="pos">{w.pos}{w.category ? ` · ${w.category}` : ''}</span></div>
            <div>{hide === 'ko' ? <Blur>{w.ko}</Blur> : w.ko}</div>
            {w.example && <div className="ex">{w.example}</div>}
          </div>
          <TtsButton text={w.en} />
        </div>
      ))}
    </div>
  );
}
function Blur({ children }) { const [show, setShow] = useState(false); return <span onClick={() => setShow(!show)} style={{ cursor: 'pointer', filter: show ? 'none' : 'blur(6px)', userSelect: 'none' }}>{children}</span>; }

// ② 단어테스트
export function WordTest() {
  const { unitId } = useParams(); const nav = useNavigate(); const mode = useMode();
  const st = useAsync(async () => ({ unit: await getUnit(unitId), words: await listWords(unitId) }), [unitId]);
  const [dir, setDir] = useState('ko2en'); const [count, setCount] = useState(10); const [qs, setQs] = useState(null);
  if (st.loading) return <Loading />; if (st.error) return <ErrorBox error={st.error} />;
  const { unit, words } = st.data;
  if (qs) return <QuizRunner questions={qs} mode={mode} title={`단어테스트 (${dir === 'ko2en' ? '한→영' : '영→한'})`} homework={{ unitId: Number(unitId), material: 'word_test' }} onExit={() => setQs(null)} />;
  const start = () => { const pick = shuffle(words).slice(0, count === 'all' ? words.length : count); setQs(wordQuestions(pick, Number(unitId), dir)); };
  return (
    <div className="stack">
      <Head unit={unit} title="단어테스트" />
      {words.length === 0 ? <Empty>등록된 단어가 없어요.</Empty> : (<>
        <div className="card stack">
          <div><label className="field">모드</label><Toggle value={dir} onChange={setDir} options={[{ value: 'ko2en', label: '한→영 (영어 쓰기)' }, { value: 'en2ko', label: '영→한 (뜻 쓰기)' }]} /></div>
          <div><label className="field">문항 수 (전체 {words.length}개)</label><Toggle value={count} onChange={setCount} options={[{ value: 10, label: '10' }, { value: 20, label: '20' }, { value: 'all', label: '전체' }]} /></div>
          <div className="muted small">문항 순서는 매번 랜덤. 대소문자·문장부호는 채점에 영향 없음. 틀린 단어는 오답노트에 저장돼요.</div>
        </div>
        <button className="btn primary lg block" onClick={start}>시작하기</button>
      </>)}
    </div>
  );
}

// ③ 대화문
export function Dialogue() {
  const { unitId } = useParams();
  const st = useAsync(async () => ({ unit: await getUnit(unitId), ds: await listDialogues(unitId) }), [unitId]);
  const [showKo, setShowKo] = useState(true);
  if (st.loading) return <Loading />; if (st.error) return <ErrorBox error={st.error} />;
  const { unit, ds } = st.data;
  return (
    <div>
      <Head unit={unit} title="대화문" />
      <div className="row between mb"><span className="muted">{ds.length}개 대화</span><Toggle value={showKo} onChange={setShowKo} options={[{ value: true, label: '해석 보기' }, { value: false, label: '해석 숨기기' }]} /></div>
      {ds.length === 0 && <Empty>등록된 대화문이 없어요.</Empty>}
      {ds.map((d) => (
        <div key={d.id} className="card mb">
          <div className="row between"><h3>{d.title}</h3><TtsButton text={d.dialogue_lines.map((l) => l.en).join(' ')} label="전체 듣기" /></div>
          {d.dialogue_lines.map((l) => (
            <div key={l.id} className="line">
              <span className={`sp ${/^(b|m)/i.test(l.speaker || '') ? 'b' : ''}`}>{l.speaker || '·'}</span>
              <div className="grow"><div className="en">{l.en} <TtsButton text={l.en} /></div>{showKo && l.ko && <div className="ko">{l.ko}</div>}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ④ 대화문 빈칸
export function DialogueBlank() {
  const { unitId } = useParams(); const mode = useMode();
  const st = useAsync(async () => ({ unit: await getUnit(unitId), items: await listBlanks(unitId, 'dialogue'), wrong: await listWrongNotes('open', { itemType: 'dialogue_blank', unitId: Number(unitId) }) }), [unitId]);
  const [qs, setQs] = useState(null); const [retry, setRetry] = useState(false); const [busy, setBusy] = useState(false);
  if (st.loading) return <Loading />; if (st.error) return <ErrorBox error={st.error} />;
  const { unit, items, wrong } = st.data;
  const retryWrong = async () => { setBusy(true); try { const list = await questionsFromWrongNotes(wrong); setRetry(true); setQs(list); } finally { setBusy(false); } };
  if (qs) return <QuizRunner questions={qs} mode={retry ? 'retry' : mode} title={retry ? `대화문 빈칸 오답 다시 풀기 (${qs.length})` : '대화문 빈칸'} homework={retry ? undefined : { unitId: Number(unitId), material: 'dialogue_blank' }} onExit={() => { setQs(null); setRetry(false); st.reload(); }} />;
  return (
    <div className="stack">
      <Head unit={unit} title="대화문 빈칸" />
      {items.length === 0 ? <Empty>빈칸 문항이 아직 없어요. (선생님이 생성해야 해요)</Empty> : (<>
        <div className="card"><b>{items.length}문항</b><div className="muted small">대화문의 핵심 표현을 직접 입력해요. 해석이 힌트로 나와요.</div></div>
        <button className="btn primary lg block" onClick={() => setQs(blankQuestions(items, Number(unitId), 'dialogue'))}>순서대로 풀기</button>
        <button className="btn lg block" onClick={() => setQs(blankQuestions(shuffle(items), Number(unitId), 'dialogue'))}>랜덤으로 풀기</button>
        {wrong.length > 0 && <button className="btn lg block" disabled={busy} onClick={retryWrong}>{busy ? '준비 중…' : `이 유닛에서 틀린 문제만 모아 풀기 (${wrong.length})`}</button>}
      </>)}
    </div>
  );
}

// ⑤ 본문
export function Reading() {
  const { unitId } = useParams();
  const st = useAsync(async () => ({ unit: await getUnit(unitId), r: await getReading(unitId) }), [unitId]);
  const [showKo, setShowKo] = useState(true);
  if (st.loading) return <Loading />; if (st.error) return <ErrorBox error={st.error} />;
  const { unit, r } = st.data;
  return (
    <div>
      <Head unit={unit} title="본문" />
      {!r ? <Empty>등록된 본문이 없어요.</Empty> : (<>
        <div className="row between mb"><h3>{r.title}</h3><div className="row"><TtsButton text={r.reading_sentences.map((s) => s.en).join(' ')} label="전체 듣기" /><Toggle value={showKo} onChange={setShowKo} options={[{ value: true, label: '해석' }, { value: false, label: '영어만' }]} /></div></div>
        {r.reading_sentences.map((s, i) => (
          <div key={s.id} className="sentence">
            <div className="en"><span className="muted small">{i + 1}. </span>{s.en} <TtsButton text={s.en} /></div>
            {showKo && s.ko && <div className="ko">{s.ko}</div>}
          </div>
        ))}
      </>)}
    </div>
  );
}

// ⑥ 본문 빈칸시험
export function ReadingBlank() {
  const { unitId } = useParams(); const [sp] = useSearchParams(); const mode = useMode();
  const [diffSel, setDiff] = useState(sp.get('difficulty') || null);
  const st = useAsync(async () => ({ unit: await getUnit(unitId), items: await listBlanks(unitId, 'reading'), wrong: await listWrongNotes('open', { itemType: 'reading_blank', unitId: Number(unitId) }) }), [unitId]);
  const [qs, setQs] = useState(null); const [retry, setRetry] = useState(false); const [busy, setBusy] = useState(false);
  if (st.loading) return <Loading />; if (st.error) return <ErrorBox error={st.error} />;
  const { unit, items, wrong } = st.data;
  const avail = DIFF_ORDER.filter((k) => items.some((b) => b.difficulty === k));
  const diff = diffSel && avail.includes(diffSel) ? diffSel : avail[0];
  const mine = items.filter((b) => b.difficulty === diff);
  const wrongHere = wrong.filter((n) => n.sub_mode === diff);
  const retryWrong = async (list) => { setBusy(true); try { const q = await questionsFromWrongNotes(list); setRetry(true); setQs(q); } finally { setBusy(false); } };
  if (qs) return <QuizRunner questions={qs} mode={retry ? 'retry' : mode} title={retry ? `본문 빈칸 오답 다시 풀기 (${qs.length})` : `본문 빈칸 · ${DIFF_LABEL[diff]}`} homework={retry ? undefined : { unitId: Number(unitId), material: 'reading_blank', difficulty: diff }} onExit={() => { setQs(null); setRetry(false); st.reload(); }} />;
  return (
    <div className="stack">
      <Head unit={unit} title="본문 빈칸시험" />
      <div className="card stack">
        <div><label className="field">유형</label><Toggle value={diff} onChange={setDiff} options={avail.map((k) => ({ value: k, label: DIFF_LABEL[k] }))} /></div>
        <div className="muted small">{DIFF_DESC[diff] || ''} · {mine.length}문항</div>
      </div>
      {mine.length === 0 ? <Empty>이 난이도의 문항이 아직 없어요.</Empty> : (<>
        <button className="btn primary lg block" onClick={() => setQs(blankQuestions(mine, Number(unitId), 'reading'))}>순서대로 풀기</button>
        <button className="btn lg block" onClick={() => setQs(blankQuestions(shuffle(mine), Number(unitId), 'reading'))}>랜덤으로 풀기</button>
        {wrongHere.length > 0 && <button className="btn lg block" disabled={busy} onClick={() => retryWrong(wrongHere)}>{busy ? '준비 중…' : `${DIFF_LABEL[diff]}에서 틀린 문제만 모아 풀기 (${wrongHere.length})`}</button>}
        {wrong.length > wrongHere.length && <button className="btn sm block" disabled={busy} onClick={() => retryWrong(wrong)}>이 유닛 본문 빈칸 오답 전체 다시 풀기 ({wrong.length})</button>}
      </>)}
    </div>
  );
}

// ⑦ 기출문제
export function Exam() {
  const { unitId } = useParams(); const mode = useMode();
  const st = useAsync(async () => ({ unit: await getUnit(unitId), qs: await listExam(unitId), wrong: await listWrongNotes('open', { itemType: 'exam', unitId: Number(unitId) }) }), [unitId]);
  const [term, setTerm] = useState('');   // 회차: PRE-STEP / 1회 / 2회 …
  const [qtype, setQtype] = useState('');  // '' | mc | essay
  const [run, setRun] = useState(null); const [runMode, setRunMode] = useState('homework'); const [busy, setBusy] = useState(false);
  if (st.loading) return <Loading />; if (st.error) return <ErrorBox error={st.error} />;
  const { unit, qs, wrong } = st.data;
  const retryWrong = async () => { setBusy(true); try { const list = await questionsFromWrongNotes(wrong); setRunMode('retry'); setRun(list); } finally { setBusy(false); } };
  const termLabel = (t) => String(t || '').replace(/^예상문제\s*/, '') || '기타';
  const termOrder = (t) => { const l = termLabel(t); if (/pre/i.test(l)) return 0; const m = l.match(/(\d+)/); return m ? Number(m[1]) : 99; };
  const terms = [...new Set(qs.map((q) => q.term || ''))].sort((a, b) => termOrder(a) - termOrder(b));
  const sel = qs.filter((q) => (!term || (q.term || '') === term) && (!qtype || q.qtype === qtype));
  if (run) return <QuizRunner questions={run} mode={runMode === 'retry' ? 'retry' : mode} title={runMode === 'retry' ? `기출문제 오답 다시 풀기 (${run.length})` : `기출문제${term ? ' · ' + termLabel(term) : ''}`} homework={runMode === 'retry' ? undefined : { unitId: Number(unitId), material: 'exam' }} onExit={() => { setRun(null); setRunMode('homework'); st.reload(); }} />;
  return (
    <div className="stack">
      <Head unit={unit} title="기출문제" />
      {qs.length === 0 ? <Empty>등록된 기출문제가 없어요.</Empty> : (<>
        <div className="card stack" style={{ gap: 10 }}>
          <div>
            <label className="field">회차</label>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button className={`btn sm ${term === '' ? 'primary' : ''}`} onClick={() => setTerm('')}>전체 ({qs.length})</button>
              {terms.map((t) => <button key={t} className={`btn sm ${term === t ? 'primary' : ''}`} onClick={() => setTerm(t)}>{termLabel(t)} ({qs.filter((q) => (q.term || '') === t).length})</button>)}
            </div>
          </div>
          <div>
            <label className="field">유형</label>
            <div className="toggle">
              <button className={qtype === '' ? 'on' : ''} onClick={() => setQtype('')}>전체</button>
              <button className={qtype === 'mc' ? 'on' : ''} onClick={() => setQtype('mc')}>객관식</button>
              <button className={qtype === 'essay' ? 'on' : ''} onClick={() => setQtype('essay')}>서술형</button>
            </div>
          </div>
        </div>
        <div className="muted">{sel.length}문항 (객관식 {sel.filter((q) => q.qtype === 'mc').length} · 서술형 {sel.filter((q) => q.qtype === 'essay').length})</div>
        <button className="btn primary lg block" disabled={!sel.length} onClick={() => { setRunMode('homework'); setRun(examQuestions(sel, Number(unitId))); }}>풀기 시작</button>
        {wrong.length > 0 && <button className="btn lg block" disabled={busy} onClick={retryWrong}>{busy ? '준비 중…' : `이 유닛에서 틀린 문제만 모아 풀기 (${wrong.length})`}</button>}
        {wrong.length > 0 && <div className="muted small">PRE-STEP·1회·2회 등 회차에 상관없이, 이 유닛 예상문제에서 틀렸고 아직 해결하지 못한 문제를 모두 모읍니다.</div>}
      </>)}
    </div>
  );
}
