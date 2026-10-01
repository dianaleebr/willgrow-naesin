import { useState } from 'react';
import { supabase, unwrap, rpc } from '../../lib/supabase.js';
import { listPublishers, listUnits, listWords, listDialogues, getReading, listBlanks, listExam, DIFF_LABEL, DIFF_ORDER } from '../../lib/api.js';
import { useAsync, Loading, ErrorBox, Empty, Toggle } from '../../components/ui.jsx';

const SAMPLE_JSON = `{
  "publisher": "동아(윤정미)", "grade": 2, "unit": 1, "unit_title": "Suit Your Taste!",
  "words": [{"en": "taste", "ko": "취향, 맛", "pos": "n.", "example": "..."}],
  "dialogues": [{"title": "Listen & Talk 1 A", "lines": [{"speaker": "B", "en": "...", "ko": "..."}]}],
  "reading": {"title": "...", "sentences": [{"en": "...", "ko": "..."}]},
  "exam_questions": [{"school": "거제중", "year": 2025, "term": "1학기 중간", "type": "mc", "question": "...", "choices": ["...","...","...","...","..."], "answer": "3", "explanation": "..."}]
}`;

export default function Content() {
  const pubs = useAsync(listPublishers, []);
  const [pubId, setPubId] = useState('');
  const [grade, setGrade] = useState('');
  const units = useAsync(async () => listUnits(pubId ? Number(pubId) : null, grade ? Number(grade) : null), [pubId, grade]);
  const [unitId, setUnitId] = useState(null);
  const [msg, setMsg] = useState('');

  const addPublisher = async () => { const name = prompt('출판사 이름 (예: 동아(윤정미))'); if (!name) return; const { error } = await supabase.from('publishers').insert({ name }); if (error) setMsg(error.message); else pubs.reload(); };
  const renamePublisher = async () => { const p = pubs.data.find((x) => String(x.id) === pubId); if (!p) return; const name = prompt('새 이름', p.name); if (!name || name === p.name) return; const { error } = await supabase.from('publishers').update({ name }).eq('id', p.id); if (error) setMsg(error.message); else pubs.reload(); };
  const deletePublisher = async () => { const p = pubs.data.find((x) => String(x.id) === pubId); if (!p) return; if (!confirm(`"${p.name}" 과 그 유닛·자료를 모두 삭제할까요?`)) return; const { error } = await supabase.from('publishers').delete().eq('id', p.id); if (error) setMsg(error.message); else { setPubId(''); pubs.reload(); } };
  const addUnit = async () => {
    if (!pubId || !grade) { setMsg('출판사와 학년을 먼저 고르세요.'); return; }
    const no = prompt('유닛 번호 (숫자)'); if (!no) return; const title = prompt('유닛 제목') || '';
    const { error } = await supabase.from('units').insert({ publisher_id: Number(pubId), grade: Number(grade), unit_no: Number(no), title }); if (error) setMsg(error.message); else units.reload();
  };

  if (pubs.loading) return <Loading />; if (pubs.error) return <ErrorBox error={pubs.error} />;
  if (unitId) return <UnitEditor unitId={unitId} onBack={() => { setUnitId(null); units.reload(); }} />;

  return (
    <div className="stack">
      <h1>콘텐츠 관리</h1>
      {msg && <div className="alert err" onClick={() => setMsg('')}>{msg}</div>}
      <JsonUpload onDone={(uid) => { units.reload(); setMsg(''); setUnitId(uid); }} />
      <div className="card stack">
        <div className="row">
          <div className="grow"><label className="field">출판사</label><select className="input" value={pubId} onChange={(e) => setPubId(e.target.value)}><option value="">전체</option>{pubs.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label className="field">학년</label><select className="input" value={grade} onChange={(e) => setGrade(e.target.value)}><option value="">전체</option><option value="1">중1</option><option value="2">중2</option><option value="3">중3</option></select></div>
        </div>
        <div className="row"><button className="btn sm" onClick={addPublisher}>+ 출판사 추가</button>{pubId && <><button className="btn sm" onClick={renamePublisher}>이름 수정</button><button className="btn sm ghost" onClick={deletePublisher}>출판사 삭제</button></>}<button className="btn sm primary" onClick={addUnit}>+ 유닛 추가</button></div>
      </div>
      {units.loading ? <Loading /> : (units.data || []).length === 0 ? <Empty>유닛이 없어요. JSON 업로드나 "유닛 추가"로 만들어 주세요.</Empty> : (
        <div className="list">{units.data.map((u) => (
          <button key={u.id} className="item" onClick={() => setUnitId(u.id)} style={{ textAlign: 'left' }}>
            <span className="badge">{u.publishers?.name}</span><span className="badge">중{u.grade}</span>
            <div className="grow"><b>Lesson {u.unit_no}</b> <span className="muted">{u.title}</span></div><span>편집 ›</span>
          </button>
        ))}</div>
      )}
    </div>
  );
}

function JsonUpload({ onDone }) {
  const [open, setOpen] = useState(false); const [text, setText] = useState(''); const [file, setFile] = useState(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null);
  const [genBlanks, setGenBlanks] = useState(true); const [progress, setProgress] = useState('');
  const onFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { const raw = JSON.parse(await f.text()); const arr = Array.isArray(raw) ? raw : [raw]; setFile({ name: f.name, size: f.size, arr }); setMsg(null); }
    catch (err) { setFile(null); setMsg({ ok: false, text: 'JSON 파일을 읽을 수 없어요: ' + err.message }); }
  };
  const upload = async () => {
    setBusy(true); setMsg(null);
    try {
      let arr;
      if (file) arr = file.arr; else { const raw = JSON.parse(text); arr = Array.isArray(raw) ? raw : [raw]; }
      let last; let n = 0;
      for (const p of arr) {
        n += 1; setProgress(`${n}/${arr.length} · ${p.publisher} ${p.level || '중'}${p.grade} Lesson ${p.unit} 등록 중…`);
        last = await rpc('import_unit', { p, p_replace: true });
        if (genBlanks) {
          // 핵심 표현 대화문 빈칸(dialogue_blanks)이 JSON에 들어 있으면 자동 생성으로 덮어쓰지 않음
          if (!(Array.isArray(p.dialogue_blanks) && p.dialogue_blanks.length)) await rpc('generate_blanks', { p_unit_id: last, p_source: 'dialogue' });
          // 워크북형 빈칸(blanks)이 JSON에 들어 있으면 자동 생성으로 덮어쓰지 않음
          if (!(Array.isArray(p.blanks) && p.blanks.length)) await rpc('generate_blanks', { p_unit_id: last, p_source: 'reading' });
        }
      }
      setMsg({ ok: true, text: `${arr.length}개 유닛 등록 완료${genBlanks ? ' + 빈칸 문항 생성' : ''}` }); setText(''); setFile(null); onDone(last);
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); setProgress(''); }
  };
  return (
    <div className="card stack">
      <div className="row between"><h3>JSON 일괄 업로드</h3><button className="btn sm" onClick={() => setOpen(!open)}>{open ? '접기' : '열기'}</button></div>
      {open && (<>
        <div className="muted small">요구사항 형식의 JSON 파일(유닛 1개 또는 여러 개 배열)을 올리면 단어·대화문·본문·빈칸·기출이 한 번에 등록됩니다. 같은 출판사·학년·유닛이 있으면 자료를 덮어씁니다.</div>
        <input type="file" accept=".json,application/json" onChange={onFile} />
        {file && <div className="alert ok">파일 선택됨: {file.name} ({Math.round(file.size / 1024)} KB · 유닛 {file.arr.length}개)</div>}
        {!file && <textarea className="input mono" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={SAMPLE_JSON} />}
        <label className="check"><input type="checkbox" checked={genBlanks} onChange={(e) => setGenBlanks(e.target.checked)} /> 업로드 후 빈칸 문항 자동 생성 (대화문 빈칸 + 워크북형 빈칸이 없는 경우 본문 빈칸)</label>
        <div className="row"><button className="btn primary" disabled={(!text.trim() && !file) || busy} onClick={upload}>{busy ? '등록 중…' : '등록하기'}</button>{!file && <button className="btn sm ghost" onClick={() => setText(SAMPLE_JSON)}>형식 예시 넣기</button>}{progress && <span className="muted small">{progress}</span>}</div>
        {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      </>)}
    </div>
  );
}

