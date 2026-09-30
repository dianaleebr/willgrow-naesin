import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { listUnits, getUnit, MATERIALS, myRanges } from '../../lib/api.js';
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
  const st = useAsync(() => getUnit(unitId), [unitId]);
  if (st.loading) return <Loading />;
  if (st.error) return <ErrorBox error={st.error} />;
  const u = st.data;
  const paths = { words: 'words', word_test: 'word-test', dialogue: 'dialogue', dialogue_blank: 'dialogue-blank', reading: 'reading', reading_blank: 'reading-blank', exam: 'exam' };
  return (
    <div className="stack">
      <div><div className="muted small">{u.publishers?.name} · {gradeLabel(u)}</div><h1>{u.unit_no >= 90 ? '' : `Lesson ${u.unit_no} `}{u.title}</h1></div>
      <div className="grid2">
        {MATERIALS.map((m) => (
          <Link key={m.key} to={`/unit/${u.id}/${paths[m.key]}`} className="tile"><b>{m.label}</b><span className="muted">{m.desc}</span></Link>
        ))}
      </div>
    </div>
  );
}

export { unitLabel };
