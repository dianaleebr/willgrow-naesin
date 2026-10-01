import { useMemo, useState } from 'react';
import { supabase, unwrap } from '../../lib/supabase.js';
import { listUnits, MATERIALS, materialLabel, DIFF_LABEL, DIFF_ORDER, today } from '../../lib/api.js';
import { useAsync, Loading, ErrorBox, Empty, unitLabel, gradeLabel } from '../../components/ui.jsx';
import { useAuth } from '../../lib/auth.jsx';

// 체크박스 묶음 (전체 선택 포함)
function CheckGroup({ title, items, selected, onChange, render, compact }) {
  const ids = items.map((i) => i.id);
  const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
  const toggleAll = () => { const s = new Set(selected); if (allOn) ids.forEach((id) => s.delete(id)); else ids.forEach((id) => s.add(id)); onChange(s); };
  const toggle = (id) => { const s = new Set(selected); if (s.has(id)) s.delete(id); else s.add(id); onChange(s); };
  return (
    <div className="stack" style={{ gap: 6 }}>
      {title !== undefined && <div className="row between" style={{ alignItems: 'center' }}><b>{title}</b><button type="button" className="btn sm ghost" onClick={toggleAll}>{allOn ? '전체 해제' : '전체 선택'}</button></div>}
      <div className={compact ? 'row' : 'stack'} style={{ gap: compact ? 8 : 4, flexWrap: 'wrap' }}>
        {items.map((i) => (
          <label key={i.id} className="check" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} /> {render(i)}
          </label>
        ))}
      </div>
    </div>
  );
}