// ---------------- 유닛 편집 ----------------
function UnitEditor({ unitId, onBack }) {
  const [tab, setTab] = useState('words');
  const unit = useAsync(() => supabase.from('units').select('*, publishers(name, level)').eq('id', unitId).single().then(unwrap), [unitId]);
  const [msg, setMsg] = useState('');
  if (unit.loading) return <Loading />; if (unit.error) return <ErrorBox error={unit.error} />;
  const u = unit.data;
  const saveTitle = async (title) => { await supabase.from('units').update({ title }).eq('id', unitId); };
  const delUnit = async () => { if (!confirm('이 유닛과 모든 자료·학생 기록을 삭제할까요?')) return; await supabase.from('units').delete().eq('id', unitId); onBack(); };
  const tabs = [['words', '단어'], ['dialogues', '대화문'], ['reading', '본문'], ['blanks', '빈칸 문항'], ['exam', '기출문제']];
  return (
    <div className="stack">
      <div className="row"><button className="btn sm" onClick={onBack}>‹ 목록</button><span className="badge">{u.publishers?.name} · 중{u.grade}</span></div>
      <div className="row"><h1 style={{ margin: 0 }}>Lesson {u.unit_no}</h1><input className="input grow" defaultValue={u.title || ''} placeholder="유닛 제목" onBlur={(e) => saveTitle(e.target.value)} /><button className="btn sm ghost" onClick={delUnit}>유닛 삭제</button></div>
      {msg && <div className="alert err" onClick={() => setMsg('')}>{msg}</div>}
      <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'words' && <WordsEditor unitId={unitId} setMsg={setMsg} />}
      {tab === 'dialogues' && <DialoguesEditor unitId={unitId} setMsg={setMsg} />}
      {tab === 'reading' && <ReadingEditor unitId={unitId} setMsg={setMsg} />}
      {tab === 'blanks' && <BlanksEditor unitId={unitId} setMsg={setMsg} />}
      {tab === 'exam' && <ExamEditor unitId={unitId} setMsg={setMsg} />}
    </div>
  );
}

