import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { myRanges, rangeProgress, myHomework, countOpenWrong, liveForClass, dday, materialLabel, DIFF_LABEL, DIFF_ORDER } from '../../lib/api.js';
import { useAsync, Loading, ErrorBox, Progress, Empty, unitLabel } from '../../components/ui.jsx';

export default function Home() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [live, setLive] = useState(null);

  const st = useAsync(async () => {
    const [ranges, hw, wrong] = await Promise.all([myRanges(profile), myHomework(profile.class_name), countOpenWrong()]);
    const progress = ranges.length ? await rangeProgress(ranges[0].id, profile.id) : [];
    return { ranges, hw, wrong, progress: progress?.[0] || null };
  }, [profile.id]);

  // 수업 모드: 선생님이 "지금 풀 자료"를 지정하면 10초 안에 뜸
  useEffect(() => {
    let t; const poll = async () => { try { setLive(await liveForClass(profile.class_name)); } catch {} t = setTimeout(poll, 10000); };
    poll(); return () => clearTimeout(t);
  }, [profile.class_name]);

  const materialPath = (unitId, material, difficulty) => {
    const map = { words: 'words', word_test: 'word-test', dialogue: 'dialogue', dialogue_blank: 'dialogue-blank', reading: 'reading', reading_blank: 'reading-blank', reading_analysis: 'reading-analysis', exam: 'exam' };
    return `/unit/${unitId}/${map[material] || material}${difficulty ? `?difficulty=${difficulty}` : ''}`;
  };

  if (st.loading) return <Loading />;
  if (st.error) return <ErrorBox error={st.error} />;
  const { ranges, hw, wrong, progress } = st.data;
  const range = ranges[0];
  const d = range ? dday(range.exam_date) : null;

  return (
    <div className="stack">
      <div>
        <h1>{profile.name}</h1>
        <div className="muted">{profile.school} {profile.grade ? `${profile.level || '중'}${profile.grade}` : ''} · {profile.class_name} · {profile.publisher_name || '출판사 미지정'} · <button className="btn ghost sm" style={{ padding: '2px 8px', minHeight: 0 }} onClick={() => nav('/password')}>비밀번호 바꾸기</button></div>
      </div>

      {live && (
        <div className="card red">
          <div className="row between">
            <div><b>지금 수업 자료</b><div className="small">{unitLabel(live.units)} · {materialLabel(live.material)}{live.difficulty ? ` (${DIFF_LABEL[live.difficulty]})` : ''}</div></div>
            <button className="btn primary" onClick={() => nav(materialPath(live.unit_id, live.material, live.difficulty) + (live.difficulty ? '&' : '?') + 'mode=class')}>바로 풀기</button>
          </div>
        </div>
      )}

      {range ? (
        <div className="card">
          <div className="row between">
            <div><div className="muted small">내 시험범위</div><h2 style={{ margin: 0 }}>{range.title}</h2></div>
            {d != null && <span className={`badge ${d <= 7 ? 'red' : ''}`} style={{ fontSize: 15, padding: '4px 12px' }}>{d > 0 ? `D-${d}` : d === 0 ? 'D-Day' : `D+${-d}`}</span>}
          </div>
          {range.exam_date && <div className="muted small">시험일 {range.exam_date}{range.exam_years ? ` · 기출 ${range.exam_years.join('·')}` : ''}</div>}
          {progress && (
            <div className="stack mt">
              <Progress label="단어테스트" pct={progress.word_pct} sub={`${progress.word_done}/${progress.word_total}`} />
              <Progress label="대화문 빈칸" pct={progress.dialogue_pct} sub={`${progress.dialogue_done}/${progress.dialogue_total}`} />
              <Progress label="본문 빈칸" pct={progress.reading_pct} sub={`${progress.reading_done}/${progress.reading_total}`} />
              {progress.reading_by_diff && Object.keys(progress.reading_by_diff).length > 1 && (
                <div className="row small muted" style={{ gap: 10 }}>{DIFF_ORDER.filter((k) => progress.reading_by_diff[k]).map((k) => <span key={k}>{DIFF_LABEL[k]} <b className="en">{progress.reading_by_diff[k].pct}%</b></span>)}</div>
              )}
              <Progress label="기출문제 풀이" pct={progress.exam_pct} sub={`정답률 ${progress.exam_accuracy}%`} />
            </div>
          )}
          <div className="row mt">
            <Link className="btn primary grow" to="/units">범위 학습하러 가기 →</Link>
          </div>
        </div>
      ) : (
        <Empty>아직 배정된 시험범위가 없어요. <Link to="/units" className="red">유닛 목록에서 학습하기 →</Link></Empty>
      )}

      <div className="grid2">
        <Link to="/wrong" className="tile"><b>오답노트</b><span className={wrong ? 'red' : 'muted'}>{wrong ? `남은 오답 ${wrong}개` : '남은 오답 없음'}</span></Link>
        <Link to="/units" className="tile"><b>유닛 학습</b><span className="muted">단어·대화문·본문·기출</span></Link>
      </div>

      <div>
        <h2>오늘의 숙제</h2>
        {hw.length === 0 ? <Empty>배정된 숙제가 없어요</Empty> : (
          <div className="list">
            {hw.map((h) => {
              const done = (h.homework_completions || []).some((c) => c.student_id === profile.id);
              const dd = dday(h.due_date);
              return (
                <Link key={h.id} to={materialPath(h.unit_id, h.material, h.difficulty)} className="item">
                  
                  <div className="grow">
                    <b>{materialLabel(h.material)}{h.difficulty ? ` · ${DIFF_LABEL[h.difficulty]}` : ''}</b>
                    <div className="muted small">{unitLabel(h.units)}{h.note ? ` · ${h.note}` : ''}</div>
                  </div>
                  <span className={`badge ${done ? 'green' : dd <= 1 ? 'red' : ''}`}>{done ? '완료' : dd === 0 ? '오늘 마감' : `D-${dd}`}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