// 숙제 배정 + 수업 모드
export default function Assign() {
  const { profile } = useAuth();
  const meta = useAsync(async () => {
    const students = await supabase.from('profiles').select('class_name, grade, publisher_id').eq('role', 'student').then(unwrap);
    return { students, classes: [...new Set(students.map((x) => x.class_name).filter(Boolean))].sort(), units: await listUnits(null, null) };
  }, []);
  const hw = useAsync(() => supabase.from('homework').select('*, units(unit_no, grade, title, publishers(name, level)), homework_completions(student_id)').order('due_date', { ascending: false }).limit(60).then(unwrap), []);
  const live = useAsync(() => supabase.from('live_sessions').select('*, units(unit_no, grade, title, publishers(name, level))').eq('active', true).order('created_at', { ascending: false }).then(unwrap), []);

  const [cls, setCls] = useState('');
  const [pub, setPub] = useState('');                    // 출판사 필터 ('' = 전체)
  const [showAll, setShowAll] = useState(false);         // 반 학년과 무관하게 모든 유닛 보기
  const [unitSel, setUnitSel] = useState(new Set());     // 선택한 유닛 id
  const [matSel, setMatSel] = useState(new Set(['word_test'])); // 선택한 자료
  const [diffSel, setDiffSel] = useState(new Set(['w2'])); // 본문 빈칸 난이도
  const [due, setDue] = useState(today());
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  // 출판사 → 학년 → 유닛 순으로 정렬한 그룹
  const groups = useMemo(() => {
    const units = meta.data?.units || [];
    const sorted = [...units].sort((a, b) => (a.publishers?.name || '').localeCompare(b.publishers?.name || '', 'ko') || (a.grade - b.grade) || (a.unit_no - b.unit_no));
    const map = new Map();
    for (const u of sorted) { const key = `${u.publishers?.name || '(출판사 없음)'} ${gradeLabel(u)}`; if (!map.has(key)) map.set(key, { key, pub: u.publishers?.name || '', pubId: u.publisher_id, level: u.publishers?.level || '중', grade: u.grade, units: [] }); map.get(key).units.push(u); }
    return [...map.values()];
  }, [meta.data]);

  if (meta.loading) return <Loading />; if (meta.error) return <ErrorBox error={meta.error} />;
  const { classes, units, students } = meta.data;
  const className = cls || classes[0] || '';

  // 반 이름(예: "중2A", "고1 심화")에서 학년을 읽고, 없으면 그 반 학생들의 학년·출판사로 범위를 정함
  const inClass = students.filter((s) => s.class_name === className);
  const m = /(중|고)\s*([1-3])/.exec(className || '');
  const classLevel = m ? m[1] : null;
  const classGrade = m ? Number(m[2]) : (inClass.map((s) => s.grade).filter(Boolean).sort((a, b) => inClass.filter((s) => s.grade === b).length - inClass.filter((s) => s.grade === a).length)[0] || null);
  const classPubIds = new Set(inClass.map((s) => s.publisher_id).filter(Boolean));
  const inScope = (g) => (!classGrade || g.grade === classGrade) && (!classLevel || g.level === classLevel) && (classPubIds.size === 0 || classPubIds.has(g.pubId));
  const scoped = showAll ? groups : groups.filter(inScope);
  const pubNames = [...new Set(scoped.map((g) => g.pub))];
  const visible = pub && pubNames.includes(pub) ? scoped.filter((g) => g.pub === pub) : scoped;
  const scopeLabel = showAll ? '전체 유닛' : [classLevel ? `${classLevel}${classGrade || ''}` : (classGrade ? `${classGrade}학년` : null), classPubIds.size ? [...classPubIds].map((id) => units.find((u) => u.publisher_id === id)?.publishers?.name).filter(Boolean).join('·') : null].filter(Boolean).join(' · ') || '전체 유닛';
  const changeClass = (v) => { setCls(v); setPub(''); setUnitSel(new Set()); };
  const needDiff = matSel.has('reading_blank');
  const unitIds = units.filter((u) => unitSel.has(u.id)).map((u) => u.id);
  const materials = MATERIALS.filter((m) => matSel.has(m.key)).map((m) => m.key);
  const diffs = DIFF_ORDER.filter((d) => diffSel.has(d));

  // 유닛 × 자료 (× 본문빈칸 난이도) 조합
  const buildRows = () => {
    const rows = [];
    for (const unit_id of unitIds) for (const material of materials) {
      if (material === 'reading_blank') { for (const difficulty of diffs) rows.push({ unit_id, material, difficulty }); }
      else rows.push({ unit_id, material, difficulty: null });
    }
    return rows;
  };
  const rows = buildRows();
  const validate = () => {
    if (!className) return '반이 없어요. 학생 계정에 반을 먼저 넣어 주세요.';
    if (!unitIds.length) return '유닛을 하나 이상 선택하세요.';
    if (!materials.length) return '자료를 하나 이상 선택하세요.';
    if (needDiff && !diffs.length) return '본문 빈칸시험 난이도를 하나 이상 선택하세요.';
    return '';
  };

  const addHw = async () => {
    const v = validate(); if (v) { setErr(v); setOk(''); return; }
    setBusy(true); setErr(''); setOk('');
    const { error } = await supabase.from('homework').insert(rows.map((r) => ({ ...r, class_name: className, due_date: due, note, created_by: profile.id })));
    setBusy(false);
    if (error) setErr(error.message); else { setOk(`${className} 반에 숙제 ${rows.length}개를 배정했어요.`); hw.reload(); }
  };
  const delHw = async (h) => { await supabase.from('homework').delete().eq('id', h.id); hw.reload(); };
  const delHwBatch = async (list) => { if (!list.length) return; if (!confirm(`${list.length}개 숙제를 삭제할까요?`)) return; await supabase.from('homework').delete().in('id', list.map((h) => h.id)); hw.reload(); };
  const startLive = async () => {
    const v = validate(); if (v) { setErr(v); setOk(''); return; }
    if (rows.length !== 1) { setErr('수업 모드는 유닛 1개 · 자료 1개만 고를 수 있어요. (지금 ' + rows.length + '개 조합)'); setOk(''); return; }
    setBusy(true); setErr(''); setOk('');
    await supabase.from('live_sessions').update({ active: false }).eq('class_name', className).eq('active', true);
    const { error } = await supabase.from('live_sessions').insert({ class_name: className, ...rows[0], created_by: profile.id });
    setBusy(false);
    if (error) setErr(error.message); else { setOk('수업 모드를 시작했어요.'); live.reload(); }
  };
  const stopLive = async (s) => { await supabase.from('live_sessions').update({ active: false }).eq('id', s.id); live.reload(); };

  // 배정된 숙제: 반 · 마감일별로 묶어서 표시
  const hwGroups = (() => { const m = new Map(); for (const h of hw.data || []) { const k = `${h.class_name}|${h.due_date}`; if (!m.has(k)) m.set(k, { class_name: h.class_name, due_date: h.due_date, items: [] }); m.get(k).items.push(h); } return [...m.values()]; })();

  return (
    <div className="stack">
      <h1>숙제 · 수업 모드</h1>
      {classes.length === 0 && <Empty>학생 계정에 "반"이 있어야 배정할 수 있어요.</Empty>}
      <div className="card stack">
        <div className="row" style={{ gap: 12, alignItems: 'flex-end' }}>
          <div><label className="field">반</label><select className="input" value={className} onChange={(e) => changeClass(e.target.value)}>{classes.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="grow"><label className="field">출판사</label>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className={`btn sm ${pub === '' ? 'primary' : ''}`} onClick={() => setPub('')}>전체</button>
              {pubNames.map((p) => <button key={p} type="button" className={`btn sm ${pub === p ? 'primary' : ''}`} onClick={() => setPub(p)}>{p || '(출판사 없음)'}</button>)}
            </div>
          </div>
        </div>

        <div className="row between" style={{ alignItems: 'center' }}>
          <label className="field" style={{ margin: 0 }}>유닛 <span className="muted small">({unitIds.length}개 선택 · 범위: {scopeLabel})</span></label>
          <div className="row" style={{ gap: 6 }}>
            {unitIds.length > 0 && <button type="button" className="btn sm ghost" onClick={() => setUnitSel(new Set())}>선택 모두 해제</button>}
            {groups.length !== scoped.length || showAll ? <button type="button" className="btn sm ghost" onClick={() => { setShowAll(!showAll); setPub(''); }}>{showAll ? '이 반 범위만 보기' : '전체 유닛 보기'}</button> : null}
          </div>
        </div>
        <div className="stack" style={{ gap: 12, maxHeight: 320, overflowY: 'auto', padding: '4px 2px', border: '1px solid var(--line, #e5e5e5)', borderRadius: 10 }}>
          {visible.length === 0 ? <Empty>{groups.length === 0 ? '유닛이 없어요. 콘텐츠에서 먼저 올려 주세요.' : `${className} 반 범위(${scopeLabel})에 맞는 유닛이 없어요. "전체 유닛 보기"를 눌러 보세요.`}</Empty> : visible.map((g) => (
            <div key={g.key} style={{ padding: '4px 8px' }}>
              <CheckGroup title={g.key} items={g.units} selected={unitSel} onChange={setUnitSel} compact render={(u) => <span>L{u.unit_no}{u.title ? <span className="muted small"> {u.title}</span> : null}</span>} />
            </div>
          ))}
        </div>

        <label className="field" style={{ marginBottom: 0 }}>자료 <span className="muted small">({materials.length}개 선택)</span></label>
        <CheckGroup title="" items={MATERIALS.map((m) => ({ id: m.key, ...m }))} selected={matSel} onChange={setMatSel} compact render={(m) => m.label} />
        {needDiff && <>
          <label className="field" style={{ marginBottom: 0 }}>본문 빈칸시험 난이도 <span className="muted small">(고른 만큼 각각 숙제가 만들어져요)</span></label>
          <CheckGroup title="" items={DIFF_ORDER.map((d) => ({ id: d }))} selected={diffSel} onChange={setDiffSel} compact render={(d) => DIFF_LABEL[d.id]} />
        </>}

        <hr className="sep" />
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div><label className="field">숙제 마감일</label><input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          <div className="grow"><label className="field">메모 (선택)</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 한→영 20문항" /></div>
        </div>
        <div className="row" style={{ alignItems: 'center' }}>
          <button className="btn primary" disabled={busy || !rows.length} onClick={addHw}>{busy ? '배정 중…' : `숙제로 배정 (${rows.length}개)`}</button>
          <button className="btn green" disabled={busy} onClick={startLive}>지금 수업에서 풀기</button>
          <span className="muted small">유닛 {unitIds.length} × 자료 {materials.length}{needDiff ? ` (빈칸 난이도 ${diffs.length})` : ''} = 숙제 {rows.length}개</span>
        </div>
        {err && <div className="alert err">{err}</div>}
        {ok && <div className="alert ok">{ok}</div>}
        <div className="muted small">"지금 수업에서 풀기"는 유닛 1개 · 자료 1개를 골랐을 때 쓸 수 있어요. 누르면 그 반 학생들의 홈 화면 맨 위에 10초 안에 "지금 수업 자료" 카드가 뜹니다.</div>
      </div>

      <h2>진행 중인 수업 모드</h2>
      {(live.data || []).length === 0 ? <Empty>진행 중인 수업 자료가 없어요.</Empty> : (
        <div className="list">{live.data.map((s) => <div key={s.id} className="item"><span className="badge green">LIVE</span><div className="grow"><b>{s.class_name}</b> · {materialLabel(s.material)}{s.difficulty ? ` (${DIFF_LABEL[s.difficulty]})` : ''}<div className="muted small">{unitLabel(s.units)}</div></div><button className="btn sm" onClick={() => stopLive(s)}>종료</button></div>)}</div>
      )}

      <h2>배정된 숙제</h2>
      {hw.loading ? <Loading /> : hwGroups.length === 0 ? <Empty>배정된 숙제가 없어요.</Empty> : (
        <div className="stack">{hwGroups.map((g) => (
          <div key={g.class_name + g.due_date} className="card stack" style={{ gap: 6 }}>
            <div className="row between" style={{ alignItems: 'center' }}><div><b>{g.class_name}</b> <span className="muted small">마감 {g.due_date} · {g.items.length}개</span></div><button className="btn sm ghost" onClick={() => delHwBatch(g.items)}>이 묶음 삭제</button></div>
            <div className="list">{g.items.map((h) => (
              <div key={h.id} className="item">
                <div className="grow">{materialLabel(h.material)}{h.difficulty ? ` (${DIFF_LABEL[h.difficulty]})` : ''} <span className="muted small">{unitLabel(h.units)}</span><div className="muted small">{h.note ? `${h.note} · ` : ''}완료 {(h.homework_completions || []).length}명</div></div>
                <button className="btn sm ghost" onClick={() => delHw(h)}>삭제</button></div>
            ))}</div>
          </div>
        ))}</div>
      )}
    </div>
  );
}