const err = (setMsg) => ({ error }) => { if (error) setMsg(error.message); return !error; };

function WordsEditor({ unitId, setMsg }) {
  const st = useAsync(() => listWords(unitId), [unitId]);
  const [paste, setPaste] = useState('');
  const add = async () => {
    const rows = paste.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => (l.includes('\t') ? l.split('\t') : l.split(',')).map((c) => c.trim()));
    if (!rows.length) return;
    const base = (st.data?.length || 0);
    const ok = err(setMsg)(await supabase.from('words').insert(rows.map((r, i) => ({ unit_id: unitId, en: r[0], ko: r[1] || '', pos: r[2] || null, example: r[3] || null, sort_order: base + i + 1 }))));
    if (ok) { setPaste(''); st.reload(); }
  };
  const upd = async (w, patch) => { if (err(setMsg)(await supabase.from('words').update(patch).eq('id', w.id))) st.reload(); };
  const del = async (w) => { if (err(setMsg)(await supabase.from('words').delete().eq('id', w.id))) st.reload(); };
  if (st.loading) return <Loading />;
  return (
    <div className="stack">
      <div className="card stack"><b>단어 추가</b><div className="muted small">한 줄에 하나: <b>영어 [탭/쉼표] 뜻 [탭/쉼표] 품사 [탭/쉼표] 예문</b> (뜻이 여러 개면 "취향, 맛"처럼 쉼표로 — 탭 구분일 때 권장)</div>
        <textarea className="input mono" rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'taste\t취향, 맛\tn.\tEveryone has a different taste.'} /><div><button className="btn primary sm" disabled={!paste.trim()} onClick={add}>추가</button></div></div>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>#</th><th>영어</th><th>뜻</th><th>품사</th><th>예문</th><th></th></tr></thead>
        <tbody>{st.data.map((w, i) => (
          <tr key={w.id}><td>{i + 1}</td>
            <td><input className="input" defaultValue={w.en} onBlur={(e) => e.target.value !== w.en && upd(w, { en: e.target.value })} style={{ width: 130 }} /></td>
            <td><input className="input" defaultValue={w.ko} onBlur={(e) => e.target.value !== w.ko && upd(w, { ko: e.target.value })} style={{ width: 150 }} /></td>
            <td><input className="input" defaultValue={w.pos || ''} onBlur={(e) => e.target.value !== (w.pos || '') && upd(w, { pos: e.target.value })} style={{ width: 60 }} /></td>
            <td><input className="input" defaultValue={w.example || ''} onBlur={(e) => e.target.value !== (w.example || '') && upd(w, { example: e.target.value })} style={{ width: 260 }} /></td>
            <td><button className="btn sm ghost" onClick={() => del(w)}>삭제</button></td></tr>
        ))}{st.data.length === 0 && <tr><td colSpan={6} className="center muted">단어 없음</td></tr>}</tbody></table></div>
    </div>
  );
}

