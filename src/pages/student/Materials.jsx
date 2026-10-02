import { useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { getUnit, listWords, listDialogues, getReading, listBlanks, listExam, wordQuestions, blankQuestions, examQuestions, shuffle, DIFF_LABEL, DIFF_DESC, DIFF_ORDER, listWrongNotes, questionsFromWrongNotes, wordExtra, hasRelation, hasSenses, getAnalysis, markHomeworkDone } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
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
  const [hide, setHide] = useState('none'); const [filter, setFilter] = useState('all');
  if (st.loading) return <Loading />; if (st.error) return <ErrorBox error={st.error} />;
  const { unit, words } = st.data;
  const nSense = words.filter(hasSenses).length, nRel = words.filter(hasRelation).length;
  const shown = filter === 'sense' ? words.filter(hasSenses) : filter === 'rel' ? words.filter(hasRelation) : words;
  return (
    <div>
      <Head unit={unit} title="단어장" />
      <div className="row between mb" style={{ flexWrap: 'wrap', gap: 8 }}><span className="muted">{shown.length}개</span>
        <Toggle value={hide} onChange={setHide} options={[{ value: 'none', label: '모두 보기' }, { value: 'ko', label: '뜻 가리기' }, { value: 'en', label: '영어 가리기' }]} /></div>
      {(nSense > 0 || nRel > 0) && <div className="mb"><Toggle value={filter} onChange={setFilter} options={[{ value: 'all', label: `전체 ${words.length}` }, { value: 'sense', label: `다의어 ${nSense}` }, { value: 'rel', label: `유의어·반의어 ${nRel}` }]} /></div>}
      {shown.length === 0 && <Empty>등록된 단어가 없어요.</Empty>}
      {shown.map((w) => <WordRow key={w.id} w={w} hide={hide} openSenses={filter === 'sense'} />)}
    </div>
  );
}
function WordRow({ w, hide, openSenses }) {
  const x = wordExtra(w);
  const senses = x.senses.length >= 2 ? x.senses : [];
  return (
    <div className="word-row">
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="en">{hide === 'en' ? <Blur>{w.en}</Blur> : w.en}<span className="pos">{w.pos}{w.category ? ` · ${w.category}` : ''}</span>{senses.length > 0 && <span className="badge" style={{ marginLeft: 6 }}>다의어 {senses.length}</span>}</div>
        <div>{hide === 'ko' ? <Blur>{w.ko}</Blur> : w.ko}</div>
        {w.example && <div className="ex">{w.example}</div>}
        {(x.syn.length > 0 || x.ant.length > 0) && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {x.syn.map((r, i) => <span key={'s' + i} className="chip syn" title={r.sense ? `${r.sense} 의 유의어` : '유의어'}>= <b className="en">{r.en}</b>{r.ko ? ` ${r.ko}` : ''}</span>)}
            {x.ant.map((r, i) => <span key={'a' + i} className="chip ant" title={r.sense ? `${r.sense} 의 반의어` : '반의어'}>↔ <b className="en">{r.en}</b>{r.ko ? ` ${r.ko}` : ''}</span>)}
            {(x.syn.length > 0 || x.ant.length > 0) && x.syn[0]?.sense && senses.length > 0 && <span className="muted small">({(x.syn[0] || x.ant[0]).sense} 뜻 기준)</span>}
          </div>
        )}
        {senses.length > 0 && (
          <details open={openSenses} style={{ marginTop: 4 }}>
            <summary className="small muted" style={{ cursor: 'pointer' }}>여러 뜻 {senses.length}개 보기</summary>
            <ol className="senses">
              {senses.map((sn, i) => <li key={i}><span className="pos">{sn.pos}</span> {hide === 'ko' ? <Blur>{sn.ko}</Blur> : <b>{sn.ko}</b>}{sn.ex_en && <div className="ex"><span className="en">{sn.ex_en}</span>{sn.ex_ko ? <span className="muted"> {sn.ex_ko}</span> : ''}</div>}</li>)}
            </ol>
          </details>
        )}
      </div>
      <TtsButton text={w.en} />
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
  const pool = dir === 'rel' ? words.filter(hasRelation) : dir === 'sense' ? words.filter(hasSenses) : words;
  const DIR_LABEL = { ko2en: '한→영', en2ko: '영→한', rel: '유의어·반의어', sense: '다의어' };
  if (qs) return <QuizRunner questions={qs} mode={mode} title={`단어테스트 (${DIR_LABEL[dir]})`} homework={{ unitId: Number(unitId), material: 'word_test' }} onExit={() => setQs(null)} />;
  const start = () => { const pick = shuffle(pool).slice(0, count === 'all' ? pool.length : count); setQs(wordQuestions(pick, Number(unitId), dir)); };
  const opts = [{ value: 'ko2en', label: '한→영 (영어 쓰기)' }, { value: 'en2ko', label: '영→한 (뜻 쓰기)' }];
  if (words.some(hasRelation)) opts.push({ value: 'rel', label: '유의어·반의어' });
  if (words.some(hasSenses)) opts.push({ value: 'sense', label: '다의어' });
  const DESC = { ko2en: '우리말 뜻을 보고 영어 단어를 써요.', en2ko: '영어 단어를 보고 뜻을 써요. 품사가 같고 뜻이 비슷하면 정답으로 인정하고 정확한 뜻을 보여줘요. 틀리면 품사도 알려줘요.', rel: '단어와 뜻을 보고 유의어 또는 반의어를 영어로 써요. (한 단어에 유의어·반의어 각각 한 문제)', sense: '예문 속 밑줄 친 단어가 그 문장에서 어떤 뜻인지 써요. (뜻마다 한 문제)' };
  return (
    <div className="stack">
      <Head unit={unit} title="단어테스트" />
      {words.length === 0 ? <Empty>등록된 단어가 없어요.</Empty> : (<>
        <div className="card stack">
          <div><label className="field">모드</label><Toggle value={dir} onChange={setDir} options={opts} /></div>
          <div className="muted small">{DESC[dir]}</div>
          <div><label className="field">{dir === 'rel' || dir === 'sense' ? '단어 수' : '문항 수'} (전체 {pool.length}개)</label><Toggle value={count} onChange={setCount} options={[{ value: 10, label: '10' }, { value: 20, label: '20' }, { value: 'all', label: '전체' }]} /></div>
          <div className="muted small">문항 순서는 매번 랜덤. 대소문자·문장부호는 채점에 영향 없음. 틀린 단어는 오답노트에 저장돼요.</div>
        </div>
        <button className="btn primary lg block" onClick={start} disabled={pool.length === 0}>시작하기</button>
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

// ⑧ 본문분석 — 내용정리 플러스 Sentence Structures: 문장별 구문·문법 해설로 자기주도 복습
export function ReadingAnalysis() {
  const { unitId } = useParams();
  const { profile } = useAuth();
  const st = useAsync(async () => ({ unit: await getUnit(unitId), ana: await getAnalysis(unitId) }), [unitId]);
  const [pi, setPi] = useState(0); const [showKo, setShowKo] = useState(true); const [openAll, setOpenAll] = useState(true); const [done, setDone] = useState(false);
  if (st.loading) return <Loading />; if (st.error) return <ErrorBox error={st.error} />;
  const { unit, ana } = st.data;
  const paras = ana?.paragraphs || [];
  if (!paras.length) return <div><Head unit={unit} title="본문분석" /><Empty>이 유닛의 본문분석 자료가 아직 없어요.</Empty></div>;
  const p = paras[Math.min(pi, paras.length - 1)];
  const finish = async () => { try { await markHomeworkDone(profile.id, profile.class_name, Number(unitId), 'reading_analysis'); } catch {} setDone(true); };
  return (
    <div className="stack">
      <Head unit={unit} title="본문분석" />
      <div className="muted small">선생님 설명을 들은 뒤 집에서 한 문장씩 복습해요. 문장 → 해석 → 문법·구문 포인트 순서로 읽고, 마지막에 T/F로 내용을 확인해요.</div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {paras.map((x, i) => <button key={i} className={`btn sm ${i === pi ? 'primary' : ''}`} onClick={() => { setPi(i); window.scrollTo(0, 0); }}>본문{x.no}{x.title ? ` ${x.title}` : ''}</button>)}
      </div>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Toggle value={showKo} onChange={setShowKo} options={[{ value: true, label: '해석 보기' }, { value: false, label: '해석 가리기' }]} />
        <Toggle value={openAll} onChange={setOpenAll} options={[{ value: true, label: '해설 펼치기' }, { value: false, label: '해설 접기' }]} />
      </div>
      {p.summary && (p.summary.text || p.summary.next?.length > 0) && (
        <div className="card soft">
          <div className="muted small" style={{ fontWeight: 700 }}>단락 요약{p.summary.title ? ` · ${p.summary.title}` : ''}</div>
          {p.summary.text && <div style={{ marginTop: 4, lineHeight: 1.6 }}>{p.summary.text}</div>}
          {p.summary.next?.length > 0 && <div className="small muted" style={{ marginTop: 6 }}>이어질 내용: {p.summary.next.filter((_, i) => i % 2 === 0).map((t, i) => <span key={i} className="en">{t}{i < Math.ceil(p.summary.next.length / 2) - 1 ? ' / ' : ''}</span>)}</div>}
        </div>
      )}
      {p.sentences.map((s, i) => <SentenceCard key={i} s={s} showKo={showKo} open={openAll} />)}
      {p.grammar?.length > 0 && (
        <div className="stack">
          <h3 style={{ margin: '8px 0 0' }}>Grammar+ 문법 정리</h3>
          {p.grammar.map((g, i) => (
            <details key={i} className="card" open={openAll}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{g.title}</summary>
              <div className="stack" style={{ gap: 4, marginTop: 8 }}>
                {g.lines.map((l, k) => <div key={k} className={`${/[A-Za-z]/.test(l) && !/[가-힣]/.test(l) ? 'en' : ''} small`} style={{ lineHeight: 1.6, paddingLeft: /^(→|\d+\.)/.test(l) ? 0 : 10 }}>{l}</div>)}
              </div>
            </details>
          ))}
        </div>
      )}
      {p.tf?.length > 0 && <TfCheck items={p.tf} />}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn" disabled={pi === 0} onClick={() => { setPi(pi - 1); window.scrollTo(0, 0); }}>‹ 이전 단락</button>
        {pi + 1 < paras.length
          ? <button className="btn primary" onClick={() => { setPi(pi + 1); window.scrollTo(0, 0); }}>다음 단락 ›</button>
          : <button className="btn primary" disabled={done} onClick={finish}>{done ? '학습 완료 ✓' : '본문분석 학습 완료'}</button>}
      </div>
    </div>
  );
}
function SentenceCard({ s, showKo, open }) {
  const [ko, setKo] = useState(false);
  const koShown = showKo || ko;
  return (
    <div className="card ana">
      <div className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
        {s.no && <span className="badge">{s.no}</span>}
        <div className="en" style={{ fontSize: 17, lineHeight: 1.6, fontWeight: 600, flex: 1, minWidth: 0 }}>{s.en}</div>
        <TtsButton text={s.en} />
      </div>
      {s.ko && <div className="ko" style={{ marginTop: 4, color: koShown ? 'var(--text)' : 'transparent', cursor: 'pointer', userSelect: 'none' }} onClick={() => setKo(!ko)}>{koShown ? s.ko : '(눌러서 해석 보기)'}</div>}
      {!koShown && <button className="btn sm ghost" onClick={() => setKo(true)}>해석 보기</button>}
      {s.points.length > 0 && (
        <details open={open} style={{ marginTop: 6 }}>
          <summary className="small muted" style={{ cursor: 'pointer' }}>문법·구문 포인트 {s.points.length}개</summary>
          <div className="stack" style={{ gap: 8, marginTop: 6 }}>
            {s.points.map((pt, i) => <Point key={i} pt={pt} />)}
          </div>
        </details>
      )}
      {s.vocab?.length > 0 && (
        <details style={{ marginTop: 6 }}>
          <summary className="small muted" style={{ cursor: 'pointer' }}>어휘&숙어 {s.vocab.length}</summary>
          <ul className="small" style={{ margin: '4px 0 0 18px', padding: 0 }}>{s.vocab.map((v, i) => <li key={i} style={{ whiteSpace: 'pre-wrap' }}>{v}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
function Point({ pt }) {
  const m = String(pt.text || '').match(/^❮(.*?)❯\s*(.*)$/s);
  const struct = m ? m[1] : null; const body = m ? m[2] : pt.text;
  return (
    <div className="ana-point">
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {pt.tag && <span className="chip tag">{pt.tag}</span>}
        {pt.flags?.map((f, i) => <span key={i} className="badge yellow">{f}</span>)}
      </div>
      {struct && <div className="en small" style={{ fontWeight: 700, marginTop: 4 }}>{struct}</div>}
      {body && <div className="small" style={{ lineHeight: 1.65, marginTop: 2 }}>{body}</div>}
      {pt.notes?.map((n, i) => (
        <div key={i} className="small" style={{ marginTop: 4, paddingLeft: 8, borderLeft: '3px solid var(--line)', color: n.kind === '전환' || n.kind === 'e.g.' ? 'var(--text)' : 'var(--muted)' }}>
          <span className="badge" style={{ marginRight: 6 }}>{n.kind}</span><span className={/[A-Za-z]/.test(n.text) && !/^[가-힣]/.test(n.text) ? 'en' : ''}>{n.text}</span>
        </div>
      ))}
    </div>
  );
}
function TfCheck({ items }) {
  const [ans, setAns] = useState({});
  const right = items.filter((it, i) => ans[i] === it.a).length;
  return (
    <div className="card">
      <div className="row between"><b>T/F 내용 확인</b><span className="muted small">{Object.keys(ans).length ? `${right} / ${items.length} 정답` : '본문 내용과 맞으면 T, 틀리면 F'}</span></div>
      <div className="stack" style={{ gap: 8, marginTop: 8 }}>
        {items.map((it, i) => (
          <div key={i} className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
            <span className="muted small" style={{ width: 18 }}>{i + 1}.</span>
            <div className="en" style={{ flex: 1, minWidth: 0, lineHeight: 1.5 }}>{it.q}</div>
            <div className="row" style={{ gap: 4, flex: 'none' }}>
              {['T', 'F'].map((v) => { let cls = 'btn sm'; if (ans[i] != null) { if (v === it.a) cls += ' green'; else if (ans[i] === v) cls += ' primary'; } return <button key={v} className={cls} onClick={() => setAns({ ...ans, [i]: v })}>{v}</button>; })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
