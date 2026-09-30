import { useState } from 'react';
import { supabase, unwrap } from '../../lib/supabase.js';
import { useAsync, Loading, ErrorBox } from '../../components/ui.jsx';

export default function Settings() {
  const st = useAsync(() => supabase.from('app_settings').select('*').then(unwrap), []);
  const [msg, setMsg] = useState('');
  if (st.loading) return <Loading />; if (st.error) return <ErrorBox error={st.error} />;
  const streak = Number(st.data.find((s) => s.key === 'resolve_streak')?.value ?? 1);
  const setStreak = async (n) => { const { error } = await supabase.from('app_settings').upsert({ key: 'resolve_streak', value: n }); setMsg(error ? error.message : `저장됨: 연속 ${n}번 맞히면 오답 해결`); st.reload(); };
  return (
    <div className="stack">
      <h1>설정</h1>
      <div className="card stack">
        <b>오답노트 해결 기준</b>
        <div className="muted small">오답 재풀이에서 연속으로 몇 번 맞혀야 "해결됨"으로 옮길지 정합니다.</div>
        <div className="row">{[1, 2, 3].map((n) => <button key={n} className={`btn ${streak === n ? 'primary' : ''}`} onClick={() => setStreak(n)}>연속 {n}번</button>)}</div>
        {msg && <div className="alert ok">{msg}</div>}
      </div>
      <div className="card stack">
        <b>채점 규칙 (자동 적용)</b>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          <li>대소문자·문장부호·앞뒤 공백 무시, 연속 공백은 하나로</li>
          <li>축약형은 원형과 같게: I'm = I am, don't = do not, it's = it is …</li>
          <li>정답 칸에 "a / b" 로 쓰면 둘 다 정답</li>
          <li>영→한 뜻 테스트: 띄어쓰기 무시, 여러 뜻 중 하나만 맞아도 정답</li>
          <li>객관식은 번호로 채점, 철자 오류는 오답</li>
        </ul>
      </div>
    </div>
  );
}