function DialoguesEditor({ unitId, setMsg }) {
  const st = useAsync(() => listDialogues(unitId), [unitId]);
  const [title, setTitle] = useState(''); const [lines, setLines] = useState('');
  const add = async () => {
    const { data, error } = await supabase.from('dialogues').insert({ unit_id: unitId, title: title || '대화문', sort_order: (st.data?.length || 0) + 1 }).select().single();
    if (error) { setMsg(error.message); return; }
    const rows = parseLines(lines);
    if (rows.length) await supabase.from('dialogue_lines').insert(rows.map((r, i) => ({ dialogue_id: data.id, ...r, sort_order: i + 1 })));
    setTitle(''); setLines(''); st.reload();
  };
  const delD = async (d) => { if (!confirm(`"${d.title}" 삭제?`)) return; await supabase.from('dialogues').delete().eq('id', d.id); st.reload(); };
  const updL = async (l, patch) => { await supabase.from('dialogue_lines').update(patch).eq('id', l.id); };
  const delL = async (l) => { await supabase.from('dialogue_lines').delete().eq('id', l.id); st.reload(); };
  const addL = async (d) => { const en = prompt('영어 대사'); if (!en) return; const ko = prompt('해석') || ''; const speaker = prompt('화자 (예: G, B, A)') || ''; await supabase.from('dialogue_lines').insert({ dialogue_id: d.id, en, ko, speaker, sort_order: d.dialogue_lines.length + 1 }); st.reload(); };
  if (st.loading) return <Loading />;
  return (
    <div className="stack">
      <div className="card stack"><b>대화문 추가</b>
        <input className="input" placeholder="제목 (예: Listen & Talk 1 A)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="muted small">한 줄에 한 대사: <b>화자: 영어 문장 | 해석</b>  (예: G: What is your favorite food? | 가장 좋아하는 음식이 뭐야?)</div>
        <textarea className="input mono" rows={4} value={lines} onChange={(e) => setLines(e.target.value)} />
        <div><button className="btn primary sm" onClick={add}>추가</button></div></div>
      {st.data.map((d) => (
        <div key={d.id} className="card">
          <div className="row between"><input className="input" defaultValue={d.title} style={{ maxWidth: 260 }} onBlur={(e) => supabase.from('dialogues').update({ title: e.target.value }).eq('id', d.id)} /><div className="row"><button className="btn sm" onClick={() => addL(d)}>+ 대사</button><button className="btn sm ghost" onClick={() => delD(d)}>삭제</button></div></div>
          <div className="tbl-wrap mt"><table className="tbl"><tbody>{d.dialogue_lines.map((l) => (
            <tr key={l.id}><td><input className="input" defaultValue={l.speaker || ''} style={{ width: 50 }} onBlur={(e) => updL(l, { speaker: e.target.value })} /></td>
              <td><input className="input en" defaultValue={l.en} style={{ width: 320 }} onBlur={(e) => updL(l, { en: e.target.value })} /></td>
              <td><input className="input" defaultValue={l.ko || ''} style={{ width: 280 }} onBlur={(e) => updL(l, { ko: e.target.value })} /></td>
              <td><button className="btn sm ghost" onClick={() => delL(l)}>삭제</button></td></tr>))}</tbody></table></div>
        </div>
      ))}
      {st.data.length === 0 && <Empty>대화문 없음</Empty>}
    </div>
  );
}
function parseLines(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    let speaker = ''; let rest = l; const m = l.match(/^([A-Za-z가-힣]{1,6})\s*:\s*(.*)$/); if (m) { speaker = m[1]; rest = m[2]; }
    const [en, ko = ''] = rest.split('|').map((s) => s.trim()); return { speaker, en, ko };
  });
}

