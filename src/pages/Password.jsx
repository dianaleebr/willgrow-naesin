import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, loginEmail } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';

// 내 비밀번호 바꾸기 (학생·선생님 공통) — 현재 비밀번호 확인 후 변경
export default function Password() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [cur, setCur] = useState(''); const [pw1, setPw1] = useState(''); const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null);
  const weak = pw1.length > 0 && (pw1.length < 6 || /^(\d)\1+$/.test(pw1) || /^(1234|0000|1111|password|qwer)/i.test(pw1));
  const ready = cur && pw1.length >= 6 && pw1 === pw2 && !weak && !busy;

  const submit = async (e) => {
    e.preventDefault(); if (!ready) return;
    setBusy(true); setMsg(null);
    try {
      // 1) 현재 비밀번호 확인 (본인 확인)
      const { error: e1 } = await supabase.auth.signInWithPassword({ email: loginEmail(profile.login_id), password: cur });
      if (e1) throw new Error('현재 비밀번호가 맞지 않아요.');
      // 2) 변경
      const { error: e2 } = await supabase.auth.updateUser({ password: pw1 });
      if (e2) throw new Error(e2.message);
      setMsg({ ok: true, text: '비밀번호를 바꿨어요. 다음 로그인부터 새 비밀번호를 쓰세요.' });
      setCur(''); setPw1(''); setPw2('');
    } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <div className="row"><button className="btn sm" onClick={() => nav(-1)}>‹ 뒤로</button><h1 style={{ margin: 0 }}>비밀번호 바꾸기</h1></div>
      <form className="card stack" onSubmit={submit}>
        <div className="muted small">아이디 <b className="mono">{profile?.login_id}</b></div>
        <label className="stack" style={{ gap: 4 }}><span className="muted small">현재 비밀번호</span><input className="input" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></label>
        <label className="stack" style={{ gap: 4 }}><span className="muted small">새 비밀번호 (6자 이상, 1234 같은 쉬운 번호는 안 돼요)</span><input className="input" type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} autoComplete="new-password" /></label>
        <label className="stack" style={{ gap: 4 }}><span className="muted small">새 비밀번호 확인</span><input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></label>
        {weak && <div className="small red">너무 쉬운 비밀번호예요. 영문과 숫자를 섞어 6자 이상으로 만들어 주세요.</div>}
        {pw2 && pw1 !== pw2 && <div className="small red">새 비밀번호가 서로 달라요.</div>}
        {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
        <button type="submit" className="btn primary lg" disabled={!ready}>{busy ? '바꾸는 중…' : '비밀번호 바꾸기'}</button>
        <div className="muted small">비밀번호를 잊으면 선생님께 말씀드리면 다시 정해 주실 수 있어요.</div>
      </form>
    </div>
  );
}
