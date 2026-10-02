import { useState } from 'react';
import { supabase, unwrap } from '../../lib/supabase.js';
import { listPublishers, listUnits, listExam, dday } from '../../lib/api.js';
import { useAsync, Loading, ErrorBox, Empty } from '../../components/ui.jsx';
import { useAuth } from '../../lib/auth.jsx';

export default function Ranges() {
  const { profile } = useAuth();
  const st = useAsync(async () => ({
    ranges: await supabase.from('exam_ranges').select('*, publishers(name, level), exam_range_units(unit_id, units(unit_no, grade, title))').order('exam_date', { ascending: false }).then(unwrap),
    pubs: await listPublishers(),
    schools: [...new Set((await supabase.from('profiles').select('school').eq('role', 'student').then(unwrap)).map((x) => x.school).filter(Boolean))],
  }), []);
  const [editing, setEditing] = useState(null); // null | 'new' | range
  const [msg, setMsg] = useState('');
  if (st.loading) return <Loading />; if (st.error) return <ErrorBox error={st.error} />;
  const { ranges, pubs, schools } = st.data;
  const del = async (r) => { if (!confirm(`"${r.title}" 삭제?`)) return; await supabase.from('exam_ranges').delete().eq('id', r.id); st.reload(); };

  if (editing) return <RangeForm range={editing === 'new' ? null : editing} pubs={pubs} schools={schools} teacherId={profile.id} onDone={() => { setEditing(null); st.reload(); }} />;
  return (
    <div className="stack">
      <div className="row between"><h1>시험범위</h1><button className="btn primary" onClick={() => setEditing('new')}>+ 새 시험범위</button></div>
      <div className="muted small">학교·학년이 같은 학생들의 홈 화면에 "내 시험범위" 카드와 D-day, 진도율이 표시됩니다.</div>
      {msg && <div className="alert err">{msg}</div>}
      {ranges.length === 0 ? <Empty>아직 시험범위가 없어요.</Empty> : (
        <div className="list">{ranges.map((r) => (
          <div key={r.id} className="item" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <b>{r.title}</b> {r.exam_date && <span className={`badge ${dday(r.exam_date) <= 7 && dday(r.exam_date) >= 0 ? 'red' : ''}`}>{r.exam_date} (D{dday(r.exam_date) >= 0 ? '-' : '+'}{Math.abs(dday(r.exam_date))})</span>}
              <div className="small muted">{r.school} {r.grade}학년 · {r.publishers?.name} · {(r.exam_range_units || []).map((x) => `L${x.units?.unit_no}`).join(', ') || '유닛 없음'} · {[r.include_words && '단어', r.include_dialogue && '대화문', r.include_reading && '본문', r.include_exam && `기출${r.exam_years ? '(' + r.exam_years.join('·') + ')' : ''}`].filter(Boolean).join(' / ')}</div>
            </div>
            <button className="btn sm" onClick={() => setEditing(r)}>수정</button><button className="btn sm ghost" onClick={() => del(r)}>삭제</button>
          </div>
        ))}</div>
      )}
    </div>
  );
}