function ReadingEditor({ unitId, setMsg }) {
  const st = useAsync(() => getReading(unitId), [unitId]);
  const [title, setTitle] = useState(''); const [text, setText] = useState('');
  const create = async () => {
    const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [en, ko = ''] = l.split('|').map((s) => s.trim()); return { en, ko }; });
    const { data, error } = await supabase.from('readings').insert({ unit_id: unitId, title, sort_order: 1 }).select().single(); if (error) { setMsg(error.message); return; }
    if (rows.length) await supabase.from('reading_sentences').insert(rows.map((r, i) => ({ reading_id: data.id, ...r, sort_order: i + 1 })));
    st.reload();
  };
  const upd = async (s, patch) => { await supabase.from('reading_sentences').update(patch).eq('id', s.id); };
  const del = async (s) => { await supabase.from('reading_sentences').delete().eq('id', s.id); st.reload(); };
  const addS = async (r) => { const en = prompt('영어 문장'); if (!en) return; const ko = prompt('해석') || ''; await supabase.from('reading_sentences').insert({ reading_id: r.id, en, ko, sort_order: r.reading_sentences.length + 1 }); st.reload(); };
  const delR = async (r) => { if (!confirm('본문 전체 삭제?')) return; await supabase.from('readings').delete().eq('id', r.id); st.reload(); };
  if (st.loading) return <Loading />;
  const r = st.data;
  if (!r) return (
    <div className="card stack"><b>본문 등록</b><input className="input" placeholder="본문 제목" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="muted small">한 줄에 한 문장: <b>영어 문장 | 해석</b></div><textarea className="input mono" rows={8} value={text} onChange={(e) => setText(e.target.value)} />
      <div><button className="btn primary sm" onClick={create}>등록</button></div></div>
  );
  return (
    <div className="stack">
      <div className="row between"><input className="input" defaultValue={r.title || ''} style={{ maxWidth: 300 }} onBlur={(e) => supabase.from('readings').update({ title: e.target.value }).eq('id', r.id)} /><div className="row"><button className="btn sm" onClick={() => addS(r)}>+ 문장</button><button className="btn sm ghost" onClick={() => delR(r)}>본문 삭제</button></div></div>
      <div className="tbl-wrap"><table className="tbl"><tbody>{r.reading_sentences.map((s, i) => (
        <tr key={s.id}><td>{i + 1}</td><td><input className="input en" defaultValue={s.en} style={{ width: 380 }} onBlur={(e) => upd(s, { en: e.target.value })} /></td><td><input className="input" defaultValue={s.ko || ''} style={{ width: 300 }} onBlur={(e) => upd(s, { ko: e.target.value })} /></td><td><button className="btn sm ghost" onClick={() => del(s)}>삭제</button></td></tr>))}</tbody></table></div>
      <div className="muted small">문장을 수정한 뒤에는 "빈칸 문항" 탭에서 자동 생성을 다시 눌러 주세요.</div>
    </div>
  );
}

