import { useMemo, useState } from 'react';
import { supabase, unwrap, rpc } from '../../lib/supabase.js';
import { rangeProgress, rangeReading, examSessionsForRange, examSessionsOf, termShort, downloadCsv, materialLabel, DIFF_LABEL, DIFF_ORDER, ITEM_TYPE_LABEL, dday } from '../../lib/api.js';
import { useAsync, Loading, ErrorBox, Empty, pctClass, unitLabel } from '../../components/ui.jsx';
const diffText = (d) => d ? DIFF_ORDER.filter((k) => d[k]).map((k) => `${DIFF_LABEL[k]} ${d[k].pct}%`).join(' · ') : '';

export default function Dashboard() {
  const ranges = useAsync(() => supabase.from('exam_ranges').select('*').order('exam_date', { ascending: false }).then(unwrap), []);
  const [rangeId, setRangeId] = useState('');
  const rid = rangeId || ranges.data?.[0]?.id;
  const [cls, setCls] = useState(''); const [school, setSchool] = useState(''); const [sortLow, setSortLow] = useState(false);
  const prog = useAsync(async () => {
    if (!rid) return [];
    const [p, rd, es] = await Promise.all([rangeProgress(Number(rid)), rangeReading(Number(rid)).catch(() => []), examSessionsForRange(Number(rid)).catch(() => [])]);
    const m = new Map((rd || []).map((x) => [x.student_id, x]));
    const sm = new Map(); for (const e of es || []) { if (!sm.has(e.student_id)) sm.set(e.student_id, []); sm.get(e.student_id).push(e); }
    return p.map((x) => ({ ...x, rd: m.get(x.student_id) || null, es: sm.get(x.student_id) || [] }));
  }, [rid]);

  const rows = useMemo(() => {
    let r = prog.data || [];
    if (cls) r = r.filter((x) => x.class_name === cls); if (school) r = r.filter((x) => x.school === school);
    if (sortLow) r = [...r].sort((a, b) => (a.word_pct + a.dialogue_pct + a.reading_pct + a.exam_pct) - (b.word_pct + b.dialogue_pct + b.reading_pct + b.exam_pct));
    return r;
  }, [prog.data, cls, school, sortLow]);
  const classes = [...new Set((prog.data || []).map((x) => x.class_name).filter(Boolean))];
  const schools = [...new Set((prog.data || []).map((x) => x.school).filter(Boolean))];
  const range = ranges.data?.find((r) => String(r.id) === String(rid));

  const exportCsv = () => downloadCsv(`진도율_${range?.title || ''}.csv`, [
    ['이름', '학교', '학년', '반', '단어테스트%', '대화문 읽기(통과/유닛)', '대화문 읽은 분', '대화문빈칸%', '본문 읽기(통과/유닛)', '본문 읽은 분', '본문빈칸%', '본문 유형별', '기출풀이%', '기출정답률%', '기출 제출(차수·점수)', '남은오답'],
    ...rows.map((r) => [r.name, r.school, r.grade, r.class_name, r.word_pct, r.rd ? `${r.rd.dialogue_passed}/${r.rd.dialogue_total}` : '', r.rd?.dialogue_minutes ?? '', r.dialogue_pct, r.rd ? `${r.rd.reading_passed}/${r.rd.reading_total}` : '', r.rd?.reading_minutes ?? '', r.reading_pct, diffText(r.reading_by_diff), r.exam_pct, r.exam_accuracy, sessionText(r.es), r.open_wrong]),
  ]);

  if (ranges.loading) return <Loading />; if (ranges.error) return <ErrorBox error={ranges.error} />;
  return (
    <div className="stack">
      <h1>진도율 대시보드</h1>
      {ranges.data.length === 0 ? <Empty>먼저 "시험범위" 탭에서 범위를 만들어 주세요.</Empty> : (<>
        <div className="card row">
          <div className="grow"><label className="field">시험범위</label><select className="input" value={rid || ''} onChange={(e) => setRangeId(e.target.value)}>{ranges.data.map((r) => <option key={r.id} value={r.id}>{r.title} ({r.exam_date || '날짜 미정'})</option>)}</select></div>
          <div><label className="field">학교</label><select className="input" value={school} onChange={(e) => setSchool(e.target.value)}><option value="">전체</option>{schools.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label className="field">반</label><select className="input" value={cls} onChange={(e) => setCls(e.target.value)}><option value="">전체</option>{classes.map((s) => <option key={s}>{s}</option>)}</select></div>
          <label className="check" style={{ marginTop: 18 }}><input type="checkbox" checked={sortLow} onChange={(e) => setSortLow(e.target.checked)} /> 진도 낮은 순</label>
          <button className="btn" style={{ marginTop: 18 }} onClick={exportCsv}>CSV 내보내기</button>
        </div>
        {range && <div className="muted small">{range.school} {range.level || '중'}{range.grade} · 시험일 {range.exam_date || '-'} {range.exam_date ? `(D-${dday(range.exam_date)})` : ''} · 대상 학생 {rows.length}명</div>}
        {prog.loading ? <Loading /> : prog.error ? <ErrorBox error={prog.error} /> : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>이름</th><th>반</th><th>단어테스트</th><th>대화문 읽기</th><th>대화문 빈칸</th><th>본문 읽기</th><th>본문 빈칸</th><th>본문 유형별</th><th>기출 풀이</th><th>기출 정답률</th><th>기출 제출</th><th>남은 오답</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.student_id}>
                  <td><b>{r.name}</b><div className="muted small">{r.school} {r.grade}학년</div></td><td>{r.class_name}</td>
                  <td className={`pct ${pctClass(r.word_pct)}`}>{r.word_pct}%<div className="small" style={{ fontWeight: 400 }}>{r.word_done}/{r.word_total}</div></td>
                  <ReadCell d={r.rd} k="dialogue" />
                  <td className={`pct ${pctClass(r.dialogue_pct)}`}>{r.dialogue_pct}%<div className="small" style={{ fontWeight: 400 }}>{r.dialogue_done}/{r.dialogue_total}</div></td>
                  <ReadCell d={r.rd} k="reading" />
                  <td className={`pct ${pctClass(r.reading_pct)}`}>{r.reading_pct}%<div className="small" style={{ fontWeight: 400 }}>{r.reading_done}/{r.reading_total}</div></td>
                  <td className="small">{diffText(r.reading_by_diff)}</td>
                  <td className={`pct ${pctClass(r.exam_pct)}`}>{r.exam_pct}%<div className="small" style={{ fontWeight: 400 }}>{r.exam_done}/{r.exam_total}</div></td>
                  <td className={`pct ${pctClass(r.exam_accuracy)}`}>{r.exam_accuracy}%</td>
                  <td className="small wrap" style={{ minWidth: 150 }}>{r.es.length ? <SessionBadges es={r.es} /> : <span className="muted">-</span>}</td>
                  <td className="center">{r.open_wrong > 0 ? <span className="badge red">{r.open_wrong}</span> : <span className="badge green">0</span>}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={12} className="center muted">해당 학교·학년의 학생이 없습니다. (학생 정보의 학교/학년이 범위와 같아야 해요)</td></tr>}
            </tbody>
          </table></div>
        )}
        <div className="muted small">색상: <span className="pct c-red" style={{ padding: '0 6px' }}>0~49%</span> <span className="pct c-yellow" style={{ padding: '0 6px' }}>50~79%</span> <span className="pct c-green" style={{ padding: '0 6px' }}>80~100%</span> · 단어/빈칸은 "1회 이상 정답" 기준, 기출은 "풀이 완료" 기준</div>
      </>)}
      <HomeworkStatus />
    </div>
  );
}