function RangeForm({ range, pubs, schools, teacherId, onDone }) {
  const [f, setF] = useState(range ? { ...range, exam_years: (range.exam_years || []).join(','), unit_ids: (range.exam_range_units || []).map((x) => x.unit_id) }
    : { title: '', school: schools[0] || '', grade: 2, publisher_id: pubs[0]?.id || '', exam_date: '', include_words: true, include_dialogue: true, include_reading: true, include_exam: true, exam_years: '', unit_ids: [] });
  const units = useAsync(() => (f.publisher_id ? listUnits(Number(f.publisher_id), Number(f.grade)) : []), [f.publisher_id, f.grade]);
  const years = useAsync(async () => {
    if (!f.unit_ids.length) return [];
    const all = await Promise.all(f.unit_ids.map((id) => listExam(id)));
    return [...new Set(all.flat().map((q) => q.year).filter(Boolean))].sort();
  }, [f.unit_ids.join(',')]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const toggleUnit = (id) => setF({ ...f, unit_ids: f.unit_ids.includes(id) ? f.unit_ids.filter((x) => x !== id) : [...f.unit_ids, id] });
  const autoTitle = () => setF({ ...f, title: `${f.school} ${f.grade}학년 ${f.exam_date ? (new Date(f.exam_date).getMonth() + 1 <= 6 ? '1학기' : '2학기') + ' ' : ''}시험` });
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const row = { title: f.title || `${f.school} ${f.grade}학년 시험`, school: f.school, grade: Number(f.grade), publisher_id: Number(f.publisher_id) || null, exam_date: f.exam_date || null,
        include_words: f.include_words, include_dialogue: f.include_dialogue, include_reading: f.include_reading, include_exam: f.include_exam,
        exam_years: f.exam_years.trim() ? f.exam_years.split(/[,\s·]+/).map(Number).filter(Boolean) : null, created_by: teacherId };
      let id = range?.id;
      if (id) { const { error } = await supabase.from('exam_ranges').update(row).eq('id', id); if (error) throw error; await supabase.from('exam_range_units').delete().eq('range_id', id); }
      else { const { data, error } = await supabase.from('exam_ranges').insert(row).select().single(); if (error) throw error; id = data.id; }
      if (f.unit_ids.length) { const { error } = await supabase.from('exam_range_units').insert(f.unit_ids.map((u) => ({ range_id: id, unit_id: u }))); if (error) throw error; }
      onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <div className="row"><button className="btn sm" onClick={onDone}>‹ 목록</button><h1 style={{ margin: 0 }}>{range ? '시험범위 수정' : '새 시험범위'}</h1></div>
      <div className="card stack">
        <div className="grid3">
          <div><label className="field">학교</label><input className="input" list="schools" value={f.school} onChange={(e) => setF({ ...f, school: e.target.value })} placeholder="거제중" /><datalist id="schools">{schools.map((s) => <option key={s} value={s} />)}</datalist></div>
          <div><label className="field">학년</label><select className="input" value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value, unit_ids: [] })}>{[1, 2, 3].map((g) => <option key={g} value={g}>{(pubs.find((p) => String(p.id) === String(f.publisher_id))?.level || '중')}{g}</option>)}</select></div>
          <div><label className="field">시험일</label><input className="input" type="date" value={f.exam_date || ''} onChange={(e) => setF({ ...f, exam_date: e.target.value })} /></div>
        </div>
        <div className="row"><div className="grow"><label className="field">제목</label><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="거제중 2학년 1학기 중간" /></div><button className="btn sm" style={{ marginTop: 18 }} onClick={autoTitle}>자동 제목</button></div>
        <div><label className="field">출판사</label><select className="input" value={f.publisher_id} onChange={(e) => setF({ ...f, publisher_id: e.target.value, unit_ids: [] })}>{pubs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label className="field">범위 유닛 (체크)</label>
          {units.loading ? <Loading /> : (units.data || []).length === 0 ? <div className="muted small">이 출판사·학년에 등록된 유닛이 없어요. 콘텐츠 관리에서 먼저 등록하세요.</div> : (
            <div className="row">{units.data.map((u) => <label key={u.id} className={`check btn sm ${f.unit_ids.includes(u.id) ? 'primary' : ''}`}><input type="checkbox" checked={f.unit_ids.includes(u.id)} onChange={() => toggleUnit(u.id)} style={{ display: 'none' }} />Lesson {u.unit_no} {u.title}</label>)}</div>)}
        </div>
        <div><label className="field">포함 자료</label><div className="row">
          {[['include_words', '단어테스트'], ['include_dialogue', '대화문 빈칸'], ['include_reading', '본문 빈칸'], ['include_exam', '기출문제']].map(([k, l]) => <label key={k} className="check"><input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} /> {l}</label>)}
        </div></div>
        {f.include_exam && <div><label className="field">기출 연도 (쉼표 구분, 비우면 전체){years.data?.length ? ` — 등록된 연도: ${years.data.join(', ')}` : ''}</label><input className="input" value={f.exam_years} onChange={(e) => setF({ ...f, exam_years: e.target.value })} placeholder="2024, 2025" /></div>}
        {err && <div className="alert err">{err}</div>}
        <div className="row"><button className="btn primary" disabled={busy || !f.school} onClick={save}>{busy ? '저장 중…' : '저장'}</button><button className="btn" onClick={onDone}>취소</button></div>
      </div>
    </div>
  );
}