function BlanksEditor({ unitId, setMsg }) {
  const [source, setSource] = useState('dialogue'); const [diffSel, setDiff] = useState(null);
  const st = useAsync(() => listBlanks(unitId, source), [unitId, source]);
  const availDiffs = DIFF_ORDER.filter((k) => (st.data || []).some((b) => b.difficulty === k));
  const diff = diffSel && (availDiffs.includes(diffSel) || !availDiffs.length) ? diffSel : (availDiffs[0] || 'low');
  const lines = useAsync(async () => (source === 'dialogue' ? (await listDialogues(unitId)).flatMap((d) => d.dialogue_lines.map((l) => ({ ...l, label: d.title }))) : ((await getReading(unitId))?.reading_sentences || [])), [unitId, source]);
  const [busy, setBusy] = useState(false); const [picker, setPicker] = useState(null);
  const gen = async () => { if (!confirm('기존 빈칸 문항을 지우고 자동으로 다시 만들까요? (학생 기록의 연결이 끊길 수 있어요)')) return; setBusy(true); try { const n = await rpc('generate_blanks', { p_unit_id: unitId, p_source: source, p_replace: true }); setMsg(''); alert(`${n}개 문항 생성`); st.reload(); } catch (e) { setMsg(e.message); } finally { setBusy(false); } };
  const upd = async (b, patch) => { await supabase.from('blank_items').update(patch).eq('id', b.id); };
  const del = async (b) => { await supabase.from('blank_items').delete().eq('id', b.id); st.reload(); };
  if (st.loading) return <Loading />;
  const items = source === 'reading' ? st.data.filter((b) => b.difficulty === diff) : st.data;
  return (
    <div className="stack">
      <div className="row between">
        <div className="row"><Toggle value={source} onChange={setSource} options={[{ value: 'dialogue', label: '대화문 빈칸' }, { value: 'reading', label: '본문 빈칸' }]} />
          {source === 'reading' && <Toggle value={diff} onChange={setDiff} options={[...new Set([...availDiffs, 'low', 'mid', 'high'])].map((k) => ({ value: k, label: DIFF_LABEL[k] }))} />}</div>
        <div className="row"><button className="btn sm" disabled={busy} onClick={gen}>자동 생성</button><button className="btn sm primary" onClick={() => setPicker(picker ? null : {})}>{picker ? '닫기' : '+ 직접 빈칸 지정'}</button></div>
      </div>
      {picker && <ManualBlankPicker unitId={unitId} source={source} difficulty={source === 'reading' ? diff : null} lines={lines.data || []} onSaved={() => { setPicker(null); st.reload(); }} />}
      <div className="muted small">정답 칸에 "a / b" 처럼 쓰면 복수 정답으로 인정됩니다. 빈칸이 여러 개면 정답도 "첫째 ; 둘째" 처럼 세미콜론으로 나눠 적으세요.</div>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>#</th><th>문항 (___ 이 빈칸)</th><th>정답</th><th>해석/힌트</th><th>해설</th><th></th></tr></thead>
        <tbody>{items.map((b, i) => (
          <tr key={b.id}><td>{i + 1}</td>
            <td><input className="input en" defaultValue={b.prompt} style={{ width: 360 }} placeholder="(비우면 문장 전체 영작)" onBlur={(e) => upd(b, { prompt: e.target.value })} /></td>
            <td><input className="input en" defaultValue={b.answers.join(' ; ')} style={{ width: 200 }} onBlur={(e) => upd(b, { answers: e.target.value.split(';').map((s) => s.trim()).filter(Boolean) })} /></td>
            <td><input className="input" defaultValue={b.ko || ''} style={{ width: 240 }} onBlur={(e) => upd(b, { ko: e.target.value })} /></td>
            <td><input className="input" defaultValue={b.explanation || ''} style={{ width: 220 }} placeholder="오답 시 보여줄 설명" onBlur={(e) => upd(b, { explanation: e.target.value || null })} /></td>
            <td><button className="btn sm ghost" onClick={() => del(b)}>삭제</button></td></tr>))}
          {items.length === 0 && <tr><td colSpan={6} className="center muted">문항 없음 — "자동 생성"을 눌러 주세요</td></tr>}</tbody></table></div>
    </div>
  );
}

