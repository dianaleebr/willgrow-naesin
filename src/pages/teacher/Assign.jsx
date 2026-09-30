import { useState } from 'react';
import { supabase, unwrap } from '../../lib/supabase.js';
import { listUnits, MATERIALS, materialLabel, DIFF_LABEL, today } from '../../lib/api.js';
import { useAsync, Loading, ErrorBox, Empty, unitLabel } from '../../components/ui.jsx';
import { useAuth } from '../../lib/auth.jsx';

// 숙제 배정 + 수업 모드
export default function Assign() {
  const { profile } = useAuth();
  const meta = useAsync(async () => ({
    classes: [...new Set((await supabase.from('profiles').select('class_name').eq('role', 'student').then(unwrap)).map((x) => x.class_name).filter(Boolean))].sort(),
    units: await listUnits(null, null),
  }), []);
  const hw = useAsync(() => supabase.from('homework').select('*, units(unit_no, grade, title, publishers(name, level)), homework_completions(student_id)').order('due_date', { ascending: false }).limit(30).then(unwrap), []);
  const live = useAsync(() => supabase.from('live_sessions').select('*, units(unit_no, grade, title, publishers(name, level))').eq('active', true).order('created_at', { ascending: false }).then(unwrap), []);
  const [f, setF] = useState({ class_name: '', unit_id: '', material: 'word_test', difficulty: 'low', due_date: today(), note: '' });
  const [err, setErr] = useState('');

  if (meta.loading) return <Loading />; if (meta.error) return <ErrorBox error={meta.error} />;
  const { classes, units } = meta.data;
  const cls = f.class_name || classes[0] || ''; const unitId = f.unit_id || units[0]?.id || '';
  const needDiff = f.material === 'reading_blank';

  const addHw = async () => {
    if (!cls || !unitId) { setErr('반과 유닛을 고르세요.'); return; }
    const { error } = await supabase.from('homework').insert({ class_name: cls, unit_id: Number(unitId), material: f.material, difficulty: needDiff ? f.difficulty : null, due_date: f.due_date, note: f.note, created_by: profile.id });
    if (error) setErr(error.message); else { setErr(''); hw.reload(); }
  };
  const delHw = async (h) => { await supabase.from('homework').delete().eq('id', h.id); hw.reload(); };
  const startLive = async () => {
    if (!cls || !unitId) { setErr('반과 유닛을 고르세요.'); return; }
    await supabase.from('live_sessions').update({ active: false }).eq('class_name', cls).eq('active', true);
    const { error } = await supabase.from('live_sessions').insert({ class_name: cls, unit_id: Number(unitId), material: f.material, difficulty: needDiff ? f.difficulty : null, created_by: profile.id });
    if (error) setErr(error.message); else { setErr(''); live.reload(); }
  };
  const stopLive = async (s) => { await supabase.from('live_sessions').update({ active: false }).eq('id', s.id); live.reload(); };

  return (
    <div className="stack">
      <h1>숙제 · 수업 모드</h1>
      {classes.length === 0 && <Empty>학생 계정에 "반"이 있어야 배정할 수 있어요.</Empty>}
      <div className="card stack">
        <div className="grid3">
          <div><label className="field">반</label><select className="input" value={cls} onChange={(e) => setF({ ...f, class_name: e.target.value })}>{classes.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div><label className="field">유닛</label><select className="input" value={unitId} onChange={(e) => setF({ ...f, unit_id: e.target.value })}>{units.map((u) => <option key={u.id} value={u.id}>{u.publishers?.name} 중{u.grade} L{u.unit_no} {u.title}</option>)}</select></div>
          <div><label className="field">자료</label><select className="input" value={f.material} onChange={(e) => setF({ ...f, material: e.target.value })}>{MATERIALS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></div>
        </div>
        {needDiff && <div><label className="field">난이도</label><select className="input" value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })}>{Object.entries(DIFF_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>}
        {err && <div className="alert err">{err}</div>}
        <hr className="sep" />
        <div className="row">
          <div><label className="field">숙제 마감일</label><input className="input" type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></div>
          <div className="grow"><label className="field">메모 (선택)</label><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="예: 한→영 20문항" /></div>
          <button className="btn primary" style={{ marginTop: 18 }} onClick={addHw}>숙제로 배정</button>
          <button className="btn green" style={{ marginTop: 18 }} onClick={startLive}>지금 수업에서 풀기</button>
        </div>
        <div className="muted small">"지금 수업에서 풀기"를 누르면 그 반 학생들의 홈 화면 맨 위에 10초 안에 "지금 수업 자료" 카드가 뜹니다. 풀이는 수업 모드로 기록돼요.</div>
      </div>

      <h2>진행 중인 수업 모드</h2>
      {(live.data || []).length === 0 ? <Empty>진행 중인 수업 자료가 없어요.</Empty> : (
        <div className="list">{live.data.map((s) => <div key={s.id} className="item"><span className="badge green">LIVE</span><div className="grow"><b>{s.class_name}</b> · {materialLabel(s.material)}{s.difficulty ? ` (${DIFF_LABEL[s.difficulty]})` : ''}<div className="muted small">{unitLabel(s.units)}</div></div><button className="btn sm" onClick={() => stopLive(s)}>종료</button></div>)}</div>
      )}

      <h2>배정된 숙제</h2>
      {hw.loading ? <Loading /> : (hw.data || []).length === 0 ? <Empty>배정된 숙제가 없어요.</Empty> : (
        <div className="list">{hw.data.map((h) => (
          <div key={h.id} className="item">
            <div className="grow"><b>{h.class_name}</b> · {materialLabel(h.material)}{h.difficulty ? ` (${DIFF_LABEL[h.difficulty]})` : ''} <span className="muted small">{unitLabel(h.units)}</span><div className="muted small">마감 {h.due_date}{h.note ? ` · ${h.note}` : ''} · 완료 {(h.homework_completions || []).length}명</div></div>
            <button className="btn sm ghost" onClick={() => delHw(h)}>삭제</button></div>
        ))}</div>
      )}
    </div>
  );
}
