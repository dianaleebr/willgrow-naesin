import { useState } from 'react';
import { listWrongNotes, questionsFromWrongNotes, ITEM_TYPE_LABEL, DIFF_LABEL } from '../../lib/api.js';
import { supabase } from '../../lib/supabase.js';
import { useAsync, Loading, ErrorBox, Empty, unitLabel, RichText } from '../../components/ui.jsx';
import QuizRunner from '../../components/QuizRunner.jsx';

export default function WrongNotes() {
  const [status, setStatus] = useState('open');
  const [type, setType] = useState('');
  const [unit, setUnit] = useState('');
  const [sort, setSort] = useState('count');
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);
  const st = useAsync(() => listWrongNotes(status), [status]);

  if (run) return <QuizRunner questions={run.qs} mode="retry" title={`오답 다시 풀기 (${run.qs.length})`} onExit={() => { setRun(null); st.reload(); }} />;
  if (st.loading) return <Loading />; if (st.error) return <ErrorBox error={st.error} />;
  const notes = st.data;
  const units = [...new Map(notes.filter((n) => n.units).map((n) => [n.unit_id, n.units])).entries()];
  let sel = notes.filter((n) => (!type || n.item_type === type) && (!unit || String(n.unit_id) === unit));
  if (sort === 'recent') sel = [...sel].sort((a, b) => new Date(b.last_wrong_at) - new Date(a.last_wrong_at));

  const retry = async (list) => { setBusy(true); try { const qs = await questionsFromWrongNotes(list); setRun({ qs }); } finally { setBusy(false); } };
  const remove = async (n) => { if (!confirm('이 오답을 삭제할까요?')) return; await supabase.from('wrong_notes').delete().eq('id', n.id); st.reload(); };

  return (
    <div className="stack">
      <div className="row between"><h1>오답노트</h1>
        <div className="toggle"><button className={status === 'open' ? 'on' : ''} onClick={() => setStatus('open')}>남은 오답</button><button className={status === 'resolved' ? 'on' : ''} onClick={() => setStatus('resolved')}>해결됨</button></div></div>
      <div className="card grid3">
        <div><label className="field">유형</label><select className="input" value={type} onChange={(e) => setType(e.target.value)}><option value="">전체</option>{Object.entries(ITEM_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="field">유닛</label><select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}><option value="">전체</option>{units.map(([id, u]) => <option key={id} value={id}>중{u.grade} L{u.unit_no}</option>)}</select></div>
        <div><label className="field">정렬</label><select className="input" value={sort} onChange={(e) => setSort(e.target.value)}><option value="count">많이 틀린 순</option><option value="recent">최근 순</option></select></div>
      </div>
      {status === 'open' && sel.length > 0 && <button className="btn primary lg block" disabled={busy} onClick={() => retry(sel)}>{busy ? '준비 중…' : `오답만 다시 풀기 (${sel.length})`}</button>}
      {status === 'open' && !type && notes.length > 0 && (
        <div className="row">
          {Object.entries(ITEM_TYPE_LABEL).map(([k, v]) => { const n = notes.filter((x) => x.item_type === k && (!unit || String(x.unit_id) === unit)); return n.length ? <button key={k} className="btn sm" disabled={busy} onClick={() => retry(n)}>{v} 오답만 ({n.length})</button> : null; })}
        </div>
      )}
      {sel.length === 0 && <Empty>{status === 'open' ? '남은 오답이 없어요' : '해결된 오답이 아직 없어요'}</Empty>}
      <div className="list">
        {sel.map((n) => (
          <div key={n.id} className="item">
            <div className="grow">
              <div className="row"><span className="badge">{ITEM_TYPE_LABEL[n.item_type]}{n.item_type === 'reading_blank' && n.sub_mode ? ` · ${DIFF_LABEL[n.sub_mode] || n.sub_mode}` : ''}{n.item_type === 'word' && n.sub_mode ? ` · ${n.sub_mode === 'ko2en' ? '한→영' : '영→한'}` : ''}</span><span className="muted small">{n.units ? `중${n.units.grade} L${n.units.unit_no}` : ''}</span></div>
              <NoteText n={n} />
            </div>
            <div className="center"><b className="red en">{n.wrong_count}</b><div className="muted" style={{ fontSize: 11 }}>회 틀림</div></div>
            {status === 'open' && <button className="btn sm" onClick={() => retry([n])}>풀기</button>}
            <button className="btn ghost sm" onClick={() => remove(n)}>삭제</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// 항목 본문은 lazy 로드 (목록에서 가볍게)
function NoteText({ n }) {
  const st = useAsync(async () => {
    if (n.item_type === 'word') { const { data } = await supabase.from('words').select('en, ko').eq('id', n.item_id).maybeSingle(); return data ? `${data.en} — ${data.ko}` : '(삭제된 단어)'; }
    if (n.item_type === 'exam') { const { data } = await supabase.from('exam_questions').select('question, answer, explanation, qtype, choices').eq('id', n.item_id).maybeSingle(); return data ? { text: (data.question.startsWith('[지문]') && data.question.includes('\n\n') ? data.question.slice(data.question.indexOf('\n\n') + 2) : data.question).slice(0, 160), answer: data.qtype === 'mc' ? `${data.answer}번 ${data.choices?.[Number(data.answer) - 1] ?? ''}` : data.answer, explanation: data.explanation } : '(삭제된 문제)'; }
    const { data } = await supabase.from('blank_items').select('prompt, answers, ko, explanation').eq('id', n.item_id).maybeSingle();
    if (!data) return '(삭제된 문항)';
    let i = 0; return { text: data.prompt ? data.prompt.replace(/___/g, () => `[${data.answers[i++] ?? ''}]`) : `[영작] ${data.ko} → ${data.answers[0]}`, explanation: data.explanation };
  }, [n.id]);
  if (st.loading) return <div className="small muted">…</div>;
  const v = st.data;
  if (typeof v === 'string') return <div className="en small">{v}</div>;
  return <div className="small"><div className="en"><RichText text={v.text} /></div>{v.answer && <div className="green">정답: {v.answer}</div>}{v.explanation && <div className="muted" style={{ marginTop: 2 }}>해설: {v.explanation}</div>}</div>;
}
export { unitLabel };