// 문장에서 단어를 클릭해 빈칸 지정
function ManualBlankPicker({ unitId, source, difficulty, lines, onSaved }) {
  const [lineId, setLineId] = useState(lines[0]?.id || ''); const [sel, setSel] = useState(new Set());
  const line = lines.find((l) => String(l.id) === String(lineId));
  const toks = (line?.en || '').split(/\s+/).filter(Boolean);
  const toggle = (i) => { const s = new Set(sel); s.has(i) ? s.delete(i) : s.add(i); setSel(s); };
  const clean = (t) => t.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, '');
  // 연속 선택은 하나의 빈칸(어구)으로 합침
  const groups = []; [...sel].sort((a, b) => a - b).forEach((i) => { const g = groups[groups.length - 1]; if (g && g[g.length - 1] === i - 1) g.push(i); else groups.push([i]); });
  const prompt = toks.map((t, i) => { const g = groups.find((x) => x.includes(i)); if (!g) return t; if (g[0] === i) { const lead = t.match(/^[^A-Za-z0-9']*/)[0]; const tail = toks[g[g.length - 1]].match(/[^A-Za-z0-9']*$/)[0]; return lead + '___' + tail; } return null; }).filter((x) => x != null).join(' ');
  const answers = groups.map((g) => g.map((i) => clean(toks[i])).join(' '));
  const save = async () => {
    if (!line || !groups.length) return;
    const row = { unit_id: unitId, source, difficulty, prompt, answers, ko: line.ko, sort_order: 9000 + (line.sort_order || 0) };
    if (source === 'dialogue') row.dialogue_line_id = line.id; else row.sentence_id = line.id;
    const { error } = await supabase.from('blank_items').insert(row); if (error) alert(error.message); else onSaved();
  };
  return (
    <div className="card stack">
      <b>직접 빈칸 지정 {difficulty ? `(${DIFF_LABEL[difficulty]})` : ''}</b>
      <select className="input" value={lineId} onChange={(e) => { setLineId(e.target.value); setSel(new Set()); }}>{lines.map((l) => <option key={l.id} value={l.id}>{l.label ? `[${l.label}] ` : ''}{l.en}</option>)}</select>
      <div className="muted small">빈칸으로 만들 단어를 클릭하세요. 이어진 단어를 여러 개 고르면 하나의 어구 빈칸이 됩니다.</div>
      <div>{toks.map((t, i) => <span key={i} className={`clickword ${sel.has(i) ? 'on' : ''}`} onClick={() => toggle(i)}>{t}</span>)}</div>
      {groups.length > 0 && <div className="small">미리보기: <span className="en">{prompt}</span> → 정답 <b className="en">{answers.join(' ; ')}</b></div>}
      <div><button className="btn primary sm" disabled={!groups.length} onClick={save}>문항 저장</button></div>
    </div>
  );
}