function HomeworkStatus() {
  const st = useAsync(async () => {
    const [hw, students] = await Promise.all([
      supabase.from('homework').select('*, units(unit_no, grade, title, publishers(name, level)), homework_completions(student_id)').order('due_date', { ascending: false }).limit(20).then(unwrap),
      supabase.from('profiles').select('id, name, class_name').eq('role', 'student').then(unwrap),
    ]);
    return { hw, students };
  }, []);
  if (st.loading || st.error) return null;
  const { hw, students } = st.data;
  if (!hw.length) return null;
  return (
    <div>
      <h2>숙제 완료 현황</h2>
      <div className="list">
        {hw.map((h) => {
          const target = students.filter((s) => s.class_name === h.class_name);
          const done = new Set((h.homework_completions || []).map((c) => c.student_id));
          const notDone = target.filter((s) => !done.has(s.id));
          return (
            <div key={h.id} className="item" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <b>{h.class_name} · {materialLabel(h.material)}{h.difficulty ? ` (${DIFF_LABEL[h.difficulty]})` : ''}</b> <span className="muted small">{unitLabel(h.units)} · 마감 {h.due_date}</span>
                <div className="small mt" style={{ marginTop: 4 }}>{notDone.length === 0 ? <span className="green">전원 완료</span> : <><span className="red">미완료 {notDone.length}명:</span> {notDone.map((s) => s.name).join(', ')}</>}</div>
              </div>
              <span className={`badge ${notDone.length === 0 ? 'green' : 'yellow'}`}>{done.size}/{target.length}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WrongTop() {
  const [cls, setCls] = useState('');
  const [studentId, setStudentId] = useState('');
  const students = useAsync(() => supabase.from('profiles').select('id, name, class_name, school, level, grade').eq('role', 'student').order('class_name').order('name').then(unwrap), []);
  const sess = useAsync(async () => (studentId ? examSessionsOf(studentId).catch(() => []) : []), [studentId]);
  const notes = useAsync(async () => (studentId ? supabase.from('wrong_notes').select('*, units(unit_no, grade, publishers(level))').eq('student_id', studentId).order('status').order('wrong_count', { ascending: false }).then(unwrap) : []), [studentId]);
  const all = students.data || [];
  const classes = [...new Set(all.map((x) => x.class_name).filter(Boolean))];
  const list = cls ? all.filter((s) => s.class_name === cls) : all;
  const open = (notes.data || []).filter((n) => n.status === 'open').length;
  return (
    <div className="stack">
      <h1>오답 분석</h1>
      <div className="card row">
        <div><label className="field">반</label><select className="input" value={cls} onChange={(e) => { setCls(e.target.value); setStudentId(''); }}><option value="">전체</option>{classes.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="grow"><label className="field">학생</label><select className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)}><option value="">학생 선택…</option>{list.map((s) => <option key={s.id} value={s.id}>{s.class_name ? s.class_name + ' · ' : ''}{s.name} ({s.school || '-'}{s.grade ? ` ${s.level || '중'}${s.grade}` : ''})</option>)}</select></div>
      </div>
      {!studentId && <Empty>학생을 선택하면 오답노트(남은 오답·해결된 오답·학생 메모)를 볼 수 있어요.</Empty>}
      {studentId && (notes.loading ? <Loading /> : (
        <>
          {(sess.data || []).length > 0 && (
            <div className="card">
              <b>기출 제출 기록</b> <span className="muted small">{sess.data.length}회</span>
              <div className="tbl-wrap" style={{ marginTop: 8 }}><table className="tbl" style={{ minWidth: 420 }}><thead><tr><th>유닛</th><th>회차·유형</th><th>제출</th><th>점수</th><th>날짜</th></tr></thead>
                <tbody>{sess.data.map((x) => <tr key={x.id}><td>{x.units ? `${x.units.publishers?.level || '중'}${x.units.grade} L${x.units.unit_no}` : x.unit_id}</td><td>{termShort(x.term)}{x.qtype ? (x.qtype === 'mc' ? ' 객관식' : ' 서술형') : ' 전체'}</td><td className="center">{x.attempt_no}차</td><td className={`pct ${pctClass(x.score)}`}>{x.score}점 <span className="small" style={{ fontWeight: 400 }}>({x.correct}/{x.total})</span></td><td className="small">{new Date(x.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td></tr>)}</tbody></table></div>
            </div>
          )}
          <div className="muted small">남은 오답 <b className="red">{open}</b>개 · 해결 {(notes.data || []).length - open}개</div>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>상태</th><th>유형</th><th>유닛</th><th>문항</th><th>학생 메모</th><th>오답 횟수</th><th>연속 정답</th></tr></thead>
            <tbody>{(notes.data || []).map((n) => <tr key={n.id}><td><span className={`badge ${n.status === 'open' ? 'red' : 'green'}`}>{n.status === 'open' ? '남음' : '해결'}</span></td><td>{ITEM_TYPE_LABEL[n.item_type]}{n.sub_mode && n.item_type === 'reading_blank' ? ` · ${DIFF_LABEL[n.sub_mode] || n.sub_mode}` : ''}</td><td>{n.units ? `${n.units.publishers?.level || '중'}${n.units.grade} L${n.units.unit_no}` : ''}</td><td className="wrap"><NoteText n={n} /></td><td className="wrap small" style={{ color: '#8a6a00' }}>{n.memo || ''}</td><td className="center">{n.wrong_count}</td><td className="center">{n.correct_streak}</td></tr>)}
              {(notes.data || []).length === 0 && <tr><td colSpan={7} className="center muted">오답 없음</td></tr>}</tbody></table></div>
        </>
      ))}
    </div>
  );
}
function NoteText({ n }) {
  const st = useAsync(async () => {
    if (n.item_type === 'word') { const { data } = await supabase.from('words').select('en, ko').eq('id', n.item_id).maybeSingle(); return data ? `${data.en} — ${data.ko}` : '(삭제됨)'; }
    if (n.item_type === 'exam') { const { data } = await supabase.from('exam_questions').select('question').eq('id', n.item_id).maybeSingle(); return data ? data.question.replace(/<\/?u>/g, '').slice(0, 70) : '(삭제됨)'; }
    const { data } = await supabase.from('blank_items').select('prompt, answers, ko').eq('id', n.item_id).maybeSingle();
    return data ? (data.prompt ? data.prompt.replace(/___/g, `[${data.answers.join('|')}]`) : `[영작] ${data.answers[0]}`) : '(삭제됨)';
  }, [n.id]);
  return <span className="en small">{st.loading ? '…' : st.data}</span>;
}

// 읽기 확인 칸: 통과 유닛 수/범위 유닛 수 + 읽은 시간(분). 유닛별 상세는 툴팁
function ReadCell({ d, k }) {
  if (!d) return <td className="center muted">-</td>;
  const passed = d[`${k}_passed`], total = d[`${k}_total`], min = d[`${k}_minutes`];
  const p = total ? Math.round(passed / total * 100) : 0;
  const detail = Object.entries(d.detail || {}).map(([no, v]) => { const x = v?.[k === 'dialogue' ? 'd' : 'r']; return `L${no}: ${x ? (x.passed ? '통과' : (x.best != null ? `미통과(${x.best})` : '열람만')) + (x.min ? ` ${x.min}분` : '') : '-'}`; }).join('\n');
  return <td className={`pct ${total ? pctClass(p) : ''}`} title={detail}>{total ? `${passed}/${total}` : '-'}<div className="small" style={{ fontWeight: 400 }}>{min ? `${min}분 읽음` : '열람 없음'}</div></td>;
}

// 기출 제출 기록 (진도율 표): 유닛별로 "L1 1차 75 → 2차 80"
function groupSessions(es) {
  const g = new Map();
  for (const e of es) { const k = `${e.unit_id}|${e.term || ''}|${e.qtype || ''}`; if (!g.has(k)) g.set(k, []); g.get(k).push(e); }
  return [...g.values()].map((list) => list.sort((a, b) => a.attempt_no - b.attempt_no));
}
function sessionText(es) { return groupSessions(es).map((l) => `${termShort(l[0].term)}${l[0].qtype ? (l[0].qtype === 'mc' ? '객' : '서') : ''}: ${l.map((x) => `${x.attempt_no}차 ${x.score}`).join(' → ')}`).join(' / '); }
function SessionBadges({ es }) {
  return <div className="stack" style={{ gap: 2 }}>{groupSessions(es).map((l, i) => <div key={i}><span className="muted">{termShort(l[0].term)}{l[0].qtype ? (l[0].qtype === 'mc' ? ' 객관식' : ' 서술형') : ''}</span> {l.map((x, k) => <span key={x.id || k}>{k > 0 && <span className="muted"> → </span>}<b className={x.score >= 80 ? 'green' : x.score >= 50 ? '' : 'red'}>{x.attempt_no}차 {x.score}점</b></span>)}</div>)}</div>;
}
