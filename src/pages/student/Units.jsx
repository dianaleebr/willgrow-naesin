import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { listUnits, getUnit, MATERIALS, myRanges, myUnitSteps, stepUnlocked, unitHomeworkMaterials, STEP_DONE_HINT, STEP_ORDER } from '../../lib/api.js';
import { useAsync, Loading, ErrorBox, Empty, unitLabel, gradeLabel } from '../../components/ui.jsx';

// 학생: 내 출판사 유닛 목록만
export function UnitList() {
  const { profile } = useAuth();
  const st = useAsync(async () => {
    const [units, ranges] = await Promise.all([listUnits(profile.publisher_id, null), myRanges(profile)]);
    const inRange = new Set(ranges.flatMap((r) => (r.exam_range_units || []).map((x) => x.unit_id)));
    return { units, inRange };
  }, [profile.publisher_id]);
  if (st.loading) return <Loading />;
  if (st.error) return <ErrorBox error={st.error} />;
  const { units, inRange } = st.data;
  const mine = units.filter((u) => !profile.grade || u.grade === profile.grade);
  const others = units.filter((u) => profile.grade && u.grade !== profile.grade);
  const Row = ({ u }) => (
    <Link to={`/unit/${u.id}`} className="item">
      <span className="badge">{gradeLabel(u)}</span>
      <div className="grow"><b>{u.unit_no >= 90 ? u.title : `Lesson ${u.unit_no}`}</b> <span className="muted">{u.unit_no >= 90 ? "" : u.title}</span></div>
      {inRange.has(u.id) && <span className="badge red">시험범위</span>}
      <span className="muted">›</span>
    </Link>
  );
  return (
    <div className="stack">
      <h1>유닛 학습</h1>
      <div className="muted">{profile.publisher_name || '출판사 미지정 — 선생님께 문의하세요'}</div>
      {!profile.publisher_id && <Empty>출판사가 설정되지 않아 유닛이 보이지 않아요.</Empty>}
      {units.length === 0 && profile.publisher_id && <Empty>등록된 유닛이 아직 없어요.</Empty>}
      <div className="list">{mine.map((u) => <Row key={u.id} u={u} />)}</div>
      {others.length > 0 && <><h3 className="muted mt">다른 학년</h3><div className="list">{others.map((u) => <Row key={u.id} u={u} />)}</div></>}
    </div>
  );
}

export function UnitMenu() {
  const { unitId } = useParams();
  const { profile } = useAuth();
  const st = useAsync(async () => ({ u: await getUnit(unitId), done: await myUnitSteps(Number(unitId)).catch(() => new Set()), hw: await unitHomeworkMaterials(profile?.class_name, Number(unitId)).catch(() => new Set()) }), [unitId]);
  if (st.loading) return <Loading />;
  if (st.error) return <ErrorBox error={st.error} />;
  const { u, done, hw } = st.data; const isTeacher = profile?.role === 'teacher';
  const paths = { words: 'words', word_test: 'word-test', dialogue: 'dialogue', dialogue_blank: 'dialogue-blank', reading: 'reading', reading_blank: 'reading-blank', reading_analysis: 'reading-analysis', exam: 'exam' };
  const next = STEP_ORDER.find((k) => !done.has(k));
  return (
    <div className="stack">
      <div><div className="muted small">{u.publishers?.name} · {gradeLabel(u)}</div><h1>{u.unit_no >= 90 ? '' : `Lesson ${u.unit_no} `}{u.title}</h1></div>
      {!isTeacher && <div className="muted small">순서대로 학습해요: 앞 단계를 끝내야 다음 단계가 열려요. (배정된 숙제는 바로 열림) {next ? <>지금 할 단계: <b className="red">{MATERIALS.find((m) => m.key === next)?.label}</b></> : <b className="green">모든 단계 완료!</b>}</div>}
      <div className="grid2">
        {MATERIALS.map((m, i) => {
          const open = stepUnlocked(m.key, done, isTeacher, hw); const isDone = done.has(m.key); const isHw = hw.has(m.key);
          const prev = STEP_ORDER[i - 1];
          if (!open) return <div key={m.key} className="tile locked"><b>{i + 1}. {m.label} <span className="muted">잠김</span></b><span className="muted small">{STEP_DONE_HINT[prev]} 열려요</span></div>;
          return <Link key={m.key} to={`/unit/${u.id}/${paths[m.key]}`} className={`tile ${isDone ? 'done' : m.key === next ? 'next' : ''}`}><b>{i + 1}. {m.label} {isDone && <span className="green">✓</span>}{!isDone && isHw && <span className="badge red" style={{ marginLeft: 4 }}>숙제</span>}</b><span className="muted">{m.desc}</span></Link>;
        })}
      </div>
    </div>
  );
}

export { unitLabel };
