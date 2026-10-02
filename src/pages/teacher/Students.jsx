import { useState } from 'react';
import { supabase, unwrap, rpc } from '../../lib/supabase.js';
import { listPublishers } from '../../lib/api.js';
import { useAsync, Loading, ErrorBox, Empty } from '../../components/ui.jsx';
import { useAuth } from '../../lib/auth.jsx';

const HEAD = ['이름', '학교', '학년', '반', '아이디', '초기 비밀번호', '출판사(선택)'];
const EMPTY = { name: '', school: '', grade: '', class_name: '', login_id: '', password: '1234', publisher_id: '' };
// 학년: "중1"~"고3" 한 칸으로 고름 → profiles.level('중'|'고') + grade(1~3)
export const GRADE_OPTS = ['중1', '중2', '중3', '고1', '고2', '고3'];
export const gradeKey = (level, grade) => (grade ? `${level || '중'}${grade}` : '');
export const splitGrade = (k) => (k ? { level: k[0], grade: Number(k[1]) } : { level: '중', grade: null });
const GradeSelect = ({ value, onChange, style }) => <select className="input" value={value} onChange={onChange} style={style}><option value="">-</option>{GRADE_OPTS.map((g) => <option key={g} value={g}>{g}</option>)}</select>;

// 한 명씩 입력해서 바로 계정 만들기
function SingleForm({ pubs, onCreated }) {
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const idOk = /^[a-z0-9_.-]{2,30}$/i.test(f.login_id.trim());
  const ready = f.name.trim() && idOk && f.password.length >= 4;

  const submit = async (e) => {
    e.preventDefault(); if (!ready || busy) return;
    setBusy(true); setMsg(null);
    try {
      const g = splitGrade(f.grade);
      const uid = await rpc('create_student_account', {
        p_login_id: f.login_id.trim().toLowerCase(), p_password: f.password, p_name: f.name.trim(),
        p_school: f.school.trim() || null, p_grade: g.grade,
        p_class_name: f.class_name.trim() || null, p_publisher_id: f.publisher_id ? Number(f.publisher_id) : null,
        p_role: 'student',
      });
      if (g.grade) await supabase.from('profiles').update({ level: g.level }).eq('id', uid);
      setMsg({ ok: true, text: `${f.name.trim()} 계정을 만들었어요. 아이디 ${f.login_id.trim().toLowerCase()} / 비밀번호 ${f.password}` });
      // 같은 학교·학년·반·출판사는 남겨두고 이름·아이디만 비움 (같은 반 여러 명 연속 입력용)
      setF({ ...f, name: '', login_id: '' });
      onCreated();
    } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <h3>학생 계정 만들기</h3>
      <div className="row" style={{ gap: 8 }}>
        <label className="stack" style={{ gap: 4, flex: '1 1 120px' }}><span className="muted small">이름 *</span><input className="input" value={f.name} onChange={set('name')} autoComplete="off" /></label>
        <label className="stack" style={{ gap: 4, flex: '1 1 120px' }}><span className="muted small">아이디 *</span><input className="input mono" value={f.login_id} onChange={set('login_id')} autoComplete="off" placeholder="영문·숫자" /></label>
        <label className="stack" style={{ gap: 4, flex: '1 1 100px' }}><span className="muted small">비밀번호 *</span><input className="input mono" value={f.password} onChange={set('password')} autoComplete="new-password" /></label>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <label className="stack" style={{ gap: 4, flex: '1 1 120px' }}><span className="muted small">학교</span><input className="input" value={f.school} onChange={set('school')} /></label>
        <label className="stack" style={{ gap: 4, flex: '0 1 80px' }}><span className="muted small">학년</span><GradeSelect value={f.grade} onChange={set('grade')} /></label>
        <label className="stack" style={{ gap: 4, flex: '1 1 90px' }}><span className="muted small">반</span><input className="input" value={f.class_name} onChange={set('class_name')} /></label>
        <label className="stack" style={{ gap: 4, flex: '1 1 160px' }}><span className="muted small">출판사(교과서)</span><select className="input" value={f.publisher_id} onChange={set('publisher_id')}><option value="">-</option>{pubs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      </div>
      <div className="row">
        <button type="submit" className="btn primary" disabled={!ready || busy}>{busy ? '만드는 중…' : '계정 만들기'}</button>
        <span className="muted small">{f.login_id && !idOk ? '아이디는 영문·숫자 2~30자' : f.password.length < 4 ? '비밀번호는 4자 이상' : '학교·학년·반·출판사는 다음 학생에게 그대로 남아요'}</span>
      </div>
      {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
    </form>
  );
}

export default function Students() {
  const { profile } = useAuth();
  const st = useAsync(async () => ({
    students: await supabase.from('profiles').select('*, publishers(name)').order('role').order('school').order('grade').order('class_name').order('name').then(unwrap),
    pubs: await listPublishers(),
  }), []);
  const [paste, setPaste] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);

  const parse = () => {
    const lines = paste.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows = lines.map((l) => (l.includes('\t') ? l.split('\t') : l.split(',')).map((c) => c.trim()));
    if (rows[0] && /이름|name/i.test(rows[0][0])) rows.shift();
    return rows.filter((r) => r.length >= 5).map((r) => ({ name: r[0], school: r[1], grade: (r[2] || '').replace(/[^0-9]/g, ''), level: /고/.test(r[2] || '') ? '고' : '중', class_name: r[3], login_id: r[4], password: r[5] || '1234', publisher: /^teacher$/i.test(r[6] || '') ? '' : (r[6] || ''), role: /^teacher$/i.test(r[6] || '') ? 'teacher' : 'student' }));
  };
  const preview = parse();

  const create = async () => {
    if (!preview.length) return;
    setBusy(true); setResult(null);
    try {
      const res = await rpc('bulk_create_students', { p_rows: preview });
      const hi = preview.filter((r) => r.level === '고').map((r) => r.login_id.toLowerCase());
      if (hi.length) await supabase.from('profiles').update({ level: '고' }).in('login_id', hi);
      setResult(res); setPaste(''); st.reload();
    } catch (e) { setResult([{ login_id: '-', ok: false, message: e.message }]); } finally { setBusy(false); }
  };
  const resetPw = async (s) => {
    const pw = prompt(`${s.name} (${s.login_id}) 새 비밀번호 (4자 이상):`, '1234'); if (!pw) return;
    try { await rpc('reset_student_password', { p_user_id: s.id, p_password: pw }); setMsg(`${s.name} 비밀번호를 "${pw}" 로 바꿨어요.`); } catch (e) { setMsg('실패: ' + e.message); }
  };
  const del = async (s) => {
    if (!confirm(`${s.name} (${s.login_id}) 계정과 모든 학습 기록을 삭제할까요? 되돌릴 수 없어요.`)) return;
    try { await rpc('delete_student_account', { p_user_id: s.id }); st.reload(); } catch (e) { setMsg('실패: ' + e.message); }
  };

  if (st.loading && !st.data) return <Loading />; if (st.error) return <ErrorBox error={st.error} />;
  const { students, pubs } = st.data;
  const list = students.filter((s) => !filter || [s.name, s.school, s.class_name, s.login_id].some((v) => (v || '').includes(filter)));

  return (
    <div className="stack">
      <h1>학생 계정</h1>
      <SingleForm pubs={pubs} onCreated={() => st.reload()} />
      <div className="card stack">
        <div className="row between"><h3>엑셀 붙여넣기로 여러 명 만들기</h3><button className="btn sm" onClick={() => setBulkOpen(!bulkOpen)}>{bulkOpen ? '접기' : '열기'}</button></div>
        {bulkOpen && <>
        <h3>계정 일괄 생성</h3>
        <div className="muted small">엑셀에서 아래 순서의 열을 복사해 붙여넣으세요 (탭 또는 쉼표 구분). 첫 줄이 제목이면 자동으로 건너뜁니다.<br /><b>{HEAD.join(' | ')}</b></div>
        <textarea className="input mono" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'김민준\t거제중\t2\t중2A\tminjun\t1234\t동아(윤정미)\n이서연\t거제중\t2\t중2A\tseoyeon\t1234'} />
        {preview.length > 0 && <div className="tbl-wrap"><table className="tbl"><thead><tr>{HEAD.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{preview.map((r, i) => <tr key={i}><td>{r.name}</td><td>{r.school}</td><td>{r.grade ? `${r.level}${r.grade}` : ''}</td><td>{r.class_name}</td><td className="mono">{r.login_id}</td><td className="mono">{r.password}</td><td>{r.publisher}</td></tr>)}</tbody></table></div>}
        <div className="row"><button className="btn primary" disabled={!preview.length || busy} onClick={create}>{busy ? '생성 중…' : `${preview.length}명 계정 만들기`}</button><span className="muted small">아이디는 영문·숫자만, 비밀번호는 4자 이상</span></div>
        {result && <div className="stack">{result.map((r, i) => <div key={i} className={`alert ${r.ok ? 'ok' : 'err'}`}>{r.login_id}: {r.message}</div>)}</div>}
        </>}
      </div>

      {msg && <div className="alert ok">{msg}</div>}
      <div className="row between"><h2>전체 계정 ({students.length})</h2><input className="input" style={{ width: 200 }} placeholder="이름/학교/반/아이디 검색" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
      {list.length === 0 ? <Empty>학생이 없습니다.</Empty> : (
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>이름</th><th>아이디</th><th>역할</th><th>학교</th><th>학년</th><th>반</th><th>출판사</th><th></th></tr></thead>
          <tbody>{list.map((s) => (
            <StudentRow key={s.id} s={s} pubs={pubs} me={profile.id} onSaved={(m) => { setMsg(m); st.reload(); }} onError={(m) => setMsg(m)} onReset={() => resetPw(s)} onDelete={() => del(s)} />
          ))}</tbody>
        </table></div>
      )}
      <div className="muted small"><b>수정</b>을 누르면 이름·학교·학년·반·출판사·비밀번호를 고칠 수 있고, <b>저장</b>을 눌러야 반영돼요. 선생님 계정을 더 만들려면 위 일괄 생성에 출판사 대신 <b>teacher</b> 라고 적어도 되고, Supabase에서 profiles.role 을 teacher 로 바꿔도 됩니다.</div>
    </div>
  );
}

// 학생 한 줄: 보기 → [수정] → 편집 → [저장]/[취소]
function StudentRow({ s, pubs, me, onSaved, onError, onReset, onDelete }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const start = () => { setF({ name: s.name || '', school: s.school || '', grade: gradeKey(s.level, s.grade), class_name: s.class_name || '', publisher_id: s.publisher_id || '', password: '' }); setEdit(true); };
  const save = async () => {
    if (!f.name.trim()) { onError('이름을 입력하세요.'); return; }
    if (f.password && f.password.length < 4) { onError('비밀번호는 4자 이상이어야 해요.'); return; }
    setBusy(true);
    try {
      const g = splitGrade(f.grade);
      const patch = { name: f.name.trim(), school: f.school.trim() || null, grade: g.grade, level: g.level, class_name: f.class_name.trim() || null, publisher_id: f.publisher_id ? Number(f.publisher_id) : null };
      const { error } = await supabase.from('profiles').update(patch).eq('id', s.id);
      if (error) throw new Error(error.message);
      if (f.password) await rpc('reset_student_password', { p_user_id: s.id, p_password: f.password });
      setEdit(false); onSaved(`${patch.name} 저장했어요.${f.password ? ` (비밀번호 "${f.password}")` : ''}`);
    } catch (e) { onError('저장 실패: ' + e.message); } finally { setBusy(false); }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (!edit) return (
    <tr>
      <td><b>{s.name}</b></td>
      <td className="mono">{s.login_id}</td>
      <td>{s.role === 'teacher' ? <span className="badge red">선생님</span> : '학생'}</td>
      <td>{s.school || '-'}</td>
      <td>{gradeKey(s.level, s.grade) || '-'}</td>
      <td>{s.class_name || '-'}</td>
      <td>{s.publishers?.name || '-'}</td>
      <td><div className="row" style={{ flexWrap: 'nowrap' }}><button className="btn sm primary" onClick={start}>수정</button><button className="btn sm" onClick={onReset}>비번 초기화</button>{s.id !== me && <button className="btn sm ghost" onClick={onDelete}>삭제</button>}</div></td>
    </tr>
  );
  return (
    <tr style={{ background: 'var(--yellow-soft)' }}>
      <td><input className="input" value={f.name} onChange={set('name')} style={{ width: 90 }} /></td>
      <td className="mono">{s.login_id}<div><input className="input" value={f.password} onChange={set('password')} placeholder="새 비밀번호" style={{ width: 100, marginTop: 4 }} autoComplete="off" /></div></td>
      <td>{s.role === 'teacher' ? <span className="badge red">선생님</span> : '학생'}</td>
      <td><input className="input" value={f.school} onChange={set('school')} style={{ width: 90 }} /></td>
      <td><GradeSelect value={f.grade} onChange={set('grade')} /></td>
      <td><input className="input" value={f.class_name} onChange={set('class_name')} style={{ width: 80 }} placeholder="예: 중2A" /></td>
      <td><select className="input" value={f.publisher_id} onChange={set('publisher_id')}><option value="">-</option>{pubs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
      <td><div className="row" style={{ flexWrap: 'nowrap' }}><button className="btn sm primary" disabled={busy} onClick={save}>{busy ? '저장 중…' : '저장'}</button><button className="btn sm ghost" disabled={busy} onClick={() => setEdit(false)}>취소</button></div></td>
    </tr>
  );
}