function ExamEditor({ unitId, setMsg }) {
  const st = useAsync(() => listExam(unitId), [unitId]);
  const blank = { school: '', year: new Date().getFullYear(), term: '1학기 중간', qtype: 'mc', question: '', choices: ['', '', '', '', ''], answer: '', explanation: '' };
  const [f, setF] = useState(blank);
  const add = async () => {
    if (!f.question.trim() || !f.answer.trim()) { setMsg('문제와 정답을 입력하세요.'); return; }
    const row = { unit_id: unitId, school: f.school, year: Number(f.year) || null, term: f.term, qtype: f.qtype, question: f.question, choices: f.qtype === 'mc' ? f.choices.filter((c) => c.trim()) : null, answer: f.answer, explanation: f.explanation, sort_order: (st.data?.length || 0) + 1 };
    if (err(setMsg)(await supabase.from('exam_questions').insert(row))) { setF({ ...blank, school: f.school, year: f.year, term: f.term }); st.reload(); }
  };
  const del = async (q) => { if (!confirm('삭제?')) return; await supabase.from('exam_questions').delete().eq('id', q.id); st.reload(); };
  const upd = async (q, patch) => { await supabase.from('exam_questions').update(patch).eq('id', q.id); };
  if (st.loading) return <Loading />;
  return (
    <div className="stack">
      <div className="card stack"><b>기출문제 추가</b>
        <div className="grid3"><input className="input" placeholder="학교 (거제중)" value={f.school} onChange={(e) => setF({ ...f, school: e.target.value })} /><input className="input" placeholder="연도" value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} /><input className="input" placeholder="학기 (1학기 중간)" value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })} /></div>
        <Toggle value={f.qtype} onChange={(v) => setF({ ...f, qtype: v })} options={[{ value: 'mc', label: '객관식' }, { value: 'essay', label: '서술형' }]} />
        <textarea className="input" rows={2} placeholder="문제" value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} />
        {f.qtype === 'mc' && f.choices.map((c, i) => <input key={i} className="input" placeholder={`선택지 ${i + 1}`} value={c} onChange={(e) => setF({ ...f, choices: f.choices.map((x, k) => (k === i ? e.target.value : x)) })} />)}
        <input className="input" placeholder={f.qtype === 'mc' ? '정답 번호 (예: 3)' : '정답 (복수 정답은 " / " 로 구분)'} value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} />
        <input className="input" placeholder="해설 (선택)" value={f.explanation} onChange={(e) => setF({ ...f, explanation: e.target.value })} />
        <div><button className="btn primary sm" onClick={add}>추가</button></div></div>
      <div className="list">{st.data.map((q, i) => (
        <div key={q.id} className="card">
          <div className="row between"><div className="row"><span className="badge">{i + 1}</span><span className="badge">{q.qtype === 'mc' ? '객관식' : '서술형'}</span><span className="muted small">{q.school} {q.year} {q.term}</span></div><button className="btn sm ghost" onClick={() => del(q)}>삭제</button></div>
          <textarea className="input mt" rows={2} defaultValue={q.question} onBlur={(e) => upd(q, { question: e.target.value })} />
          {q.qtype === 'mc' && <ol className="small" style={{ margin: '6px 0 0 18px' }}>{(q.choices || []).map((c, k) => <li key={k}>{c}</li>)}</ol>}
          <div className="row mt"><span className="small">정답</span><input className="input" defaultValue={q.answer} style={{ maxWidth: 320 }} onBlur={(e) => upd(q, { answer: e.target.value })} /><span className="small">해설</span><input className="input grow" defaultValue={q.explanation || ''} onBlur={(e) => upd(q, { explanation: e.target.value })} /></div>
        </div>
      ))}{st.data.length === 0 && <Empty>기출문제 없음</Empty>}</div>
    </div>
  );
}
